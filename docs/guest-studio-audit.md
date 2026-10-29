# Audit studio tamu, gesture, dan UI

Production audit: **68/100, risky untuk peluncuran publik**. Alur lokal sudah
berfungsi dan backend privat teruji; email pendaftaran publik, proteksi Auth,
dan deployment HTTPS masih menjadi penghalang rilis.

Tanggal: 2026-10-29, Asia/Jakarta. Skor adalah prioritas rekayasa berdasarkan
bukti yang tersedia, bukan sertifikasi atau hasil uji beban.

## What this repo does:

EGZ memproses kamera dan landmark tangan/wajah di browser untuk efek, Painting,
Photobooth, dan Meme. Akun Supabase menyediakan galeri cloud privat, arsip admin
dengan MFA, dan retensi 30 hari. Asumsi beban: satu kamera per tab, banyak
pengguna independen, dengan kuota database bersama; kapasitas produksi belum
dibuktikan melalui load test.

## Alur yang dikonfirmasi pemilik

1. Pengunjung dapat memakai kamera, semua mode, galeri lokal dan Print tanpa akun.
2. Foto tamu disimpan pada perangkat; Unduh PNG membuka dialog login dalam studio.
3. Login eksplisit memindahkan foto tamu ke UID akun. Foto demo lama dan foto UID
   lain tidak diimpor. Batal atau login gagal mempertahankan foto tamu.
4. Login dan persetujuan cloud tidak otomatis mengunggah foto lama. Setelah
   persetujuan aktif, tombol **Simpan foto ini ke cloud** mengirim hanya foto
   yang dipilih. Foto baru mengikuti pengaturan persetujuan akun.
5. Galeri cloud pengguna tetap berupa dialog satu foto per tampilan dengan
   navigasi sebelumnya/berikutnya. Halaman operasi dan MFA admin tetap terpisah.

Pemilik menyetujui penyimpanan tamu antarsesi dan unggah manual setelah login
melalui dua jawaban klarifikasi pada sesi ini. Tidak ada perubahan RLS, hak
admin atau masa simpan cloud.

## Must fix sebelum rilis publik

1. **Pengguna baru belum dapat menyelesaikan signup publik**
   (`server/backend.mjs`, `.env.example`). Login saat unduh adalah langkah
   konversi utama, tetapi signup umum sengaja menghasilkan 503 selama SMTP belum
   siap. Siapkan domain pengirim Resend, SMTP/template, proteksi provider Auth
   dan uji email nyata; tanpa itu pengunjung baru dapat mencoba studio tetapi
   belum dapat membuat akun untuk unduh. Email confirmation tetap wajib.

2. **Origin produksi belum tersedia** (`docs/deploy-vercel.md`). Backend web
   masih berjalan di localhost; cookie HTTPS, URL Auth, izin kamera dan handler
   Vercel belum diuji pada deployment produksi. Atur environment server dan
   origin HTTPS yang tepat lalu lakukan smoke test. Tanpa langkah ini bukti
   lokal tidak membuktikan situs publik berfungsi.

## Should fix

3. **Akurasi kamera nyata dan lintas engine belum terukur**
   (`web/gestures.js`, `web/device-profile.js`). Kamera sintetis dan viewport
   Chromium tidak mencakup oklusi, cahaya rendah, Safari atau kamera ponsel.
   Uji perangkat nyata dengan pose terbuka, jari berhimpit, cubit, genggaman
   ringan dan L miring. Tanpa itu ambang baru masih dapat salah membaca pose.

## Temuan yang sudah diperbaiki

4. **Kamera sebelumnya dipaksa login** (`web/studio-cloud.js:182`). Redirect
   awal menutup seluruh fitur bagi tamu. Studio lokal kini terpisah dari
   ketersediaan Auth; hanya unduh PNG dan data cloud yang membutuhkan akun.
   Tanpa perbaikan ini alur utama bertentangan dengan permintaan pemilik.

5. **L miring tetap menghasilkan kotak tegak** (`web/gestures.js:37`,
   `web/app.js:310`). Min/max dan `ctx.rect()` mengabaikan arah jari. Batas kini
   berupa convex hull ujung ibu jari, telunjuk dan jangkar L; efek serta garis
   memakai poligon yang sama. Kasus degenerat ditolak. Tanpa ini sudut kosong
   pada kotak ikut terkena efek walau berada di luar area jari.

6. **Cubit tertutup tidak melukis; tangan terbuka tidak menghapus**
   (`web/gestures.js:4`, `web/gestures.js:27`). Urutan klasifikasi lama membaca
   cubit sebagai kepalan dan tidak mempunyai aksi hapus. Kontak jempol/telunjuk
   kini menentukan gambar, sedangkan telapak termasuk jari berhimpit dan
   genggaman ringan menentukan hapus. Tanpa ini gesture yang diminta tidak bekerja.

7. **Tangan pertama dan penghapus tombol mengubah arti gesture**
   (`web/app.js:109`). `hands[0]` melewatkan tangan kedua dan state eraser manual
   membuat cubit menghapus. Pemilihan tangan kini mengikuti kandidat aktif;
   operasi gambar/hapus eksplisit, perubahan alat atau loncatan posisi memutus
   stroke. Tanpa ini urutan hasil pelacakan dapat membuat goresan melompat.

8. **Sesi terlambat dapat memulihkan akun lama** (`web/studio-cloud.js:52`,
   `web/cloud-client.js`). Refresh yang saling mendahului dan penguncian tidak
   lengkap memungkinkan UI akun lama muncul setelah logout. Antrean perubahan
   identitas dan nomor generasi membuang respons usang; ekspor juga mencocokkan
   pemilik foto. Tanpa itu tampilan/cache dan identitas aktif dapat berbeda.

9. **Login dapat membuang PNG atau sesi foto yang sedang dibuat**
   (`web/app.js:442`, `web/app.js:715`). Reset lama membuang buffer saat UID
   berubah. Login tamu kini menunggu encoding yang dibatasi waktunya dan
   mempertahankan strip/sesi tertunda. Foto dari sesi tamu tidak mendapat
   persetujuan cloud secara retroaktif. Tanpa ini foto dapat hilang di tengah alur.

10. **Kegagalan cache lama membuang foto sementara dari galeri**
    (`web/studio-cloud.js:52`, `web/app.js:510`). Saat marker UID lama ada tetapi
    IndexedDB diblokir, cleanup menolak sebelum restore. Foto kini tetap
    dipulihkan dari memori, dengan peringatan storage dan jumlah galeri yang
    diperbarui. Tanpa itu pengguna melihat galeri kosong setelah login.

11. **Panel padat dan pindah halaman mengganggu studio satu layar**
    (`web/styles.css`, `web/studio-cloud.css`, `web/cloud-viewer.js`). Login dan
    galeri cloud kini dialog native; layout memakai viewport dinamis, grid
    ringkas pada landscape, pagination foto, dan teks seperlunya. Tes kontras
    membaca token warna saat ini, bukan palet lama. Shortcut studio tidak aktif
    di balik dialog. Tanpa ini hasil tes warna
    lama tidak membuktikan UI baru dan kontrol kecil dapat tertutup.

## Riset dan keputusan UI

- MediaPipe mengembalikan 21 landmark dengan x/y dinormalisasi menurut lebar
  dan tinggi gambar masing-masing. Karena itu metrik pose sekarang memakai
  rasio kamera, bukan jarak langsung pada kedua sumbu normalisasi.
  [Panduan resmi Google](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).
- Canvas dapat membatasi render pada sebuah path; save/restore mempertahankan
  state di luar efek. Ini mendukung poligon L tanpa library tambahan.
  [MDN clip](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip).
- `destination-out` menghapus bagian gambar yang ditimpa. Implementasi
  penghapus lama dipakai kembali dengan ukuran relatif telapak.
  [MDN compositing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation).
- Dialog modal perlu menahan fokus, mendukung Escape dan mengembalikan fokus.
  Elemen HTML dialog dipertahankan; tidak perlu migrasi ke React/Radix untuk
  memperoleh pola ini. [WAI modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- Unit `dvh` mengikuti viewport dinamis. Itu membantu tata letak ponsel, tetapi
  tidak membuktikan performa kamera perangkat nyata.
  [MDN viewport units](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length).

Keyakinan tinggi untuk penyebab bug kode dan perilaku Canvas/modal yang diuji.
Keyakinan sedang untuk toleransi pose pada pengguna nyata: ambang kontak,
jangkauan pinch dan radius telapak adalah keputusan rekayasa yang masih perlu
kalibrasi lapangan, bukan gesture bawaan yang dijamin MediaPipe.

Skill deep-research memandu riset lima submasalah: alur akun, geometri L,
gambar/hapus, layout dan risiko produksi. Firecrawl/Exa tidak tersedia; pencarian
web dan lima dokumen primer dipakai sebagai pengganti, dengan satu agen riset
read-only. Production-audit dan ponytail-audit dipakai untuk bukti kegagalan dan
prioritas. ui-styling dan ui-ux-pro-max memandu token, fokus, target sentuh dan
disclosure. Hasil pencarian gaya yang menyarankan scroll storytelling tidak
dipakai karena bertentangan dengan studio tanpa scroll. Tidak ditambahkan
framework, font eksternal atau dependency runtime baru untuk perubahan ini.

## Evidence checked

- Entry web, worker, gesture, cache, auth/dialog, viewer cloud; handler sesi,
  upload, foto, MFA dan retention; migration/RLS serta konfigurasi build/Vercel.
- Browser checks mencakup tamu, login salah/batal, transfer foto, storage gagal,
  logout dengan respons lama, login selama encoding/Photobooth, persetujuan
  manual, poligon pixel, erase pixel, keyboard, Print, MediaPipe dan build.
- Sembilan viewport: 320×568, 568×320, 375×667, 390×844, 768×900, 1024×768,
  1366×768, 1440×900 dan 844×390. Dokumen tidak scroll; panel tidak overflow
  pada matriks ini. Dialog tetap boleh overflow saat keyboard/zoom memperkecil
  ruang agar kontrol tidak hilang. Zoom tidak dinonaktifkan.
- 24 tes Node, 37 tes browser pada rangkaian penuh, dan 25 tes Python lulus.
  Perubahan terakhir pada shortcut modal dan peringatan cleanup juga diperiksa
  ulang pada tes yang terdampak. Rincian: [status integrasi](backend-integration-status.md).
- 25 pemeriksaan Supabase live diulang dan lulus, termasuk RLS A/B, admin MFA,
  consent revoke, expiry, penghapusan object fisik dan tombstone. Tiga akun
  sintetis beserta foto/row/audit fixture dibersihkan; tidak memakai foto pribadi
  dan tidak mengirim email.
- Audit dependency runtime npm resmi: 0 advisory dilaporkan pada pemeriksaan ini.
  Tidak ada pengiriman source ke layanan audit eksternal.

## Evidence missing dan next action

Belum diuji: email konfirmasi nyata, domain hosting produksi, kamera/printer
fisik, Safari/iOS/Android, volume publik, dan pemusnahan backup provider.
Status CI remote untuk working tree ini belum ada karena perubahan belum
dipublikasikan. Provenance aset meme tetap mengikuti batas pada THIRD_PARTY.md.

Langkah operasional berikutnya: sediakan domain pengirim Resend dan selesaikan
SMTP/proteksi Auth, kemudian deployment HTTPS dan smoke test. Signup umum tetap
ditutup sampai langkah itu selesai; kamera tamu tetap tersedia.

**Verdict:** alur yang diminta sudah diimplementasikan; publikasi layanan akun
masih menunggu konfigurasi produksi dan validasi perangkat nyata. Login unduh
adalah aturan UI, bukan DRM; data tamu pada profil browser bersama tetap berada
dalam batas kepercayaan perangkat tersebut.

**Not checked:** tidak ada klaim bahwa semua bug repo, semua perangkat, seluruh
riwayat Git atau seluruh dependency bebas masalah. Aplikasi desktop mendapat
uji regresi, bukan perubahan UX/login web.
