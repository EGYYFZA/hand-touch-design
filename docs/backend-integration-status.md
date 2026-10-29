# Status integrasi backend EGZ

Tanggal: 2026-10-29 (Asia/Jakarta). **Backend terhubung dan diuji; belum dirilis untuk pendaftaran publik.**

Audit terakhir: [keamanan sebelum publikasi](security-prepublish-audit.md).
Preview tamu/Print memakai watermark; hasil Photobooth langsung terbuka.
Login dan MFA merotasi SID/CSRF serta mencabut sesi browser yang digantikan.

## Yang sudah berjalan

- Proyek Supabase `egz-gesture-studio`, ref `chznehpvkuuooclyjhqg`, region Singapore.
- API `api/studio.js` / `server/backend.mjs` dipakai server lokal dan disiapkan untuk Vercel.
- Kamera, empat mode, galeri lokal dan Print tersedia tanpa login. Unduh PNG meminta login dalam dialog; foto tamu dipindahkan ke akun tanpa mengirimnya otomatis ke cloud. Galeri cloud pemilik berada pada halaman studio yang sama.
- Login email/password serta konfirmasi email; email terverifikasi wajib sebelum sesi dibuat.
- Cookie sesi acak HttpOnly, Secure di HTTPS, SameSite=Lax; token provider dienkripsi AES-GCM di database. Login merotasi CSRF dan menyelaraskan masa berlaku cookie.
- Pemeriksaan Origin/CSRF setiap mutasi, token refresh dengan lock database, logout yang mencabut sesi server.
- Cache lokal per UID, pembersihan saat logout/pergantian akun, dan karantina foto demo tanpa owner.
- Persetujuan cloud versi `2026-10-29`, default tidak setuju; tidak ada unggahan retroaktif otomatis.
- Foto tamu/lama dapat dikirim setelah persetujuan cloud aktif dan pilihan eksplisit Simpan foto ini ke cloud. Login, membuka galeri, dan mengaktifkan persetujuan saja tidak mengirim foto lama.
- Galeri pemilik lintas perangkat dan galeri admin dengan membership server + MFA `aal2`.
- PNG diperiksa, dibatasi dimensi/pixel, didekode dan di-encode ulang server. Salinan cloud yang terlalu besar diperkecil; unduhan lokal tetap asli.
- Bucket `photo-archive` private, maksimum 3 MiB/PNG; tidak ada izin client menulis langsung metadata atau Storage.
- Idempotency berdasarkan UID/kunci foto/hash isi, kuota atomik, dan penghapusan cloud yang terpisah dari hapus lokal.

## Retensi cloud yang sudah aktif

`expires_at` ditetapkan pada unggah pertama berhasil +30 hari. Membaca atau retry
tidak memperpanjangnya. RLS segera menolak foto expired; file dibersihkan job
`egz-retention-30-days` dengan jadwal `*/5 * * * *` melalui pg_cron + pg_net.

Edge Function `egz-retention` memanggil Storage API, lalu menandai metadata
deleted. Autentikasi job memakai JWT gateway dan secret khusus job; kredensial
cron berada di Supabase Vault, bukan SQL/source publik. Pengiriman cron pada
pemeriksaan terdahulu menghasilkan HTTP200. Verifikasi ulang penjadwal pada
audit terakhir tidak dieksekusi karena automatic approval review gagal akibat
batas penggunaan; uji fungsi retensi langsung tetap lulus. Sweep tombstone 24 jam menangani objek
yang terlambat muncul setelah race upload/hapus. Ini bukan janji pemusnahan
backup provider pada detik yang sama.

Migrations yang sudah diterapkan dan dicatat checksum-nya:

1. `202610290001_egz_photo_backend.sql`: metadata, consent, sesi, RLS, MFA admin, kuota.
2. `202610290002_egz_retention_schedule.sql`: penjadwal cloud dan antrean HTTP.
3. `202610290003_egz_global_photo_counts.sql`: batas jumlah foto global.

Batas awal: 10 unggahan/menit dan 100/hari per akun, 300 MiB/hari per akun,
1 GiB/hari global, 800 MiB kapasitas aktif global, maksimum 5.000 foto aktif
dan 5.000 penerimaan/hari. Batas tersebut adalah kebijakan aplikasi awal yang
perlu ditinjau dari pemakaian; bukan jaminan kuota provider tidak pernah terlampaui.

## Bukti pengujian

Revisi panel alat serta tema putih festival sudah diuji bersama pada rangkaian
penuh terbaru. Tombol X, ikon samping, hover/klik/touch dan alur login tetap
berjalan. Tata letak sembilan viewport tidak scroll. Font Mona Sans dimuat lokal;
frame baru mempertahankan setiap pixel dari ketiga foto sintetis yang diuji.
Token serta sumber referensi dicatat pada [tema Universe](universe-theme.md).

- 26 tes Node: kriptografi sesi, validasi PNG, CSRF origin, masa berlaku MFA, penutupan signup publik, poligon L, gesture gambar/hapus, build dan privasi berkas.
- 42 tes browser lulus pada rangkaian penuh: akses tamu, login saat unduh, akun, cloud satu halaman, cache gagal, consent manual, PNG besar, sembilan ukuran layar, alat samping, tema terang, frame festival, poligon L, gambar/hapus, MediaPipe, download dan Print.
- 25 tes regresi Python lulus; aplikasi desktop tidak diubah oleh alur login web.
- 28 pemeriksaan backend live menggunakan akun/PNG sintetis: A/B saling ditolak, SDK/Storage langsung tetap dibatasi, admin tanpa MFA ditolak, admin MFA berhasil, refresh paralel, lintas sesi/perangkat, revoke, expiry, penghapusan fisik oleh fungsi cloud, tombstone, dan replay cookie sesudah logout.
- `authorization.sql` lulus pada proyek nyata; semua fixture SQL di-rollback.
- `global-counts.sql` lulus dengan 5.000 baris metadata sintetis; seluruhnya di-rollback.
- Akun, foto, metadata dan audit fixture live dibersihkan melalui tool yang memverifikasi identitas sintetis. Tidak mengirim email atau memakai foto pribadi untuk tes.
- npm audit runtime melaporkan 0 advisory pada pemeriksaan terakhir. Ini tidak menjamin ketiadaan semua kerentanan.

## Menjalankan dan menggunakan admin

```text
npm ci --ignore-scripts
npm run dev
```

Buka `http://127.0.0.1:4173/`; akun tersedia sebagai dialog saat diperlukan.
Halaman `account.html` tetap tersedia untuk pengaturan MFA admin. Kredensial server berada di `.env.local`
yang diabaikan Git; contoh nama variabel ada di `.env.example`. Jangan menyalin
file lokal tersebut ke direktori web atau chat. Operator database menggunakan
sertifikat CA Supabase dan memverifikasi TLS/hostname.

`ADMIN_BOOTSTRAP_EMAIL` sudah ditetapkan secara privat sesuai pilihan pemilik.
Membership pertama hanya dibuat setelah email itu terverifikasi dan login.
Membership yang dicabut tidak diaktifkan ulang otomatis. Pemilik harus memilih
password sendiri dan menyiapkan TOTP pada halaman Akun; pengujian MFA sintetis
tidak berarti autentikator pribadi pemilik sudah disiapkan.

## Yang masih memerlukan konfigurasi pemilik

1. **Email publik:** pemilik memilih Resend tetapi belum mempunyai domain
   pengirim. SMTP/konfirmasi publik belum dapat diaktifkan. Supabase juga
   membatasi penyuntingan template sampai custom SMTP siap. Template OTP yang
   disiapkan ada di `supabase/templates/confirmation.html`. Sementara itu
   `PUBLIC_SIGNUP_ENABLED=false`; pengecualian hanya alamat pengelola yang
   ditetapkan di server, tunduk pada batas email bawaan provider.
2. **Anti-abuse Auth:** integrasikan widget CAPTCHA, penerusan captchaToken
   melalui BFF dan CSP untuk penyedia/site key yang dipilih, lalu konfigurasikan
   CAPTCHA/rate limit provider sebelum membuka signup. Toggle provider saja
   belum cukup. Limit API aplikasi tidak menggantikan proteksi endpoint
   Supabase Auth yang dapat diakses langsung.
3. **Hosting publik:** kode handler dan konfigurasi Vercel tersedia, tetapi
   deployment web baru belum dibuat. Atur environment server, APP_ORIGIN HTTPS,
   Site URL/redirect Auth yang tepat, serta pisahkan preview dari produksi.
4. **Perangkat nyata:** viewport Chromium sudah diuji; kamera/printer fisik,
   Android/iOS dan Safari masih perlu pemeriksaan langsung.

Persyaratan email bawaan: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
Konfigurasi lokal Auth saat ini mengarah ke halaman akun di localhost; ganti ke
origin produksi saat deployment. Fragmen token dari tautan konfirmasi bawaan
dihapus segera oleh halaman akun dan tidak dipakai untuk sesi BFF.

## Operasi dan rollback

`npm run retention:check` memeriksa fungsi, jadwal, dan pengiriman HTTP;
`npm run db:test` menjalankan kedua suite SQL rollback;
`npm run test:backend:live` hanya untuk proyek pengujian/operator dengan
kredensial lokal dan membersihkan fixture miliknya sendiri.

Pantau HTTP503 fungsi retensi, antrean `deleting`, baris expired, penggunaan
Storage dan log cron. Rotasi secret juga harus memperbarui environment server,
Edge Function serta Vault. Untuk menghentikan upload gunakan
`UPLOADS_ENABLED=false`; jangan menghapus tabel/path sebagai rollback.
Migration yang sudah applied tidak boleh diedit. Lihat `supabase/README.md`.
