# EGZ — riset dan keputusan implementasi

27 Oktober 2026. Fokus: alur gesture web, pemilih warna, kemampuan model, dan aksesibilitas. Ini riset teknis untuk implementasi, bukan studi pengguna atau klaim akurasi kamera.

## Temuan yang dipakai

1. Kamera membutuhkan izin pengguna dan konteks aman (HTTPS/localhost). Karena kamera belum tersedia sebelum izin, tahap pertama memakai tombol aktivasi dan dialog browser. Setelahnya kalibrasi dan navigasi dikendalikan tangan. Keyakinan tinggi. [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
2. MediaPipe Hand Landmarker mendeteksi landmark tangan lewat paket Tasks Vision. Paket dan model yang sudah ada dipertahankan, pemrosesan tetap di worker dengan satu frame dalam proses agar antrean tidak tumbuh. Ini keputusan implementasi berdasarkan API yang tersedia, bukan hasil benchmark upstream. Keyakinan tinggi untuk API. [Google Hand Landmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).
3. Face Landmarker menghasilkan landmark dan skor ekspresi. Daftar 52 blendshape yang didokumentasikan berisi senyum, rahang, mata, dan alis, tetapi tidak memuat tongue-out. Karena itu Tongue di aplikasi merupakan perkiraan warna di bawah mulut yang juga memerlukan senyum. Posisi dada dihitung relatif ke wajah. Keduanya perlu pengujian manusia; tidak ada persentase akurasi yang dapat dibenarkan dari tes sintetis. [Google Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker), [daftar blendshape](https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision/drawing_styles/face_landmarker/Blendshapes). Keyakinan tinggi untuk batas API, rendah untuk akurasi heuristik tanpa dataset.
4. Figma membuka pemilih warna dari swatch di sidebar kanan dan menyediakan bidang warna serta slider hue. Implementasi EGZ mengikuti pola interaksi ini: swatch kanan, bidang saturasi/kecerahan, spektrum hue, nilai HEX dan input native. Tidak ada file desain Figma yang diberikan, jadi ini referensi pola, bukan reproduksi file tertentu. [Figma color picker](https://help.figma.com/hc/en-us/articles/360041003774-Update-fills-using-the-color-picker). Keyakinan tinggi.
5. WCAG 2.2 AA menetapkan minimum ukuran target 24×24 CSS px, dengan pengecualian tertentu. EGZ memilih tombol minimum 48 px tinggi untuk toleransi gesture; ini pilihan desain yang lebih besar, bukan ambang wajib WCAG. Fokus terlihat, label input, status, keyboard alternatif, dan reduced motion disediakan. [W3C Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Keyakinan tinggi.

## Keputusan desain

- Biru neon `#38BDF8`, latar navy `#070D19`, panel `#0B1424`, teks `#ECF4FF`, teks sekunder `#9BAFC8`.
- Revisi satu layar: kamera memenuhi viewport, empat mode mengambang di atas, alat mode di kanan, tanpa scroll halaman. Galeri memakai dialog satu foto dengan tombol sebelumnya/berikutnya. Tombol Alat dapat menutup panel.
- Kursor diinterpolasi setiap animation frame dengan respons 35-65 ms sesuai jarak perpindahan; pena memakai smoothing 45 ms. Pemetaan pointer dan ekspor mengikuti crop kamera fullscreen. Angka ini keputusan UX yang diuji secara matematis, bukan hasil studi pengguna.
- Kalibrasi dua telapak 1 detik dan percobaan telunjuk sebelum menu. Dwell 0,8 detik, progres terlihat, pilihan satu kali per gerakan, berhenti ketika tracking hilang.
- Palet tidak berubah ketika jari sekadar melintas; posisi harus ditahan. Bentuk pratinjau hanya ditempel setelah pelepasan cubitan yang terlihat.
- Photobooth mempunyai tiga feedback jepretan dan strip berbatas cyan, nomor foto, tipografi, serta EGZ kecil. Reduced motion mematikan flash, teks jepretan tetap muncul.
- Aset monyet asli dijadikan WebP 640×640, tanpa penggantian gambar. Empat aset total sekitar 129 KB.
- Skill UI/UX lokal dikonsultasikan, tetapi rekomendasi scroll storytelling dan palet monokrom tidak diterapkan karena bertentangan dengan kebutuhan studio gesture dan biru neon. Tidak menambah framework untuk tugas yang sudah ditangani Canvas, DOM, Worker, dan MediaPipe.

## Metode dan batas

Tujuh kueri pencarian dan pembacaan enam halaman dokumentasi resmi/primer yang relevan. Firecrawl/Exa tidak tersedia pada sesi ini; digunakan alat pencarian web yang tersedia. Satu URL Figma awal gagal, lalu URL resmi yang benar ditemukan dan dibaca. Sumber komunitas pada hasil pencarian tidak dipakai sebagai dasar klaim teknis.

Tidak ada riset pengguna, contoh video gesture dari pemilik, dataset berlabel, atau pengukuran lapangan. Hasil pengujian dan batas deployment dicatat terpisah dalam `release-audit.md`.

Skill `ecc:taste` yang diminta dibaca. Skill tersebut khusus pengarahan video/musik; prinsip konsistensi arah visual dan satu aksen diterapkan ke UI biru neon, sedangkan pipeline video, BPM, warna emas, dan efek beat tidak relevan untuk studio kamera ini.
