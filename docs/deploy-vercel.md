# Deploy EGZ ke Vercel dengan backend Supabase

Frontend kamera/MediaPipe berada di dist; API same-origin berada di
api/studio.js dan server/. Desktop Python/OpenCV tetap aplikasi terpisah.

## Lokal

Jalankan npm ci --ignore-scripts, salin nama variabel dari .env.example ke
.env.local dan isi melalui saluran lokal yang aman, lalu npm run dev.
Pada workspace pemilik, konfigurasi lokal sudah tersedia. Buka
http://127.0.0.1:4173/account.html. Node.js 22+ diperlukan; di Windows PowerShell
gunakan npm.cmd bila npm.ps1 diblokir.

npm run dev:demo menjalankan demo eksplisit tanpa akun pada port 4174.
Mode demo hanya untuk loopback. Studio publik tetap dapat memakai kamera dan
mode lokal saat layanan akun tidak tersedia; unduh PNG dan cloud tetap
memerlukan akun aktif. Login serta galeri cloud pemilik memakai dialog studio.

## Konfigurasi hosting

Import repository yang sudah direview ke Vercel:
Framework Other, root repository, Build npm run build, Output dist.
vercel.json mengatur install npm ci --ignore-scripts, header keamanan, dan
batas fungsi 60 detik. api/studio.js diproses sebagai fungsi Node tersendiri.

Atur environment server berikut melalui pengaturan Vercel, tanpa prefix
NEXT_PUBLIC/VITE dan tanpa menyalinnya ke web atau dist:

- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY
- SESSION_SECRET: 32 byte acak base64, stabil agar sesi tersimpan dapat didekripsi
- CRON_SECRET:minimal 32 karakter acak, berbeda dari SESSION_SECRET, untuk endpoint pemeliharaan server
- APP_ORIGIN:origin HTTPS tepat, tanpa slash akhir/path
- ADMIN_BOOTSTRAP_EMAIL:alamat pemilik terverifikasi yang ditetapkan operator
- UPLOADS_ENABLED:true; gunakan false untuk penghentian unggah
- PUBLIC_SIGNUP_ENABLED:false sampai SMTP/proteksi Auth/hosting siap

Isi tiap secret langsung di hosting, bukan melalui source atau chat. Jangan
gunakan kredensial produksi pada preview; sediakan environment/proyek
pengujian terpisah. Kunci berprivilege melewati RLS sehingga hanya boleh berada
di server. Browser menggunakan cookie HttpOnly dan fetch same-origin.

## Auth dan email sebelum publik

Pemilik memilih Resend tetapi belum memiliki domain pengirim. Pendaftaran
publik saat ini belum dibuka. Verifikasi domain/pengirim Resend, atur SMTP di
Supabase, terapkan supabase/templates/confirmation.html sebagai template signup,
lalu uji kode konfirmasi. Tetap wajibkan email confirmation.

Ganti Supabase Site URL/redirect ke halaman akun pada origin produksi yang
tepat. Saat ini Site URL lokal adalah http://127.0.0.1:4173/account.html.
Halaman akun menghapus fragmen token dari tautan konfirmasi default dan tetap
memerlukan login password untuk membuat sesi BFF.

Konfigurasikan proteksi CAPTCHA/rate limit Supabase Auth sebelum signup umum.
Widget CAPTCHA dan penerusan captchaToken melalui BFF belum tersedia; integrasikan
bersama site key penyedia dan kebijakan CSP origin spesifik sebelum mengaktifkan
toggle CAPTCHA provider. Toggle tanpa integrasi tersebut membuat Auth gagal.
Mengaktifkan SMTP saja belum membuktikan perlindungan terhadap penyalahgunaan.
Aktifkan PUBLIC_SIGNUP_ENABLED setelah pengujian produksi berhasil.

## Retensi sudah berada di Supabase

Tidak bergantung pada Vercel Cron atau komputer lokal. Job
egz-retention-30-days berjalan setiap 5 menit melalui pg_cron/pg_net ke Edge
Function egz-retention. Secret khusus job ada pada Edge Function dan Vault;
JWT gateway tetap diaktifkan. Migration001–003 sudah diterapkan pada proyek EGZ.

Foto cloud kedaluwarsa 30 hari untuk pengguna/admin. RLS menolak foto expired;
fungsi menghapus file melalui Storage API dan merekonsiliasi tombstone 24 jam.
Rotasi credential harus memperbarui environment, Edge secret dan Vault.
Jalankan npm run retention:check untuk memeriksa pengiriman HTTP.

## Validasi rilis

Pemeriksaan lokal: npm test, npm run test:e2e, npm run db:test
(operator/proyek uji), serta npm run test:backend:live dengan akun sintetis.
Live tool memerlukan password operator lokal dan membersihkan fixture miliknya.

Setelah deploy: uji halaman akun, sesi/cookie HTTPS, consent, kamera, upload,
galeri akun yang sama lintas perangkat, penolakan user lain, admin MFA, logout,
download dan Print. Gunakan foto sintetis. Verifikasi email nyata memerlukan
tindakan pemilik, bukan menandai akun publik confirmed lewat Admin API.

Hanya daftar berkas frontend eksplisit yang disalin ke dist. .env.local,
secrets, captures, data, dan kode desktop tidak disalin ke build. Pastikan
hosting tidak menyajikan repository root sebagai folder statis.

## Rollback

Promosikan deployment terakhir yang sehat bila diperlukan. Untuk menonaktifkan
unggah, gunakan UPLOADS_ENABLED=false. Jangan drop tabel/path metadata karena
dibutuhkan untuk membersihkan Storage. Perubahan database deployed dilakukan
melalui migration baru; jangan mengedit checksum migration lama.

Rollback ke versi tanpa akun dapat kehilangan batas login pada UI; evaluasi
audiens dan akses sebelum melakukannya. Foto IndexedDB tidak berpindah antar
origin/domain, dan versi lama mungkin tidak menampilkan cache akun.

## Riwayat repository

Dokumentasi lama menyebut foto pada riwayat Git. Checkout yang ditinjau tidak
melacak captures dan git log --all -- captures tidak menghasilkan entry.
Riwayat remote/arsip GitHub belum diverifikasi; tidak ada history rewrite.

[Status integrasi](backend-integration-status.md) memuat hasil dan batas bukti.
[Dokumentasi SMTP](https://supabase.com/docs/guides/auth/auth-smtp) menjelaskan
batas layanan email bawaan.
