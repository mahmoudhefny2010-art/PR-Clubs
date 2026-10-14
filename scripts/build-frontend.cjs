// Dependency-free, deterministic assembly. Checked-in assets keep deployment unchanged.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = require('../frontend/styles/manifest.json');
const check = process.argv.includes('--check');
const css = manifest.sources.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('');
const assets = [
  [manifest.output, Buffer.from(css)],
  ['public/assets/vendor/exceljs.min.js', fs.readFileSync(require.resolve('exceljs/dist/exceljs.min.js'))],
  ['public/assets/vendor/exceljs.LICENSE', fs.readFileSync(path.join(path.dirname(require.resolve('exceljs/package.json')), 'LICENSE'))]
];
for (const [file, bytes] of assets) {
  const destination = path.join(root, file);
  if (check) {
    if (!fs.existsSync(destination) || !fs.readFileSync(destination).equals(bytes)) {
      throw new Error(`${file} is out of date. Run npm run build:frontend.`);
    }
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (!fs.existsSync(destination) || !fs.readFileSync(destination).equals(bytes)) fs.writeFileSync(destination, bytes);
  }
}
console.log(`Frontend assets ${check ? 'verified' : 'assembled'}: CSS cascade and installed ExcelJS browser distribution.`);
