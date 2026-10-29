# Supabase EGZ: status integrasi

Diperiksa pada 2026-10-29 (Asia/Jakarta). Backend sudah terhubung dan diuji;
pendaftaran publik serta deployment web produksi belum dibuka.

| Item | Status |
| --- | --- |
| Proyek | egz-gesture-studio |
| Organisasi | EGYYFZA's Org, paket Free |
| Reference | chznehpvkuuooclyjhqg |
| Region | Singapore, ap-southeast-1 |
| Dashboard | [Buka proyek](https://supabase.com/dashboard/project/chznehpvkuuooclyjhqg) |
| Backend lokal | http://127.0.0.1:4173 |
| Sumber handler | api/studio.js dan server/ |
| Database | Migration 001–003 diterapkan; ledger menyimpan checksum |
| Auth | Login email/password, email terverifikasi, sesi server, MFA admin |
| Storage | photo-archive private, PNG, batas 3 MiB, owner/admin RLS |
| Retensi | 30 hari seluruh cloud; cron aktif setiap 5 menit |
| Job | egz-retention-30-days → Edge Function egz-retention |
| Verifikasi job | Panggilan anonim ditolak; pengiriman cron HTTP200 |
| Signup umum | Ditutup di BFF sampai konfigurasi produksi selesai |
| SMTP | Resend dipilih; domain pengirim belum tersedia |
| Hosting web | Handler Vercel disiapkan; belum ada deployment web baru |

Rincian lengkap: [status backend](backend-integration-status.md).

Studio lokal tersedia sebagai tamu. Login diminta pada Unduh PNG dan galeri
cloud; keduanya memakai dialog pada halaman studio. Foto tamu dipindahkan ke
UID saat login eksplisit, dan hanya dikirim ke cloud setelah persetujuan serta
pilihan simpan foto tersebut. Lihat [audit alur terkini](guest-studio-audit.md).

## Kredensial dan akses

Kredensial provider disimpan pada .env.local, password operator database pada
secrets/supabase-project-setup.json. Keduanya diabaikan Git dan tidak diterbitkan
build. config/supabase-project.json hanya berisi referensi nonrahasia.

Token Auth tidak disimpan di browser. Cookie sesi acak HttpOnly menunjuk row
server-only dengan token provider terenkripsi. Backend memverifikasi pengguna
dan RLS tetap berlaku saat membaca foto; service role digunakan hanya untuk
operasi server yang memang memerlukannya.

Autentikasi penjadwal berada di Vault dan secret Edge Function. Tidak ada
kredensial literal pada source migration atau job cron. Koneksi PostgreSQL
operator memakai CA resmi Supabase dengan verifikasi sertifikat dan hostname.

Alamat admin ditetapkan secara privat di environment. Pemilik harus membuat
akun/email terverifikasi, memilih password sendiri, dan menyiapkan TOTP pada
halaman Akun. Login GitHub dashboard tidak otomatis menjadi login admin aplikasi.

## Verifikasi

- 24 tes Node lulus.
- 40 tes browser lulus pada rangkaian penuh, termasuk alur tamu, geometri gesture dan tema putih festival.
- 25 pemeriksaan HTTP/backend live lulus memakai identitas dan PNG sintetis,
  termasuk penghapusan fisik lewat fungsi cloud dan akses MFA.
- authorization.sql dan global-counts.sql lulus; fixture SQL di-rollback.
- Fixture Auth/Storage/metadata pengujian live sudah dibersihkan.
- Audit npm runtime terakhir melaporkan 0 advisory.

## Langkah sebelum membuka layanan publik

Pemilik belum mempunyai domain untuk verifikasi Resend. Setelah domain tersedia,
verifikasi pengirim, masukkan SMTP langsung di Supabase, pasang template kode
konfirmasi yang disediakan, dan uji pengiriman. Batas SMTP bawaan tidak cukup
untuk pendaftaran umum. [Dokumentasi SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Konfigurasikan proteksi Auth/CAPTCHA dan hosting HTTPS, pindahkan environment
server ke hosting, ganti APP_ORIGIN serta Site URL/redirect sesuai domain
produksi, lalu lakukan smoke test. Aktifkan PUBLIC_SIGNUP_ENABLED hanya setelah
konfigurasi tersebut lolos. Site URL lokal saat ini menuju
http://127.0.0.1:4173/account.html.

Rancangan dan batas konsekuensi ada pada [ADR](adr/README.md) dan
[audit terkini](public-backend-audit.md). Proyek lama tidak diubah.
