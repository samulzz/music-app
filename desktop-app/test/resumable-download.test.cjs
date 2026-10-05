const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { downloadAudio } = require('../src/resumable-download.cjs');

async function fixture(t, handler) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nationmusics-download-test-'));
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (path.dirname(dir) !== os.tmpdir()) throw new Error('Unsafe fixture path');
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { url: `http://127.0.0.1:${server.address().port}/audio`, file: path.join(dir, 'audio.mp3') };
}
test('resumes an interrupted transfer using Range and If-Range', async t => {
  const data = Buffer.alloc(10000, 42); let requested;
  const {url,file} = await fixture(t, (req,res) => {
    requested = req.headers;
    res.writeHead(206, {'Content-Type':'audio/mpeg',ETag:'"v1"','Content-Range':'bytes 4000-9999/10000','Content-Length':6000});
    res.end(data.subarray(4000));
  });
  await fs.writeFile(file + '.part',data.subarray(0,4000));
  await fs.writeFile(file + '.part.json',JSON.stringify({url,validator:'"v1"'}));
  await downloadAudio(url,file,{},async p => (await fs.stat(p)).size === data.length);
  assert.equal(requested.range,'bytes=4000-'); assert.equal(requested['if-range'],'"v1"');
  assert.deepEqual(await fs.readFile(file),data);
});
test('a changed validator causes full replacement, never a mixed file', async t => {
  const data = Buffer.alloc(10000,84);
  const {url,file} = await fixture(t, (_req,res) => {
    res.writeHead(200,{'Content-Type':'audio/mpeg',ETag:'"v2"','Content-Length':data.length}); res.end(data);
  });
  await fs.writeFile(file + '.part', Buffer.alloc(4000,42));
  await fs.writeFile(file + '.part.json',JSON.stringify({url,validator:'"v1"'}));
  await downloadAudio(url,file,{},async () => true);
  assert.deepEqual(await fs.readFile(file),data);
});
test('authentication failure is not retried or published as audio', async t => {
  let calls=0;
  const {url,file}=await fixture(t,(_req,res)=>{calls++;res.writeHead(403);res.end('denied');});
  await assert.rejects(downloadAudio(url,file,{},async()=>true),/403/);
  assert.equal(calls,1); await assert.rejects(fs.stat(file));
});
