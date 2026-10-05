const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

// Only append to the same representation (ETag/Last-Modified + If-Range).
async function downloadAudio(url, destination, headers, validate, { attempts = 3, timeoutMs = 90_000 } = {}) {
  const partial = `${destination}.part`;
  const metadata = `${partial}.json`;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let offset = 0, saved = {};
    try { saved = JSON.parse(await fsp.readFile(metadata, 'utf8')); offset = (await fsp.stat(partial)).size; } catch {}
    if (!saved.validator || saved.url !== url) offset = 0;
    try {
      const response = await fetch(url, { headers: { ...headers,
        ...(offset ? { Range: `bytes=${offset}-`, 'If-Range': saved.validator } : {}) },
        signal: AbortSignal.timeout(timeoutMs) });
      if (response.status === 416) {
        await fsp.rm(metadata, { force: true });
        throw new Error('Intervalo desatualizado; reiniciando download.');
      }
      if (!response.ok) {
        const error = new Error(`Download falhou (${response.status}).`);
        error.terminal = response.status < 500 && response.status !== 429;
        throw error;
      }
      const range = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      const append = offset > 0 && response.status === 206 && range && Number(range[1]) === offset;
      if (response.status === 206 && !append) {
        await fsp.rm(metadata, { force: true });
        throw new Error('Resposta parcial inválida.');
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !/audio\/|application\/octet-stream/i.test(contentType)) {
        const error = new Error('O servidor não retornou um arquivo de áudio.'); error.terminal = true; throw error;
      }
      const validator = response.headers.get('etag') || response.headers.get('last-modified') || '';
      await fsp.writeFile(metadata, JSON.stringify({ url, validator }));
      const expected = append ? Number(range[3]) : Number(response.headers.get('content-length'));
      if (!response.body) throw new Error('Resposta de áudio vazia.');
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial, { flags: append ? 'a' : 'w' }));
      const size = (await fsp.stat(partial)).size;
      if ((expected > 0 && size !== expected) || !(await validate(partial))) {
        await fsp.rm(metadata, { force: true });
        throw new Error('Arquivo de áudio incompleto ou inválido.');
      }
      await fsp.rename(partial, destination);
      await fsp.rm(metadata, { force: true });
      return destination;
    } catch (error) {
      lastError = error;
      if (error.terminal) throw error;
      if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

module.exports = { downloadAudio };
