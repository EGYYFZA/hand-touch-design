# Deploy beta EGZ ke Netlify

Target: beta tamu dengan login akun yang sudah ada. Signup dan pemulihan email
publik menunggu domain pengirim/SMTP; jangan mematikan konfirmasi email.

## Build dan API

Import repository `EGYYFZA/hand-touch-design`, branch `main`. Konfigurasi
`netlify.toml` menetapkan `npm run build`, direktori publik `dist`, Node 22,
dan fungsi di `netlify/functions`. Jangan upload root repository sebagai folder
publik. `.env.local`, `secrets`, foto, database lokal, virtualenv dan konfigurasi
agent tidak boleh diunggah. Netlify harus menginstal dependensi Linux; jangan
mengunggah node_modules Windows untuk native Sharp.

`studio.mjs` menangani `/api/studio` menggunakan backend bersama. Adapter
meneruskan byte PNG, cookie Set-Cookie terpisah dan IP dari konteks Netlify;
header X-Forwarded-For pengguna tidak dipercaya. Request diproses sebagai stream
agar pembatasan byte server tetap berlaku. Tidak ada SPA catch-all.

Build menghasilkan `_headers` dari `config/security-headers.json`. Function
memasang header yang sama pada responsnya karena aturan header file statis
Netlify tidak diterapkan otomatis ke respons function. CSP tetap membatasi
skrip/koneksi ke origin sendiri; runtime MediaPipe/WASM dan font dimuat lokal.

## Environment server

Pasang variabel melalui UI/API Netlify, konteks **production**, scope
**Functions** bila paket akun mendukung scope. Secret tidak diletakkan dalam
netlify.toml, Git, build output, prefix VITE/NEXT_PUBLIC, atau argumen command.

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
- `SESSION_SECRET`: 32 byte acak base64, khusus deployment ini.
- `CRON_SECRET`: minimal 32 karakter acak, berbeda dari SESSION_SECRET. Sinkron
  dengan konfigurasi job Supabase jika dirotasi.
- `APP_ORIGIN`: URL HTTPS kanonis, tanpa path atau trailing slash.
- `ADMIN_BOOTSTRAP_EMAIL`: alamat pemilik yang ditetapkan secara privat.
- `PUBLIC_SIGNUP_ENABLED=false` selama beta.
- `UPLOADS_ENABLED=true`, atau false untuk menghentikan unggahan.
- `NODE_ENV=production`.

Preview deployment tidak mendapat secret produksi. Selain scope, adapter menolak
request ke origin yang berbeda dari APP_ORIGIN. Jangan menambahkan wildcard
origin atau CORS `*` agar preview dapat mengakses data produksi.

Atur Site URL Supabase ke `/account.html` pada origin kanonis. Pertahankan daftar
redirect spesifik, tanpa wildcard semua domain Netlify. Selama beta nonaktifkan
signup langsung di Supabase Auth juga; flag BFF saja tidak melindungi endpoint
provider. Password disimpan sebagai hash oleh Supabase Auth, bukan dalam tabel
aplikasi. Admin perlu email terverifikasi, membership server dan MFA AAL2.

## Pengujian dan observasi

Sebelum push: `npm run audit:repository`, `npm test`, `npm run test:e2e`.
Scanner lokal memeriksa signature dan nilai secret lokal pada sumber/riwayat Git
yang tersedia, tanpa mengunggahnya ke layanan pemindai. Detail di `secrets/`
tetap lokal. Binary dan teks lebih dari 2 MiB tidak diklasifikasikan sebagai
secret oleh scanner; daftar aset publik tetap perlu ditinjau.

Sesudah deploy: verifikasi HTTP menuju HTTPS, header, API JSON, login/cookie
Secure/HttpOnly, CSRF, admin tanpa MFA ditolak, user A/B terisolasi, consent,
upload PNG, expired/revoke, kamera serta Print. Gunakan akun/foto sintetis dan
bersihkan fixture milik tes saja. Validasi email nyata menunggu SMTP.

Netlify membatasi `/api/studio` pada 120 request/IP/domain/menit melalui aturan
kode. Backend menambah limit autentikasi dan kuota database yang atomik.
Aturan edge bukan jaminan batas absolut global atau perlindungan DDoS lengkap.

Log function menulis event `security.denied` atau `backend.unavailable`, action
dari allowlist, status, dan request ID yang tervalidasi. Jangan menambah body,
password, token, cookie, email atau error provider mentah ke log. Tinjau lonjakan
401/403/429/503 pada log Netlify, audit Auth Supabase, dan audit arsip admin.
Alert otomatis atau on-call eksternal belum dikonfigurasi.

Retensi cloud tetap berjalan di Supabase setiap lima menit, bukan pada laptop
atau jadwal Netlify. Pantau kegagalan dan backlog serta jalankan
`npm run retention:check` saat melakukan verifikasi operasional.

## Rollback

Publikasikan kembali deploy Netlify terakhir yang sehat. Bila perlu hentikan
upload dengan `UPLOADS_ENABLED=false` lalu redeploy. Jangan menghapus tabel atau
object path sebagai rollback. Perubahan schema memakai migration berikutnya;
jangan mengedit migration yang sudah diterapkan. Rotasi secret yang terbukti
bocor harus memperbarui seluruh pemakainya; SESSION_SECRET baru mengakhiri
kemampuan membaca sesi lama.

## Sumber

- [Netlify Functions API](https://docs.netlify.com/build/functions/api/).
- [Konfigurasi Functions dan batas payload](https://docs.netlify.com/build/functions/configuration/).
- [Environment Functions](https://docs.netlify.com/build/functions/environment-variables/).
- [Rate limiting Netlify](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/).
- [Penyimpanan hash password Supabase](https://supabase.com/docs/guides/auth/password-security).
