# Audit integrasi backend publik EGZ

Tanggal: 2026-10-29 (Asia/Jakarta). Hasil: **backend akun/cloud terhubung dan
lulus pengujian integrasi; belum siap membuka pendaftaran publik**.

Koreksi alur: kamera, mode, galeri lokal dan Print tersedia sebagai tamu.
Login untuk unduh dan galeri cloud menggunakan dialog dalam studio. Foto tamu
tidak otomatis diunggah; persetujuan dan pilihan foto eksplisit diperlukan.
[Audit guest/gesture/UI](guest-studio-audit.md) memuat temuan dan perbaikannya.

## Temuan yang masih terbuka

### High — Email dan proteksi signup publik belum dikonfigurasi

Pemilik memilih Resend dan mengonfirmasi belum memiliki domain pengirim.
Custom SMTP belum aktif; dashboard Supabase membatasi edit template hingga
SMTP siap. PUBLIC_SIGNUP_ENABLED default false di backend. Pengecualian
pendaftaran terbatas pada alamat admin yang ditetapkan server, tunduk pada
pembatasan SMTP provider. Jangan menonaktifkan verifikasi email sebagai jalan pintas.

Sebelum membuka publik: domain terverifikasi, SMTP, template kode, proteksi
CAPTCHA/rate limit Auth, dan pengiriman konfirmasi nyata harus selesai.
Rate limit BFF tidak menggantikan proteksi endpoint Supabase Auth langsung.
[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

### Medium — Deployment web produksi dan perangkat fisik belum diverifikasi

API Vercel dan konfigurasi environment sudah disiapkan, tetapi belum ada
deployment web baru. APP_ORIGIN dan Auth Site URL sekarang menggunakan lokal.
Jangan menyalin kredensial produksi ke preview atau frontend.

Pengujian memakai Chromium dan kamera sintetis. Viewport sampai 320×568 /
568×320 diuji; Android/iOS/Safari serta printer/kamera fisik belum diuji.

## Kontrol yang sudah diterapkan dan diverifikasi

| Batas | Kontrol | Bukti |
| --- | --- | --- |
| Login/sesi | Email terverifikasi, cookie opaque HttpOnly, AES-GCM server, refresh lock 45 detik, timeout jaringan 8 detik | server/sessions.mjs; tes HTTP login/refresh/logout |
| Mutasi | Origin exact, CSRF cookie/header, rotasi CSRF saat login | server/backend.mjs; lintas-origin ditolak |
| User A/B | Metadata dan Storage SELECT dibatasi UID, status, expiry | Migration 001; SQL dan HTTP/SDK/Storage A/B |
| Admin | Membership operator + aal2; user_metadata.role tidak dipercaya | Tes admin tanpa MFA ditolak, dengan MFA berhasil |
| Consent | Default false, versi tercatat, revoke atomik menutup arsip | Tes upload tanpa consent dan revoke/regrant |
| PNG | Signature, decode/re-encode, dimensi/pixel/byte cap | server/security.mjs dan pengujian PNG |
| Kuota | Counter/lock database; per-user, byte dan jumlah global | SQL authorization/global-counts |
| Retry | Idempotency terikat UID/kunci/SHA256, expiry tidak diperpanjang | Tes retry identik/berbeda/expired |
| Retensi | RLS menolak expired; Storage API remove, sweep tombstone | Fungsi cloud, cron HTTP200, tes file fisik |
| Lokal | Cache per UID, clear-on-logout/switch/expiry, demo dikarantina | Tes browser cache dan sesi kedaluwarsa |
| Build | Daftar berkas publik eksplisit; tidak menyalin secrets/source privat | Tes build dan pemeriksaan artefak dist |

Temuan tinjauan kode yang sudah diperbaiki: race upload/hapus yang dapat
menyisakan orphan, expiry respons MFA tanpa expires_at, logout saat provider
gagal, JSON null/cacat, refresh yang melewati lease, retry expired yang semula
503, dan masa berlaku/rotasi CSRF saat login.

## Hasil verifikasi akhir

- npm test: **24 lulus**.
- npm run test:e2e: **40 lulus** pada rangkaian penuh terbaru, termasuk revisi tema dan frame.
- tools/test-backend-live.mjs: **25 pemeriksaan lulus**. Menggunakan akun/PNG
  sintetis, mencakup UI browser yang benar-benar membaca foto Supabase.
- authorization.sql dan global-counts.sql lulus pada proyek Supabase nyata;
  seluruh fixture SQL di-rollback.
- Akun, metadata, audit dan object fixture live dibersihkan melalui tool yang
  memeriksa identitas sintetis. Tidak menggunakan foto pribadi atau mengirim email.
- Cron aktif */5 * * * *; pengiriman terautentikasi ke Edge Function HTTP200,
  panggilan anonim ditolak.
- npm audit runtime: 0 advisory yang dilaporkan pada pemeriksaan terakhir.
- Kredensial lokal diabaikan Git dan tidak ditemukan pada artefak frontend.

## Batas keyakinan dan operasi

Ini bukti pengujian aplikasi, bukan jaminan bebas semua kerentanan atau
penetration test pihak ketiga. Admin sah memang dapat membaca arsip yang
disetujui; jangan menyebutnya enkripsi end-to-end hanya-pengguna.

Storage API menghapus salinan aktif; kebijakan backup provider belum
diverifikasi. Akses berakhir tepat saat expires_at, sedangkan pembersihan fisik
bergantung jadwal dan keberhasilan job. Pantau backlog dan kegagalan fungsi.

Orang yang menguasai profil browser/perangkat tetap berada dalam batas
kepercayaan lokal; cache akun dibersihkan saat logout, tetapi berkas unduhan
dikelola pengguna. Demo lokal tanpa login masih berbagi galeri per profil.

Skill agent-architecture-audit dipanggil eksplisit pada riset awal, namun
aplikasi ini deterministik berbasis landmark, tanpa LLM/tool-loop/memori agent.
Lapisan agent tersebut tidak berlaku; security-review dan bukti kode/HTTP
dipakai untuk keamanan aplikasi web.

Status operasional: [backend integration](backend-integration-status.md).
Detail proyek: [Supabase setup](supabase-setup.md).
