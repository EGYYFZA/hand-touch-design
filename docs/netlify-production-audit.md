# Audit produksi Netlify EGZ

Production audit: **78/100, launchable with caveats untuk beta tamu dan akun yang
sudah ada**; email publik, CAPTCHA dan penerimaan perangkat nyata masih menjadi
prasyarat peluncuran umum. Skor adalah penilaian engineering atas bukti berikut,
bukan sertifikasi atau jaminan bebas kerentanan.

Pemeriksaan mulai 29 dan selesai 30 Oktober 2026, Asia/Jakarta.
URL: **https://egz-gesture-studio.netlify.app**.
Kode aplikasi diterbitkan melalui [PR #12](https://github.com/EGYYFZA/hand-touch-design/pull/12),
merge `687bd903876f123fb34eab32523de9ffebed2e0b`.
Deploy dengan environment yang diuji: `6ae37d530c0a4de02f23fa4f`.

## Batasan rilis yang disetujui

- Pemilik memilih beta tamu + login akun yang sudah ada. Kamera, empat mode,
  foto lokal dan Print tersedia sebelum login. Unduh resmi meminta login.
- Signup baru dimatikan pada BFF dan Supabase Auth. Konfirmasi email tetap
  wajib; anonymous Auth dan manual linking tetap nonaktif.
- Netlify awalnya privat; beta dibuat publik setelah build berhasil sesuai
  persetujuan pemilik. Preview tetap privat tanpa nilai environment produksi.
- Paket Netlify tidak mendukung scope Functions khusus. Pemilik menyetujui
  environment biasa dengan scope Builds/Functions/Runtime/Post-processing,
  **hanya production**. Flag Secret khusus tidak dapat dipakai pada kombinasi
  scope ini. Administrator tim Netlify dapat membaca nilainya. Nilai tidak
  dicetak, dikomit, diberikan ke preview, atau disalin ke frontend.

## Temuan, perbaikan dan bukti

| Batas / permintaan | Penanganan dan hasil |
| --- | --- |
| Netlify | Adapter Request/Response memakai handler bersama, stream upload dan Set-Cookie terpisah. API `/api/studio` berjalan online. |
| Authentication | Supabase memverifikasi email/password. Cookie sesi acak HttpOnly; token provider dienkripsi AES-GCM di server dan tidak dikirim ke JavaScript frontend. |
| Hash password | Supabase Auth menyimpan hash bcrypt dengan salt. Aplikasi tidak menyimpan password mentah atau membuat hash tambahan. Minimum password baru/ganti **12 karakter**. |
| Reset link / OTP | OTP/link email diset kedaluwarsa **600 detik**, Secure password change aktif. Alur pengiriman/pemulihan email publik belum dibuka atau diklaim berhasil; pemilik memilih menunggu SMTP/domain. |
| Cookie dan sesi | HTTPS memakai __Host-, Secure, HttpOnly, SameSite=Lax, Path=/ tanpa Domain. Login/MFA merotasi SID/CSRF dan mencabut SID lama. Replay cookie lama ditolak online. |
| CSRF / CORS | Mutasi memerlukan Origin tepat dan token cookie/header yang terikat sesi. Origin asing dan token salah ditolak. Tidak ada CORS wildcard atau preflight lintas-origin yang diizinkan. |
| Admin | Shell admin tidak berisi foto; data/API memakai membership server + AAL2 serta RLS. User metadata role tidak dipercaya. Tanpa MFA ditolak; sesi sebelum MFA tidak ikut naik hak. |
| Database / query | RLS metadata/Storage membatasi UID, status dan expiry. Query SDK/RPC memakai parameter; UUID/mode di-allowlist. Client tidak boleh menulis metadata/Storage langsung. Tes HTTP, SDK dan Storage A/B lulus. |
| Upload | PNG saja, maksimal 3 MiB cloud, signature dan decode/re-encode server, maksimal 16 juta pixel dan sisi 8192. JPEG, SVG bermime PNG dan ukuran >3 MiB ditolak online. |
| Consent / retensi | Tidak upload tanpa consent; foto tamu/lama perlu pilihan eksplisit. Revoke/expiry langsung menutup akses. Retensi cloud 30 hari, penghapusan Storage API dan sweep tombstone diuji. |
| Rate limit | Netlify 120 request/IP/domain/menit; BFF autentikasi 20/IP/10 menit + 500 global/jam, request akun 180/menit, serta kuota upload atomik. Ini bukan uji beban/DDoS atau batas absolut seluruh trafik. |
| HTTPS | HTTP subdomain beta terbukti redirect ke HTTPS; HSTS aktif dan APP_ORIGIN HTTPS kanonis. Opsi force_ssl untuk sertifikat custom-domain tidak dipakai pada subdomain Netlify. |
| Header / XSS | CSP membatasi sumber/koneksi, form-action self, frame-src/ancestors none; nosniff, DENY, no-referrer, CORP dan pembatasan kamera/mikrofon aktif. Input dirender dengan textContent; model/WASM/font lokal. |
| Debug / monitoring | NODE_ENV=production; error generik tanpa stack/provider detail. Log penolakan memakai action allowlist, status, request ID; tanpa body/password/cookie/token/email. Audit Auth, consent/admin dan retensi tersedia; alert otomatis belum disiapkan. |
| Dependensi | Audit npm produksi: **0 advisory**. pg masih dipakai tool operator dan dipindah ke devDependencies. Sharp, Supabase SDK dan MediaPipe tetap diperlukan. Tidak ada source/secret dikirim ke layanan scanner eksternal. |
| Berkas terpapar | Build allowlist publik; URL .env, secrets, .git, .netlify, server, core, captures ditolak. **29 aset teks online diperiksa: 0 nilai secret server ditemukan**. |
| Git / secret | Scan signature dan nilai secret lokal/produksi pada working tree serta objek teks <=2 MiB dari refs tersedia: **0 temuan**. Metadata 12 kepala PR tidak memuat path privat. GitHub melaporkan 0 alert secret scanning/Dependabot. Binary, teks besar, refs tak terjangkau, fork/clone/cache tidak dinyatakan bersih oleh metode ini. |
| Rotasi key | Tidak ditemukan key yang terbukti bocor pada cakupan scan; service/job key tidak dicabut secara spekulatif. SESSION_SECRET produksi baru memisahkan sesi lokal. Kebocoran di masa depan wajib diikuti rotasi seluruh pemakai, termasuk Vault/Edge Function. |
| Inspect / preview | Preview/Print tamu ber-watermark maksimal 960 piksel pada sisi terpanjang; login memulihkan hasil asli. Original tetap lokal, sehingga pemilik browser masih bisa mengambilnya melalui DevTools/IndexedDB/kamera/screenshot. Bukan DRM. |

## Pengujian yang selesai

- **31 tes Node lulus**: adapter binary/cookie, origin preview, konfigurasi gagal
  tertutup, rotasi sesi gagal dan log tanpa informasi sensitif.
- **42 tes browser dan 25 tes Python lulus di CI** pada PR dan merge main.
  [CI merge main](https://github.com/EGYYFZA/hand-touch-design/actions/runs/40917298803).
- **24 pemeriksaan HTTP Netlify lulus**: HTTPS, header, berkas privat, API,
  cookie, CSRF/CORS, metode dan tidak adanya bypass URL fungsi default.
- **32 pemeriksaan backend online lulus**: akun A/B sintetis, upload/MIME/byte,
  consent, RLS langsung, MFA, sesi, lintas perangkat, revoke, expiry, penghapusan.
- **12 pemeriksaan browser online lulus** dengan kamera sintetis: MediaPipe
  nyata, Photobooth otomatis, watermark/Print, login saat unduh, semua mode,
  tiga viewport, tanpa upload tamu/koneksi eksternal/error halaman.
- Dua suite SQL otorisasi/kuota lulus; semua fixture di-rollback.
- Retensi diperiksa ulang: fungsi berhasil, anonim ditolak, cron aktif setiap
  lima menit dan pengiriman HTTP200.
- Tiga akun dan PNG sintetis tes dibersihkan; daftar cleanup kosong. Tidak
  memakai foto pribadi atau mengirim email dalam pengujian ini.

Perintah tersedia pada tools/test-deployment.mjs, test-deployment-browser.mjs,
test-backend-live.mjs dan audit-repository.mjs. Untuk backend online, arahkan
EGZ_TEST_ENV_FILE ke environment produksi di folder secrets yang diabaikan Git.
Jangan memasukkan nilai secret ke argumen command atau laporan.

## Blockers untuk peluncuran umum

1. Verifikasi domain Resend, SMTP dan pengiriman konfirmasi/pemulihan nyata.
   Jangan membuka signup atau menghapus email confirmation sebagai jalan pintas.
2. Integrasikan widget/token CAPTCHA di UI/BFF dan CSP penyedia, kemudian aktifkan
   proteksi provider. Toggle saja akan merusak Auth.
3. Uji kamera/printer serta Safari/Firefox/Android/iOS nyata. Kamera sintetis
   dan viewport Chromium tidak membuktikan semua perangkat.

## High-value fixes dan operasi

- Batasi anggota tim dan lindungi GitHub/Supabase/Netlify dengan MFA. Jika paket
  mendukung, pindahkan key ke scope Functions berlabel Secret. Preview tetap
  memakai environment/proyek terpisah.
- Siapkan notifikasi lonjakan 401/403/429/503, kegagalan retensi dan kuota.
  Saat ini monitoring melalui dashboard/log, tanpa klaim alert otomatis.
- Pantau biaya, Storage dan backlog. Penghapusan objek aktif tidak membuktikan
  pemusnahan backup provider pada detik yang sama.
- Ikuti [runbook Netlify dan rollback](deploy-netlify.md): terbitkan deploy sehat
  sebelumnya atau hentikan upload; jangan drop tabel/path metadata.

Next action: gunakan beta untuk penerimaan perangkat nyata sambil menyiapkan
domain/SMTP dan CAPTCHA sebelum membuka pendaftaran umum.

## Sumber primer dan skill

[Netlify Functions](https://docs.netlify.com/build/functions/api/),
[environment](https://docs.netlify.com/build/functions/environment-variables/),
[rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/),
[Supabase password security](https://supabase.com/docs/guides/auth/password-security),
[SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha),
[OWASP sesi](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

github-ops dan production-audit dipakai. perl-security tidak mempunyai target
Perl; security-scan tidak mempunyai konfigurasi .claude. Tidak ada scan
AgentShield atau audit Perl yang diklaim dijalankan pada aplikasi JavaScript ini.
