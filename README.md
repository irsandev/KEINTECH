# Catatan Produksi K3VA: panduan pakai & online

Tanpa framework, tanpa `npm install`. Cuma butuh Node.js (v18 ke atas, download di nodejs.org).
Produk: **Reflector, Housing Low, Housing High** (tab di bagian atas halaman). Data tiap produk terpisah.

---

## 1. Cara pakai harian

1. Pilih tab produk (Reflector / Housing Low / Housing High) dan bulan di bagian atas.
2. Isi **Nama** di bar atas (sekali saja, tersimpan di browser). Nama ini muncul di Riwayat perubahan.
3. Klik kotak lalu ketik angka. `Enter` atau panah bawah pindah ke baris bawah, `Esc` membatalkan ketikan.
   - Isi **RH**, maka **LH ikut terisi** kalau masih kosong (ubah LH manual kalau beda).
   - Mengosongkan kotak = menghapus angka itu.
4. Semua total, stock finish good, rawpart, dan keranjang **dihitung otomatis**. Tidak ada yang perlu diketik.
5. Orang lapangan membuka alamat yang sama dan mengoreksi sendiri. Perubahan muncul di layar lain dalam ±3 detik (kotak berkedip hijau).
6. **Riwayat perubahan** = siapa mengubah apa, kapan, sebelum dan sesudahnya. Jadi tidak perlu lagi tanya ulang soal koreksi.
7. Tombol lain: Export CSV (bulan & produk yang sedang dibuka), Cetak, **Backup** (unduh semua data).

### Input stok terakhir (tanpa input satu-satu)
Tombol biru **Input stok terakhir**:
- **Stok nyata sekarang**: isi hasil hitung di lapangan (finish good dan rawpart, RH/LH). Sistem menghitung mundur stok awal bulan, data harian yang sudah ada tidak berubah.
- **Stok awal bulan**: isi posisi stok sebelum tanggal 1.
- Satuan bisa **pcs** atau **keranjang** (dikali isi per keranjang).
- Kolom yang kosong tidak diubah. Bulan berikutnya otomatis memakai stok akhir bulan ini sebagai stok awal.

### Rumus
- Stock finish good = stok awal + total vacuum − total delivery
- Rawpart = rawpart awal + total injection − total vacuum − NG
- Keranjang = pcs ÷ isi per keranjang (default **30**, bisa diubah per produk di kotak "1 keranjang = … pcs")
- Stok awal bulan = stok akhir bulan lalu (otomatis), kecuali ditimpa manual.
- Angka minus ditampilkan merah (tanda ada data yang belum sinkron).

---

## 2. Jalankan di PC kantor (cara paling mudah)

1. Ekstrak zip, klik 2x `start.bat` (atau jalankan `node server.js`). Biarkan jendelanya terbuka.
2. Buka http://localhost:3000 di PC itu.
3. Dari HP / PC lain di WiFi atau LAN yang sama: buka `http://<IP-PC>:3000`
   (cek IP lewat `ipconfig`, cari "IPv4 Address", misal `192.168.1.20`). Kalau tidak bisa dibuka, izinkan Node.js di Windows Firewall.
4. PC harus menyala selama dipakai. Data ada di `data/data.json`.

Catatan: ini hanya bisa diakses dari jaringan yang sama. Untuk akses dari mana saja, lihat bagian 3.

---

## 3. Biar bisa diakses online

### Opsi A: hosting cloud (disarankan kalau mau dipakai tiap hari)
Contoh: **Railway** (harga yang saya cek di dokumentasi mereka: paket Hobby $5/bulan dengan volume 5 GB, paket Free $1 kredit/bulan dengan volume 0,5 GB. Cek ulang di railway.com sebelum daftar karena bisa berubah).

1. Buat akun GitHub, buat repository **private**, upload isi folder ini (tanpa folder `data`).
2. Daftar di railway.com, **New Project, Deploy from GitHub repo**, pilih repo tadi. Railway membangun dari `Dockerfile`.
3. Buka service, tab **Volumes, New Volume**, isi **Mount path: `/data`**. Ini WAJIB. Tanpa volume, data hilang setiap kali server restart.
4. Tab **Variables**, tambah `APP_PASSWORD` = password pilihanmu (bagikan ke tim lapangan).
5. Tab **Settings, Networking, Generate Domain**. Hasilnya alamat `https://....up.railway.app`: itu yang dibuka semua orang.
6. Login: kolom username isi bebas, password sesuai `APP_PASSWORD`.

Layanan lain yang bisa dipakai dengan Dockerfile yang sama: Fly.io, VPS biasa (`docker run -p 3000:3000 -v produksi:/data -e APP_PASSWORD=xxx image`). Render juga bisa, tapi disk persisten hanya tersedia di layanan berbayar.

### Opsi B: PC kantor + Cloudflare Tunnel (coba-coba, gratis)
1. Jalankan `start.bat`.
2. Pasang `cloudflared` dari Cloudflare, lalu jalankan: `cloudflared tunnel --url http://localhost:3000`
3. Muncul alamat `https://xxxx.trycloudflare.com`, bagikan ke lapangan.

Kekurangan: alamat berubah tiap dijalankan ulang, PC harus selalu menyala, dan Cloudflare menyebut quick tunnel ini untuk uji coba tanpa jaminan uptime. Untuk pemakaian tetap, pakai Opsi A.

### Keamanan
- Kalau diakses dari internet **wajib** pasang `APP_PASSWORD`. Di cloud alamatnya https otomatis.
- Password hanya satu untuk semua orang. Siapa mengubah apa tetap terlihat dari kolom Nama di riwayat (diisi sendiri oleh pengguna, jadi tidak bisa dijadikan bukti identitas).

---

## 4. Backup & data
- Tombol **Backup** di halaman mengunduh semua data (semua produk) sebagai file `.json`. Lakukan rutin, misal tiap akhir bulan.
- Di PC kantor, cukup salin file `data/data.json`.
- Update aplikasi: ganti `server.js` dan `public/index.html`, **jangan** hapus folder `data` (atau volume `/data`). Data format lama (reflector saja) otomatis dimigrasi.

## 5. Ubah nama / tambah produk
Buka `server.js`, edit daftar `PRODUCTS` di bagian atas (id, nama menu, judul), lalu restart server.
Nama sekarang: REFLECTOR K3VA, HOUSING LOW, HOUSING HIGH.

## 6. Data contoh (opsional)
`node seed-sept-2026.js` mengisi data Reflector September 2026 dari screenshot Excel. Jalankan **sebelum** server dipakai pertama kali.
