// Server Catatan Produksi K3VA — tanpa dependency, hanya Node.js (v18+).
// Data disimpan di satu file JSON. Opsional: APP_PASSWORD untuk password sederhana.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'data.json');
const PASSWORD = process.env.APP_PASSWORD || '';
const LOG_MAX = 8000;

// Daftar produk / menu. Mau ganti nama atau tambah produk? Edit di sini lalu restart server.
const PRODUCTS = [
  { id: 'reflector', menu: 'Reflector', name: 'REFLECTOR K3VA' },
  { id: 'housing-low', menu: 'Housing Low', name: 'HOUSING LOW' },
  { id: 'housing-high', menu: 'Housing High', name: 'HOUSING HIGH' },
];
const PID = new Set(PRODUCTS.map(p => p.id));
const DEFAULT_PERBOX = 30;

fs.mkdirSync(DATA_DIR, { recursive: true });

let db = { version: 0, perBoxes: {}, months: {}, log: [] };
try {
  db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8')));
  // migrasi dari versi 1 (satu produk saja = reflector)
  for (const k of Object.keys(db.months)) {
    if (/^\d{4}-\d{2}$/.test(k)) { db.months['reflector:' + k] = db.months[k]; delete db.months[k]; }
  }
  if (typeof db.perBox === 'number') { db.perBoxes.reflector = db.perBox; delete db.perBox; }
  db.log.forEach(l => { if (!l.prod) l.prod = 'reflector'; });
} catch (e) { /* file belum ada: mulai kosong */ }

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const NUM_KEY = /^((inj|vac|ng|del)-(\d{1,2})-(rh|lh)|awal-(rh|lh)|rp-awal-(rh|lh)|sor-\d{1,3}-(rh|lh))$/;
const TXT_KEY = /^(rem-\d{1,2}|sor-\d{1,3}-(tgl|rem))$/;

function validKey(key) {
  if (NUM_KEY.test(key)) {
    const m = key.match(/^(?:inj|vac|ng|del)-(\d{1,2})-/);
    if (m && (+m[1] < 1 || +m[1] > 31)) return null;
    return 'num';
  }
  if (TXT_KEY.test(key)) {
    const m = key.match(/^rem-(\d{1,2})$/);
    if (m && (+m[1] < 1 || +m[1] > 31)) return null;
    return 'txt';
  }
  return null;
}

const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
const daysIn = ym => new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate();
const prevYm = ym => {
  let y = +ym.slice(0, 4), m = +ym.slice(5) - 1;
  if (m < 1) { m = 12; y--; }
  return y + '-' + String(m).padStart(2, '0');
};
const perBox = prod => db.perBoxes[prod] || DEFAULT_PERBOX;
const cellsOf = (prod, ym) => ((db.months[prod + ':' + ym] || {}).cells) || {};

function sumSide(cells, prefix, side, dim) {
  let t = 0;
  for (let d = 1; d <= dim; d++) t += num(cells[`${prefix}-${d}-${side}`]);
  return t;
}

// Stok akhir bulan:
//   finish good = stok awal + total vacuum - total delivery
//   rawpart     = rawpart awal + total injection - total vacuum - NG
// Stok awal diambil dari isian manual, kalau kosong dari stok akhir bulan sebelumnya.
function closing(prod, ym, depth = 0) {
  if (depth > 36) return { fg: { rh: 0, lh: 0 }, rp: { rh: 0, lh: 0 } };
  const c = cellsOf(prod, ym), dim = daysIn(ym);
  let prev = null;
  const getPrev = () => prev || (prev = closing(prod, prevYm(ym), depth + 1));
  const out = { fg: {}, rp: {} };
  for (const s of ['rh', 'lh']) {
    const fa = c['awal-' + s] !== undefined ? num(c['awal-' + s]) : getPrev().fg[s];
    const ra = c['rp-awal-' + s] !== undefined ? num(c['rp-awal-' + s]) : getPrev().rp[s];
    const inj = sumSide(c, 'inj', s, dim), vac = sumSide(c, 'vac', s, dim);
    const ng = sumSide(c, 'ng', s, dim), del = sumSide(c, 'del', s, dim);
    out.fg[s] = fa + vac - del;
    out.rp[s] = ra + inj - vac - ng;
  }
  return out;
}

function monthPayload(prod, ym) {
  return { version: db.version, perBox: perBox(prod), cells: cellsOf(prod, ym), prevClosing: closing(prod, prevYm(ym)) };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', ch => { s += ch; if (s.length > 20000) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
  });
}

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, extra));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function authorized(req) {
  if (!PASSWORD) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const pass = Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':');
  return pass === PASSWORD;
}

// ubah satu sel (di memori) + catat riwayat. Return true kalau berubah.
function applyCell(prod, ym, key, val, user) {
  const mk = prod + ':' + ym;
  const mo = db.months[mk] || (db.months[mk] = { cells: {} });
  const old = mo.cells[key];
  if (old === val) return false;
  if (val === undefined) delete mo.cells[key]; else mo.cells[key] = val;
  db.log.push({ t: Date.now(), user, prod, ym, key, old: old === undefined ? '' : old, val: val === undefined ? '' : val });
  if (db.log.length > LOG_MAX) db.log.splice(0, db.log.length - LOG_MAX);
  return true;
}
const cleanUser = u => String(u || '?').slice(0, 40);

function csv(prod, ym) {
  const c = cellsOf(prod, ym);
  const rows = [['TGL', 'INJ RH', 'INJ LH', 'VACUUM RH', 'VACUUM LH', 'NG RH', 'NG LH', 'REMARK', 'DELIVERY RH', 'DELIVERY LH']];
  for (let d = 1; d <= daysIn(ym); d++) {
    const g = k => (c[k] === undefined ? '' : c[k]);
    const rem = String(g('rem-' + d)).replace(/"/g, '""');
    rows.push([d, g(`inj-${d}-rh`), g(`inj-${d}-lh`), g(`vac-${d}-rh`), g(`vac-${d}-lh`),
      g(`ng-${d}-rh`), g(`ng-${d}-lh`), `"${rem}"`, g(`del-${d}-rh`), g(`del-${d}-lh`)]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

const server = http.createServer(async (req, res) => {
  if (!authorized(req)) {
    return send(res, 401, 'Password diperlukan', 'text/plain; charset=utf-8',
      { 'WWW-Authenticate': 'Basic realm="Produksi K3VA"' });
  }
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && p === '/api/products') return send(res, 200, PRODUCTS);
    if (req.method === 'GET' && p === '/api/backup') {
      const d = new Date(), pad = n => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
      return send(res, 200, JSON.stringify(db), 'application/json; charset=utf-8', { 'Content-Disposition': `attachment; filename="backup-produksi-${stamp}.json"` });
    }

    let m;
    if (req.method === 'GET' && (m = p.match(/^\/api\/month\/([a-z-]+)\/(\d{4}-\d{2})$/)) && PID.has(m[1]) && YM_RE.test(m[2])) {
      if (url.searchParams.get('since') === String(db.version)) return send(res, 200, { unchanged: true, version: db.version });
      return send(res, 200, monthPayload(m[1], m[2]));
    }
    if (req.method === 'GET' && (m = p.match(/^\/api\/log\/([a-z-]+)\/(\d{4}-\d{2})$/)) && PID.has(m[1]) && YM_RE.test(m[2])) {
      return send(res, 200, db.log.filter(l => l.prod === m[1] && l.ym === m[2]).slice(-300).reverse());
    }
    if (req.method === 'GET' && (m = p.match(/^\/api\/export\/([a-z-]+)\/(\d{4}-\d{2})\.csv$/)) && PID.has(m[1]) && YM_RE.test(m[2])) {
      return send(res, 200, csv(m[1], m[2]), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="produksi-${m[1]}-${m[2]}.csv"` });
    }

    if (req.method === 'POST' && p === '/api/cell') {
      const b = await readBody(req);
      if (!PID.has(b.prod)) return send(res, 400, { error: 'produk tidak valid' });
      if (!YM_RE.test(b.ym || '')) return send(res, 400, { error: 'bulan tidak valid' });
      const kind = validKey(String(b.key || ''));
      if (!kind) return send(res, 400, { error: 'kolom tidak valid' });
      let val = b.value;
      if (val === '' || val === null || val === undefined) val = undefined;
      else if (kind === 'num') {
        val = Number(String(val).replace(',', '.'));
        if (!isFinite(val)) return send(res, 400, { error: 'harus angka' });
      } else val = String(val).slice(0, 200);
      if (applyCell(b.prod, b.ym, b.key, val, cleanUser(b.user))) { db.version++; save(); }
      return send(res, 200, { version: db.version, value: val === undefined ? '' : val });
    }

    // Input stok terakhir sekaligus (tanpa input satu-satu).
    //  mode "aktual": angka = stok nyata SEKARANG (setelah data bulan ini yang sudah terinput);
    //                 stok awal bulan dihitung mundur otomatis.
    //  mode "awal"  : angka = stok awal bulan (sebelum tanggal 1).
    if (req.method === 'POST' && p === '/api/stock') {
      const b = await readBody(req);
      if (!PID.has(b.prod)) return send(res, 400, { error: 'produk tidak valid' });
      if (!YM_RE.test(b.ym || '')) return send(res, 400, { error: 'bulan tidak valid' });
      if (b.mode !== 'awal' && b.mode !== 'aktual') return send(res, 400, { error: 'mode tidak valid' });
      const c = cellsOf(b.prod, b.ym), dim = daysIn(b.ym), user = cleanUser(b.user);
      const plan = [];
      for (const g of ['fg', 'rp']) {
        for (const s of ['rh', 'lh']) {
          const raw = b[g] && b[g][s];
          if (raw === '' || raw === null || raw === undefined) continue;
          const n = Number(String(raw).replace(',', '.'));
          if (!isFinite(n) || Math.abs(n) > 1e8) return send(res, 400, { error: `angka ${g === 'fg' ? 'finish good' : 'rawpart'} ${s.toUpperCase()} tidak valid` });
          let awal = n;
          if (b.mode === 'aktual') {
            const inj = sumSide(c, 'inj', s, dim), vac = sumSide(c, 'vac', s, dim);
            const ng = sumSide(c, 'ng', s, dim), del = sumSide(c, 'del', s, dim);
            awal = g === 'fg' ? n - (vac - del) : n - (inj - vac - ng);
          }
          plan.push([(g === 'fg' ? 'awal-' : 'rp-awal-') + s, r2(awal)]);
        }
      }
      if (!plan.length) return send(res, 400, { error: 'isi minimal satu angka stok' });
      let changed = false;
      for (const [k, v] of plan) if (applyCell(b.prod, b.ym, k, v, user)) changed = true;
      if (changed) { db.version++; save(); }
      return send(res, 200, monthPayload(b.prod, b.ym));
    }

    if (req.method === 'POST' && p === '/api/perbox') {
      const b = await readBody(req);
      const n = Number(b.value);
      if (!PID.has(b.prod) || !(n > 0 && n < 100000)) return send(res, 400, { error: 'tidak valid' });
      db.perBoxes[b.prod] = n; db.version++; save();
      return send(res, 200, { version: db.version });
    }
    send(res, 404, { error: 'tidak ditemukan' });
  } catch (e) {
    send(res, 400, { error: String(e.message || e) });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Produksi K3VA jalan di http://localhost:${PORT}  (data: ${FILE})`));
