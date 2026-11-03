-- ========================================================
-- Script Setup Database Produksi K3VA di Supabase
-- Buka Supabase -> Masuk project kamu -> SQL Editor -> Tempel ini & Run
-- ========================================================

-- 1. Buat tabel app_state untuk menyimpan data produksi
CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Aktifkan Row Level Security (RLS) dan izinkan baca/tulis
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read" ON app_state;
CREATE POLICY "Allow anon read" ON app_state
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon update" ON app_state;
CREATE POLICY "Allow anon update" ON app_state
  FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon insert" ON app_state;
CREATE POLICY "Allow anon insert" ON app_state
  FOR INSERT TO anon WITH CHECK (true);

-- 3. Masukkan data awal (termasuk data input yang sudah ada sebelumnya)
INSERT INTO app_state (id, data)
VALUES (
  'main',
  '{"version":14,"perBoxes":{},"months":{"reflector:2026-11":{"cells":{"rp-awal-rh":570,"rp-awal-lh":570,"awal-rh":2730,"awal-lh":2730,"inj-6-rh":1929,"inj-6-lh":1929,"vac-6-rh":2190,"vac-6-lh":2190,"ng-6-rh":9,"ng-6-lh":9,"del-7-rh":2010,"del-7-lh":2010}}},"log":[{"t":1793621990091,"user":"anonim","prod":"reflector","ym":"2026-11","key":"awal-rh","old":"","val":270},{"t":1793621990091,"user":"anonim","prod":"reflector","ym":"2026-11","key":"awal-lh","old":"","val":270},{"t":1793621990091,"user":"anonim","prod":"reflector","ym":"2026-11","key":"rp-awal-rh","old":"","val":570},{"t":1793621990091,"user":"anonim","prod":"reflector","ym":"2026-11","key":"rp-awal-lh","old":"","val":570},{"t":1793622017383,"user":"anonim","prod":"reflector","ym":"2026-11","key":"awal-lh","old":270,"val":""},{"t":1793622018365,"user":"anonim","prod":"reflector","ym":"2026-11","key":"awal-rh","old":270,"val":""},{"t":1793622036605,"user":"anonim","prod":"reflector","ym":"2026-11","key":"awal-rh","old":"","val":2730},{"t":1793622036605,"user":"anonim","prod":"reflector","ym":"2026-11","key":"awal-lh","old":"","val":2730},{"t":1793622066935,"user":"anonim","prod":"reflector","ym":"2026-11","key":"inj-6-rh","old":"","val":1929},{"t":1793622066944,"user":"anonim","prod":"reflector","ym":"2026-11","key":"inj-6-lh","old":"","val":1929},{"t":1793622076910,"user":"anonim","prod":"reflector","ym":"2026-11","key":"vac-6-rh","old":"","val":2190},{"t":1793622076917,"user":"anonim","prod":"reflector","ym":"2026-11","key":"vac-6-lh","old":"","val":2190},{"t":1793622083953,"user":"anonim","prod":"reflector","ym":"2026-11","key":"ng-6-rh","old":"","val":9},{"t":1793622083961,"user":"anonim","prod":"reflector","ym":"2026-11","key":"ng-6-lh","old":"","val":9},{"t":1793622100182,"user":"anonim","prod":"reflector","ym":"2026-11","key":"del-7-rh","old":"","val":2010},{"t":1793622100196,"user":"anonim","prod":"reflector","ym":"2026-11","key":"del-7-lh","old":"","val":2010},{"t":1793622104329,"user":"anonim","prod":"reflector","ym":"2026-11","key":"del-7-lh","old":2010,"val":1010},{"t":1793622110134,"user":"anonim","prod":"reflector","ym":"2026-11","key":"del-7-lh","old":1010,"val":2010}]}'::JSONB
)
ON CONFLICT (id) DO NOTHING;
