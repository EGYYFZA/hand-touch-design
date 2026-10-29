# Audit keamanan sebelum publikasi EGZ

Tanggal: 29 Oktober 2026, Asia/Jakarta. Status: perbaikan lokal dan pengujian
backend selesai; **pendaftaran publik dan deployment produksi belum siap**.
Laporan ini tidak menyatakan aplikasi bebas semua bug atau kerentanan.

## Ruang lingkup dan batas kepercayaan

Audit memakai skill `ecc:security-review`: sumber frontend, backend satu origin,
session cookie, CSRF, upload, Supabase Auth/database/Storage, admin dan retensi.
Skill `ecc:agent-security-hardening` juga dibaca sesuai permintaan, tetapi
aplikasi ini tidak mempunyai runtime agen AI, tool loop atau eksekusi perintah
dari model. Kontrol khusus runtime agen tidak diterapkan secara artifisial pada
aplikasi kamera berbasis landmark ini.

Pengguna menyetujui preview ber-watermark sebelum login dan ekspor resmi sesudah
login. Kamera serta foto asli diproses dan disimpan di browser pengguna.
**Pemilik profil browser tetap dapat mengambil foto asli lewat DevTools,
IndexedDB, kode kamera atau screenshot.** Watermark membatasi preview biasa,
bukan DRM atau otorisasi server. Memblokir klik kanan/F12 tidak menyelesaikan
masalah ini. Batas server yang diuji adalah pengguna tidak dapat mengambil foto
cloud akun lain, sedangkan admin hanya mendapat arsip yang disetujui dan wajib MFA.

## Temuan dan perubahan

| Temuan | Risiko / kondisi | Penanganan |
| --- | --- | --- |
| Preview tamu memuat Blob foto asli | Inspect pada elemen gambar memudahkan penyimpanan hasil bersih | Galeri dan Print tamu memakai salinan maksimal 960 piksel pada sisi terpanjang dengan watermark berulang; login memulihkan hasil asli. Bila preview gagal, tidak ada fallback foto asli ke elemen gambar/Print. Original lokal tetap dipertahankan. |
| SID yang sama dinaikkan ke MFA | Pemegang cookie AAL1 yang dicuri berpotensi ikut memperoleh sesi yang ditingkatkan | MFA membuat SID dan CSRF baru, mencabut SID lama. Peningkatan ditolak jika sesi sebelumnya sudah dicabut. Tes replay cookie lama ditolak. |
| Login ulang meninggalkan sesi browser lama | Cookie lama yang sudah disalin tetap bisa dipakai | Login ulang mencabut SID yang digantikan. Sesi independen perangkat lain tetap tersedia. |
| Pendaftaran faktor admin tambahan belum dibatasi eksplisit di aplikasi | Password saja tidak seharusnya cukup untuk menambah faktor setelah MFA aktif | Jika sudah ada faktor terverifikasi, pendaftaran faktor tambahan memerlukan AAL2. Pemeriksaan faktor gagal berarti permintaan ditolak. |
| Kebijakan browser dapat diperketat | Pengiriman form keluar origin dan penyematan halaman perlu dibatasi | CSP menambah `form-action 'self'`, `font-src 'self'`, `frame-src 'none'`; menambah X-Frame-Options DENY, CORP same-origin dan HSTS pada HTTPS. WASM tetap diizinkan untuk MediaPipe. |
| Konfigurasi salah diterima terlalu longgar | Secret job terlalu pendek, key yang sama untuk dua fungsi, protokol origin yang keliru | Validasi origin HTTPS atau HTTP loopback, key sesi base64 32 byte, secret retensi terpisah minimal 32 karakter, dan nilai wajib tidak kosong. |
| Hasil Photobooth belum langsung terbuka | Pengguna harus mencari hasil di galeri | Strip tiga foto membuka preview otomatis; dialog akun yang masih aktif diselesaikan dahulu. Restore galeri saat reload tidak memaksa popup. |
| Pengkodean foto tertunda saat modal aktif | Rendering kamera terus-menerus menunda callback PNG pada pengujian Chromium | Rendering dijeda selama pengkodean; pemeriksaan kesegaran kamera tetap berjalan. Skenario modal akun lulus tiga kali berturut-turut sesudah perbaikan. |

Temuan sesi berasal dari penelusuran kode; verifikasi live sesudah perbaikan
menguji penolakan replay. Audit tidak mengklaim pernah mencuri cookie pengguna
atau menguji eksploitasi pada akun nyata.

## Cakupan fitur yang diperiksa

| Fitur / batas | Bukti dan hasil |
| --- | --- |
| Kamera, Efek Tangan, Painting, Meme | Tes browser kontrol manual/gesture, poligon L, pinch, penghapus, kehilangan tracking dan model lokal. Kamera hanya aktif setelah tindakan pengguna; mikrofon tidak diminta. |
| Photobooth | Tiga frame, preview otomatis, retry PNG gagal, kamera terputus, login di tengah sesi, dialog akun tidak direbut fokusnya. |
| Galeri lokal, Print, Unduh | Cache per UID, cache tamu terpisah, pembersihan logout/switch/expiry, watermark Print, preview gagal tidak membuka asli, unduh menunggu login. Profil browser yang sama tetap merupakan kepercayaan lokal bersama. |
| Akun dan sesi | Email terverifikasi, cookie HttpOnly/Secure di HTTPS, AES-GCM untuk token provider, CSRF + exact Origin, refresh paralel, logout/re-login/MFA replay. Token provider tidak dikirim ke JavaScript frontend. |
| Persetujuan dan cloud | Tidak upload tanpa consent, tidak retroaktif ketika login/consent aktif, foto lama perlu pilihan khusus, revoke segera menutup akses. |
| Isolasi cloud | User B ditolak membaca/menghapus foto A lewat BFF maupun SDK/Storage langsung; RLS dan grants diperiksa dengan SQL rollback. Role dalam user_metadata tidak memberikan admin. |
| Admin | Membership server + AAL2, penolakan password-only, arsip lintas pemilik setelah MFA, pembatasan faktor tambahan. Pengujian sintetis tidak menyiapkan autentikator pribadi pemilik. |
| Upload dan kuota | Signature PNG, decode/re-encode server, batas byte/dimensi/pixel, kuota atomik per akun/global, idempotency isi/UID dan expiry tidak diperpanjang oleh retry. |
| Retensi | Akses expired ditolak sebelum job; fungsi cloud menghapus objek sintetis melalui Storage API, tombstone membersihkan orphan. Verifikasi ulang pengiriman cron belum dijalankan pada audit ini. |
| Build dan header | Hanya allowlist publik masuk dist; URL privat mengembalikan 404; CSP dan header diperiksa. Nilai secret server tidak ditemukan pada 40 berkas dist. |
| Dependensi dan injeksi | Audit npm runtime melaporkan 0 advisory. Penelusuran sumber tidak menemukan penggunaan innerHTML/eval untuk input pengguna; UUID/input divalidasi dan query memakai parameter SDK/RPC. |

## Hasil pengujian

- Node: **26 lulus**, termasuk kegagalan pencabutan sesi dan larangan MFA menghidupkan sesi yang sudah dicabut.
- Browser Chromium: **42 lulus** pada rangkaian lengkap terakhir, termasuk preview otomatis, watermark, kegagalan preview, Print, login, gesture dan ukuran layar.
- Python desktop: **25 lulus** dengan `.venv/Scripts/python.exe`.
- Backend live: **28 pemeriksaan lulus**, seluruh akun/PNG sintetis milik tes dibersihkan.
- SQL `authorization.sql` dan `global-counts.sql`: **lulus**, seluruh fixture di-rollback.
- `npm audit --omit=dev --json`: **0 advisory** yang dilaporkan saat audit; bukan jaminan tidak ada kerentanan.
- Build: 40 berkas; 0 kecocokan dengan nilai rahasia server lokal. Pemeriksaan tidak mencetak isi kredensial.

Pemeriksaan ulang `npm run retention:check` **tidak dieksekusi**: automatic
approval review gagal akibat batas penggunaan layanan. Ini bukan penetapan
bahwa tindakan tersebut tidak aman. Bukti cron aktif/HTTP200 pada audit terdahulu
tetap dicatat sebagai bukti terdahulu; audit ini tidak menyebutnya hasil cek baru.
Uji fungsi retensi langsung dan penghapusan fisik tetap lulus di rangkaian live.

## Yang masih diperlukan sebelum rilis publik

1. Domain pengirim terverifikasi dan SMTP Resend; pengguna sebelumnya menyatakan
   belum mempunyai domain. Pertahankan email confirmation dan signup publik
   nonaktif sampai pengiriman konfirmasi nyata berhasil.
2. CAPTCHA/rate limit Supabase Auth dan proteksi trafik hosting. Limit BFF tidak
   melindungi endpoint Auth provider langsung atau menjamin ketahanan DDoS.
   Widget CAPTCHA dan penerusan `captchaToken` melalui BFF belum diintegrasikan;
   lakukan bersama penyedia/site key yang dipilih sebelum mengaktifkan CAPTCHA
   provider. Mengaktifkan toggle provider saja akan membuat login/signup gagal.
   CSP juga harus mengizinkan origin penyedia secara spesifik bila diperlukan.
3. Deployment HTTPS, environment server, APP_ORIGIN dan Auth redirect yang tepat,
   pemisahan preview/produksi, lalu smoke test pada URL yang benar-benar dirilis.
4. Verifikasi ulang cron, pantau backlog/fungsi gagal, Storage dan biaya. Retensi
   menghapus objek aktif secara terjadwal; pemusnahan backup provider tidak diuji.
5. MFA pribadi pemilik serta uji kamera/printer nyata, Safari/Firefox, Android/iOS.
   Viewport Chromium dan kamera sintetis bukan pengujian semua perangkat fisik.

`npm run dev` memakai backend di `http://127.0.0.1:4173/`. `npm run dev:demo`
adalah preview operator lokal di 4174 yang sengaja tidak meminta akun; jangan
menggunakannya sebagai bukti gerbang login atau menjalankannya sebagai server publik.

Audit sebelumnya mencatat materi kamera pada riwayat lama. Pemeriksaan refs
Git lokal yang kini terjangkau tidak menemukan path berkas captures/data/.venv;
hal itu tidak membuktikan salinan remote, cache, fork atau clone lama telah hilang.
Tidak ada rewrite riwayat atau publikasi dilakukan pada pengerjaan ini.

## Sumber keputusan

Rotasi sesi setelah autentikasi/perubahan hak mengikuti
[OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
Pembatasan tujuan form memakai
[CSP form-action](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action).
Prasyarat email, RLS dan proteksi Auth merujuk
[Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
dan [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
Integrasi CAPTCHA memerlukan widget dan token sebagaimana
[panduan CAPTCHA Supabase](https://supabase.com/docs/guides/auth/auth-captcha).
