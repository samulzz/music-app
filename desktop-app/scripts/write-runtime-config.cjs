const fs = require('node:fs');
const path = require('node:path');

const apiKey = String(process.env.NATIONMUSICS_API_KEY || '').trim();
if (!apiKey) {
  throw new Error('Defina NATIONMUSICS_API_KEY antes de gerar o instalador.');
}

const output = path.join(__dirname, '..', 'src', 'runtime-config.cjs');
fs.writeFileSync(output, `module.exports = ${JSON.stringify({ apiKey })};\n`, 'utf8');
