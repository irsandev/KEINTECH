const { createClient } = require('@supabase/supabase-js');

const PRODUCTS = [
  { id: 'reflector', menu: 'Reflector', name: 'REFLECTOR K3VA' },
  { id: 'housing-low', menu: 'Housing Low', name: 'HOUSING LOW' },
  { id: 'housing-high', menu: 'Housing High', name: 'HOUSING HIGH' },
];
const PID = new Set(PRODUCTS.map(p => p.id));
const DEFAULT_PERBOX = 30;
const LOG_MAX = 8000;
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const NUM_KEY = /^((inj|vac|ng|del)-(\d{1,2})-(rh|lh)|awal-(rh|lh)|rp-awal-(rh|lh)|sor-\d{1,3}-(rh|lh))$/;
const TXT_KEY = /^(rem-\d{1,2}|sor-\d{1,3}-(tgl|rem))$/;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL dan SUPABASE_KEY belum diisi di Environment Variables!');
  }
  return createClient(url, key);
}

async function loadDb(supabase) {
  const { data, error } = await supabase
    .from('app_state')
    .select('data')
    .eq('id', 'main')
    .single();

  if (error || !data || !data.data) {
    return { version: 0, perBoxes: {}, months: {}, log: [] };
  }
  const db = Object.assign({ version: 0, perBoxes: {}, months: {}, log: [] }, data.data);
  return db;
}

async function saveDb(supabase, db) {
  const { error } = await supabase
    .from('app_state')
    .upsert({ id: 'main', data: db, updated_at: new Date().toISOString() });
  if (error) throw error;
}

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
const perBox = (prod, db) => (db.perBoxes && db.perBoxes[prod]) || DEFAULT_PERBOX;
const cellsOf = (prod, ym, db) => (((db.months || {})[prod + ':' + ym] || {}).cells) || {};

function sumSide(cells, prefix, side, dim) {
  let t = 0;
  for (let d = 1; d <= dim; d++) t += num(cells[`${prefix}-${d}-${side}`]);
  return t;
}

function closing(prod, ym, db, depth = 0) {
  if (depth > 36) return { fg: { rh: 0, lh: 0 }, rp: { rh: 0, lh: 0 } };
  const c = cellsOf(prod, ym, db), dim = daysIn(ym);
  let prev = null;
  const getPrev = () => prev || (prev = closing(prod, prevYm(ym), db, depth + 1));
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

function monthPayload(prod, ym, db) {
  return {
    version: db.version,
    perBox: perBox(prod, db),
    cells: cellsOf(prod, ym, db),
    prevClosing: closing(prod, prevYm(ym), db)
  };
}

function applyCell(prod, ym, key, val, user, db) {
  const mk = prod + ':' + ym;
  if (!db.months) db.months = {};
  const mo = db.months[mk] || (db.months[mk] = { cells: {} });
  const old = mo.cells[key];
  if (old === val) return false;
  if (val === undefined) delete mo.cells[key]; else mo.cells[key] = val;
  if (!db.log) db.log = [];
  db.log.push({ t: Date.now(), user, prod, ym, key, old: old === undefined ? '' : old, val: val === undefined ? '' : val });
  if (db.log.length > LOG_MAX) db.log.splice(0, db.log.length - LOG_MAX);
  return true;
}

const cleanUser = u => String(u || '?').slice(0, 40);

function csv(prod, ym, db) {
  const c = cellsOf(prod, ym, db);
  const rows = [['TGL', 'INJ RH', 'INJ LH', 'VACUUM RH', 'VACUUM LH', 'NG RH', 'NG LH', 'REMARK', 'DELIVERY RH', 'DELIVERY LH']];
  for (let d = 1; d <= daysIn(ym); d++) {
    const g = k => (c[k] === undefined ? '' : c[k]);
    const rem = String(g('rem-' + d)).replace(/"/g, '""');
    rows.push([d, g(`inj-${d}-rh`), g(`inj-${d}-lh`), g(`vac-${d}-rh`), g(`vac-${d}-lh`),
      g(`ng-${d}-rh`), g(`ng-${d}-lh`), `"${rem}"`, g(`del-${d}-rh`), g(`del-${d}-lh`)]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      if (typeof req.body === 'object') return resolve(req.body);
      try { return resolve(JSON.parse(req.body)); } catch (e) { return resolve({}); }
    }
    let s = '';
    req.on('data', ch => { s += ch; if (s.length > 50000) { reject(new Error('Payload too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { resolve({}); } });
    req.on('error', reject);
  });
}

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, extra));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function authorized(req) {
  const password = process.env.APP_PASSWORD || '';
  if (!password) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const pass = Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':');
  return pass === password;
}

module.exports = async (req, res) => {
  if (!authorized(req)) {
    return send(res, 401, 'Password diperlukan', 'text/plain; charset=utf-8',
      { 'WWW-Authenticate': 'Basic realm="Produksi K3VA"' });
  }

  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    if (req.method === 'GET' && p === '/api/products') {
      return send(res, 200, PRODUCTS);
    }

    const supabase = getSupabase();
    const db = await loadDb(supabase);

    if (req.method === 'GET' && p === '/api/backup') {
      const d = new Date(), pad = n => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
      return send(res, 200, JSON.stringify(db), 'application/json; charset=utf-8', {
        'Content-Disposition': `attachment; filename="backup-produksi-${stamp}.json"`
      });
    }

    let m;
    if (req.method === 'GET' && (m = p.match(/^\/api\/month\/([a-z-]+)\/(\d{4}-\d{2})$/)) && PID.has(m[1]) && YM_RE.test(m[2])) {
      if (url.searchParams.get('since') === String(db.version)) {
        return send(res, 200, { unchanged: true, version: db.version });
      }
      return send(res, 200, monthPayload(m[1], m[2], db));
    }

    if (req.method === 'GET' && (m = p.match(/^\/api\/log\/([a-z-]+)\/(\d{4}-\d{2})$/)) && PID.has(m[1]) && YM_RE.test(m[2])) {
      const logs = (db.log || []).filter(l => l.prod === m[1] && l.ym === m[2]).slice(-300).reverse();
      return send(res, 200, logs);
    }

    if (req.method === 'GET' && (m = p.match(/^\/api\/export\/([a-z-]+)\/(\d{4}-\d{2})\.csv$/)) && PID.has(m[1]) && YM_RE.test(m[2])) {
      return send(res, 200, csv(m[1], m[2], db), 'text/csv; charset=utf-8', {
        'Content-Disposition': `attachment; filename="produksi-${m[1]}-${m[2]}.csv"`
      });
    }

    if (req.method === 'POST' && p === '/api/cell') {
      const b = await parseBody(req);
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

      if (applyCell(b.prod, b.ym, b.key, val, cleanUser(b.user), db)) {
        db.version = (db.version || 0) + 1;
        await saveDb(supabase, db);
      }
      return send(res, 200, { version: db.version, value: val === undefined ? '' : val });
    }

    if (req.method === 'POST' && p === '/api/stock') {
      const b = await parseBody(req);
      if (!PID.has(b.prod)) return send(res, 400, { error: 'produk tidak valid' });
      if (!YM_RE.test(b.ym || '')) return send(res, 400, { error: 'bulan tidak valid' });
      if (b.mode !== 'awal' && b.mode !== 'aktual') return send(res, 400, { error: 'mode tidak valid' });
      const c = cellsOf(b.prod, b.ym, db), dim = daysIn(b.ym), user = cleanUser(b.user);
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
      for (const [k, v] of plan) if (applyCell(b.prod, b.ym, k, v, user, db)) changed = true;
      if (changed) {
        db.version = (db.version || 0) + 1;
        await saveDb(supabase, db);
      }
      return send(res, 200, monthPayload(b.prod, b.ym, db));
    }

    if (req.method === 'POST' && p === '/api/perbox') {
      const b = await parseBody(req);
      const n = Number(b.value);
      if (!PID.has(b.prod) || !(n > 0 && n < 100000)) return send(res, 400, { error: 'tidak valid' });
      if (!db.perBoxes) db.perBoxes = {};
      db.perBoxes[b.prod] = n;
      db.version = (db.version || 0) + 1;
      await saveDb(supabase, db);
      return send(res, 200, { version: db.version });
    }

    send(res, 404, { error: 'Endpoint tidak ditemukan' });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
};
