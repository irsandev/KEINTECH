// Opsional: isi data contoh Reflector September 2026 (dari catatan Excel). Jalankan SEBELUM server dipakai:
//   node seed-sept-2026.js
const fs = require('fs'), path = require('path');
const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
const file = path.join(dir, 'data.json');
if (fs.existsSync(file)) { console.log('data.json sudah ada, seed dibatalkan.'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const c = { 'awal-rh': 4470, 'awal-lh': 4470 };
const put = (p, d, v) => { c[`${p}-${d}-rh`] = v; c[`${p}-${d}-lh`] = v; };
put('inj', 1, 1899); put('inj', 2, 2410); put('inj', 3, 570);
put('vac', 1, 1890); put('vac', 2, 2400);
put('ng', 1, 9); put('ng', 2, 10);
put('del', 1, 2010); put('del', 2, 2010); put('del', 5, 2010);
fs.writeFileSync(file, JSON.stringify({ version: 1, perBoxes: { reflector: 30 }, months: { 'reflector:2026-09': { cells: c } }, log: [] }));
console.log('Seed Reflector September 2026 dibuat di', file);
