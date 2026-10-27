# EGZ / Gesture Studio

Studio kamera dengan kontrol tangan. Versi web memakai tema cyberpunk biru neon dan memproses video di perangkat. Kamera memenuhi viewport dengan proporsi asli (tepi dipotong bila perlu), dan ekspor mengikuti potongan yang terlihat. Foto web berada di memori tab sampai diunduh; versi desktop menyimpan ke `captures/`.

## Versi browser, Print, dan Vercel

Versi desktop Python dan versi browser tersedia di repository ini. Untuk web:

```text
npm ci --ignore-scripts
npm run dev
```

Buka http://127.0.0.1:4173. Di PowerShell gunakan `npm.cmd` jika `npm.ps1` diblokir.

1. Pilih **Aktifkan kamera** dan setujui izin browser. Izin ini tidak bisa diberikan melalui gesture sebelum kamera aktif.
2. Buka kedua telapak, terlihat utuh, selama satu detik. Lalu arahkan **satu telunjuk** ke tombol kalibrasi dan tahan **0,8 detik**.
3. Pilih menu atau tombol dengan telunjuk yang sama. Lingkaran kursor terisi sebelum memilih. Gerakkan jari keluar dari tombol sebelum memilih lagi. Studio selalu satu layar penuh: kamera menjadi latar, menu mengambang di atas, alat di kanan. Tidak ada scroll halaman. Gerak kursor dihaluskan mengikuti refresh layar; gerak pena dihaluskan terpisah. Tombol **Alat** menyembunyikan panel untuk ruang kamera lebih luas.
4. Semua empat mode tersedia pada navigasi atas. **Gunakan kontrol tombol** adalah jalur aksesibilitas bila kalibrasi tangan tidak memungkinkan; klik dan keyboard tetap tersedia.

| Mode web | Cara memakai |
|---|---|
| Efek Tangan | Dua jari menjadi blur penuh; dua L tegak menjadi blur area; L berbeda arah menjadi mosaik; dua L terbalik menjadi putar area 180 derajat. Area mengikuti kedua tangan. |
| Painting | Cubit jempol dan telunjuk untuk menggambar, lepas untuk berhenti. Telunjuk memilih swatch di panel kanan. Pemilih warna mengambang di samping alat; tahan pada spektrum hue dan bidang saturasi/kecerahan untuk menetapkan warna. |
| Bentuk Painting | Pilih lingkaran, kotak, atau segitiga. Cubit dengan kedua tangan, geser untuk ukuran/posisi, lalu lepas salah satu cubitan saat kedua tangan tetap terlihat. Tracking hilang membatalkan pratinjau. Urungkan memulihkan satu perubahan terakhir, termasuk Bersihkan. |
| Photobooth | Kepalkan tangan setengah detik. Tiga hitung mundur dan tiga tanda jepretan; hasil berupa strip berframe neon dengan tanda kecil EGZ. Buka tangan sebelum sesi berikutnya. Kamera terputus menjeda sesi. |
| Meme | Clingy: senyum + satu telunjuk di mulut. Idea: senyum + telunjuk terangkat. Shock: dua tangan berdekatan di dada + mulut terbuka dan mata/alis terangkat. Tongue: senyum + lidah terjulur. Gambar monyet asli muncul di kanan dan ikut dalam foto. |

Tombol **Hasil** membuka galeri di atas kamera. Panah sebelumnya/berikutnya mengganti foto satu per satu, tanpa scroll. Foto web tersimpan dalam sesi tab, maksimal 12 foto/strip. **Unduh PNG** menyimpan permanen; **Print** membuka dialog browser yang tetap dikendalikan pengguna. Hapus mempunyai konfirmasi di halaman yang dapat dipilih dengan tangan. Kamera berhenti saat tab disembunyikan. Jika ekspor PNG gagal, gambar tetap ditahan di memori dan tombol **Coba simpan foto** tersedia, termasuk setelah kamera dimatikan.

Keyboard: `1-4` memilih mode; `S` menyimpan; Spasi memulai Photobooth; `P` mencetak; Escape membatalkan sesi. Saat fokus ada pada kanvas Painting: panah memindahkan pena/bentuk, Spasi menurunkan/mengangkat pena, Shift+panah mengubah ukuran bentuk, Enter menempel bentuk, Escape membatalkan. Pemilih warna mendukung Tab dan tombol panah.

**Batas deteksi:** pengenalan ini berbasis landmark dan ambang, belum dikalibrasi dengan dataset pengguna. Lidah diperkirakan dari warna di bawah mulut; posisi dada diperkirakan relatif terhadap wajah. Cahaya, warna kulit/bibir, jarak, dan oklusi dapat memengaruhi hasil. Gunakan cahaya netral dan pastikan wajah serta tangan terlihat.

Aset web ada di `web/memes/*.webp`, turunan 640x640 dari `.local-assets/original-memes/*.png`. Folder asli tidak diterbitkan oleh build. Model wajah dimuat ketika pertama masuk Meme. Runtime menggunakan MediaPipe yang sudah terpasang, Canvas 2D, Web Worker, dan kontrol HTML native; tidak menambah framework atau dependensi runtime.

Benchmark dapat diulang dengan `node tools/benchmark-web.mjs` saat server lokal aktif.

Lihat [audit produksi terbaru](docs/release-audit.md) untuk revisi UI minimalis, [riset dan keputusan desain](docs/egz-research.md), [audit fitur](docs/egz-audit.md), serta [benchmark revisi fullscreen](.ecc/benchmarks/egz-2026-10-27.json). Bagian setelah panduan Vercel di bawah menjelaskan **aplikasi desktop Python**, yang mempunyai UI dan pemetaan navigasi tersendiri.

Untuk Vercel, gunakan **Framework: Other**, **Root Directory: root repository**,
**Build: npm run build**, **Output: dist**. Konfigurasi sudah tersedia di
`vercel.json`. Panduan, privasi, rollback, dan catatan riwayat Git ada di
[docs/deploy-vercel.md](docs/deploy-vercel.md).

Kode proyek berlisensi MIT; model dan library pihak ketiga memiliki lisensi
terpisah. Lihat [THIRD_PARTY.md](THIRD_PARTY.md) dan [CONTRIBUTING.md](CONTRIBUTING.md).

## Menjalankan

> **Wajib Python 3.9 – 3.12.** MediaPipe belum punya wheel untuk 3.13/3.14.
> Kalau Python bawaan sistem Anda lebih baru, **jangan** pakai `python -m venv`
> — itu akan membuat venv dengan versi yang salah, dan galat yang muncul
> kemudian berbunyi soal numpy sehingga sebabnya sulit ditebak.
> Sebut versinya secara eksplisit seperti di bawah.

**Sekali di awal** — siapkan lingkungan:

```powershell
cd hand-touch-design
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Belum punya Python 3.12? `winget install Python.Python.3.12`, lalu buka
terminal baru dan cek dengan `py -0p`.

**Setiap kali menjalankan:**

```powershell
cd hand-touch-design
.\.venv\Scripts\python.exe app.py
```

Pakai `.\.venv\Scripts\python.exe` — **bukan** `python app.py`. Kalau versinya
salah, aplikasi berhenti dengan pesan yang menyebut cara memperbaikinya, bukan
traceback.
 
Pilihan lain:

```powershell
.\.venv\Scripts\python.exe app.py --camera 1      # pakai kamera kedua
.\.venv\Scripts\python.exe app.py --config config # folder config lain
```

Tekan `Q` atau `Esc` di jendela aplikasi untuk keluar.

### Saat pertama dijalankan

Aplikasi mengunduh `models/hand_landmarker.task` (~7 MB, dari CDN resmi Google)
karena MediaPipe versi baru memakai Tasks API yang memerlukan berkas model
terpisah. Model **wajah** (`face_landmarker.task`, ~3.7 MB) diunduh saat pertama
kali masuk mode **Meme**. Keduanya sekali saja; setelah itu bisa dipakai luring.

Model **pose** berbeda dari itu dan memang belum ada di awal, jadi aplikasi
memakai klasifikasi berbasis aturan. Statusnya terlihat di rel menu
(`aturan` / `model`).

### Kalau ada yang tidak beres

| Gejala | Sebab dan jalan keluar |
|---|---|
| `Python 3.x tidak didukung MediaPipe` | Venv dibuat versi yang salah. Hapus `.venv`, ulangi langkah persiapan dengan `py -3.12`. |
| `No module named 'numpy.core._multiarray_umath'` | Sama seperti di atas — isi venv tidak cocok dengan interpreternya. Bangun ulang venv. |
| `kamera indeks 0 tidak bisa dibuka` | Kamera dipakai aplikasi lain, atau coba `--camera 1`. |
| Layar hidup tapi tangan tidak pernah terdeteksi | **Cek penutup privasi kamera.** Kalau tertutup, frame masuk semua tapi isinya hitam dan tidak ada yang bisa dideteksi. |
| `gagal mengunduh model tangan` | Tidak ada koneksi. Unduh manual dari URL yang tertulis di pesan, simpan ke `models/hand_landmarker.task`. |

## Melatih model sendiri

```powershell
.\.venv\Scripts\python.exe tools\collect_data.py   # tekan 0-6 sambil berpose
.\.venv\Scripts\python.exe tools\train_model.py    # -> models/pose_model.joblib
.\.venv\Scripts\python.exe app.py                  # otomatis memakai model
```

Model hanya mengenali **pose satu tangan**. Kombinasi dua tangan disusun
secara geometris di `gestures/composer.py`, jadi dataset tidak perlu memuat
setiap pasangan dan setiap rotasi.

## Tampilan

Workspace studio berukuran awal 1120 x 704: navigasi gelap di kiri, kamera di
tengah, lalu petunjuk dan tombol tindakan di bawahnya. Jendela bisa diubah
ukurannya; tata letak mengikuti area tampilan mulai 960 x 640. Rasio gambar
kamera dipertahankan. Ukuran yang lebih kecil ditampilkan dengan skala OpenCV.

`Tab` memindahkan fokus dan `Enter` memilih tombol. Tombol tindakan mengikuti
mode aktif dan bisa diklik. Untuk mengurangi gerakan antarmuka, ubah
`ui.reduced_motion` menjadi `true` di `config/settings.yaml`.

Jika kamera terputus, frame lama tidak dipakai untuk mengambil foto. Sesi
Photobooth dijeda dan tombol **Coba kamera lagi** muncul (`C`). Periksa koneksi,
izin kamera Windows, dan aplikasi lain yang sedang menggunakan kamera.

Jika foto gagal disimpan, hasil tetap tersedia di memori meskipun berpindah
mode. Pilih **Coba simpan** (`S`) atau **Buang foto** (`R`). `Q`/`Esc` meminta
Anda menyelesaikan foto yang belum tersimpan sebelum keluar. Menutup paksa
proses atau jendela tetap menghapus foto yang hanya tersimpan di memori.

## Memilih menu dengan tangan

Acungkan **telunjuk + jari tengah** (pose 'V') ke arah menu di kiri, lalu
**satukan kedua jari itu sebentar dan renggangkan lagi** — itu ketukannya, menu
langsung terpilih. Kursor bulat menunjukkan ke mana Anda menunjuk; ia menjangkau
seluruh halaman, jadi geser tangan ke tepi kiri untuk mencapai rel menu.

Alternatif: **klik mouse** pada tombol menu, atau tekan **`1`–`4`**.

## Peta gesture (mode Efek Tangan)

| Gesture | Hasil |
|---|---|
| Dua jari (peace) | Blur seluruh layar, kerapatan mengikuti jarak jari |
| Dua tangan L tegak | Blur di dalam daerah yang dibentuk jari |
| Satu L tegak + satu L terbalik | Mosaik di dalam daerah itu |
| Dua tangan L terbalik | Isi daerah **diputar 180 derajat** (dibalik dua sumbu) |

**Daerah efek mengikuti ujung jari yang Anda luruskan, bukan kotak tetap.**
Buka lebih banyak jari untuk daerah yang lebih lebar, tekuk sebagian untuk
mempersempit, miringkan tangan untuk memiringkan daerahnya. Tekan `B` untuk
menyembunyikan garis tepinya.

Pemetaan ini data, bukan kode. Ubah `config/gestures.yaml` untuk menukar efek.

## Mode

- **Efek Tangan** — peta gesture di atas.
- **Painting** — melukis dengan mencubit; lihat di bawah.
- **Photobooth** — kepalkan tangan untuk memulai, tiga jepretan dengan hitung
  mundur, hasilnya otomatis disusun jadi strip dan disimpan.
- **Meme** — gambar muncul mengikuti ekspresi + gestur; lihat di bawah.

### Painting: mencubit untuk melukis

Tempelkan **ujung jempol dan telunjuk** (mencubit) = pena turun; geser sambil
menempel untuk menggambar garis mulus dengan warna terpilih. Lepas cubitan =
pena naik.

Warna dipilih dengan **mencubit di atas kotak warna** yang berjajar di atas
kanvas. Kotak terakhir (`hps`) adalah penghapus. Titik kursor menunjukkan warna
aktif dan membesar saat pena turun.

`[` `]` mengubah tebal kuas, `E` beralih penghapus, `C` ganti warna, `R`
mengosongkan kanvas.

### Meme: gambar muncul saat ekspresi cocok

Tidak ada galeri — buat gestur + ekspresi yang tepat, memenya muncul sendiri di
pojok. Setiap meme punya pemicu tetap:

| Meme | Pemicu |
|---|---|
| **idea** | Telunjuk teracung **ke atas** + **senyum** |
| **tongue** | **Julurkan lidah** |
| **clingy** | **Satu jari didekatkan ke mulut** + senyum |
| **shock** | **Dua tangan di depan dada** + wajah kaget (mulut menganga, mata lebar) |

Tekan `M` untuk menampilkan panel ekspresi di kiri-bawah kamera
(senyum, mulut, lidah, mata), berguna untuk melihat mengapa sebuah meme muncul
atau tidak. Panel ini tersembunyi secara bawaan. `+`/`-` mengubah ukuran meme.

Wajah dikenali lewat MediaPipe Face Landmarker. Senyum, rahang, dan mata diambil
dari *blendshape*; lidah dari **warna mulut** (MediaPipe tidak punya blendshape
lidah), jadi ambang `tongue` mungkin perlu disetel per pencahayaan di
`config/settings.yaml` bagian `meme:`.

Ganti gambar meme cukup dengan menaruh `idea.png`, `tongue.png`, `clingy.png`,
`shock.png` di `assets/memes/`.

## Tombol

`S` simpan gambar · `1`–`4` pindah mode · `Q`/`Esc` keluar

Khusus per mode:

| Mode | Tombol |
|---|---|
| Efek Tangan | `K` kerangka tangan · `B` garis tepi daerah efek |
| Painting | `[` `]` tebal kuas · `E` penghapus · `C` ganti warna · `R` kosongkan |
| Photobooth | `Spasi` mulai · `R` batal |
| Meme | `M` panel ekspresi · `+`/`-` ukuran meme |

Garis kerangka tangan **mati secara bawaan** — hanya alat pemeriksa tracking dan
menutupi wajah. Tekan `K` kalau perlu.

## Aset

Taruh gambar Anda di `assets/`. Keterangan lengkapnya ada di
[assets/README.md](assets/README.md).

```
assets/memes/       idea/tongue/clingy/shock .png untuk mode meme
assets/photobooth/  frame.png dan logo.png untuk strip photobooth
```

Gambar tanpa latar transparan otomatis dijadikan kartu stiker bersudut bulat.
Untuk hasil terbaik, pakai PNG yang latarnya sudah dipotong.

## Struktur

```
app.py              titik masuk, tidak berisi logika
config/             semua angka dan pemetaan, bisa diubah tanpa menyentuh kode
core/               kamera, tracking tangan & wajah, geometri, orkestrasi
gestures/           fitur, klasifikasi, ketukan dua jari, komposisi dua tangan
effects/            efek gambar, terdaftar lewat dekorator
modes/              satu file per mode
render/             tema, overlay kamera, halaman & rel menu
storage/            aset dan penyimpanan hasil
tools/              pengumpul dataset dan pelatih model
assets/             gambar yang Anda sediakan sendiri
models/             hand_landmarker.task + face_landmarker.task (diunduh)
data/               dataset.csv hasil tools/collect_data.py
captures/           hasil simpanan
```

Menambah efek: tulis fungsi ber-dekorator `@register("nama")` di `effects/`,
lalu sebut namanya di `config/gestures.yaml`. Pipeline tidak perlu disentuh.

## Catatan teknis

- Landmark dihaluskan dengan One Euro filter, bukan rata-rata bergerak, supaya
  getaran hilang tanpa menambah lag.
- Gesture memakai histeresis: diakui setelah stabil beberapa frame, dilepas
  setelah hilang beberapa frame. Ini yang mencegah efek berkedip.
- Semua ambang jarak dinormalisasi terhadap ukuran telapak, jadi tetap benar
  saat tangan mendekat atau menjauh dari kamera.
- Pembacaan kamera berjalan di thread terpisah agar efek berat tidak menurunkan
  frame rate pratinjau.
- Efek menerima salinan frame, bukan buffer kamera. Jadi efek boleh menulis
  langsung ke frame yang diterimanya tanpa merusak citra asli — itu yang membuat
  penyimpanan citra bersih tetap mungkin.
- Kanvas painting mengikuti resolusi **nyata** dari kamera, bukan yang diminta
  di `config/settings.yaml`. Banyak webcam diam-diam mengabaikan permintaan.
- Halaman putih (bayangan, badan kartu, merek) digambar **sekali** lalu disalin
  tiap frame; hanya bagian dinamis yang digambar ulang. Menghitung ulang
  bayangan lembut tiap frame menurunkan frame rate.
- Deteksi wajah hanya menyala di mode Meme, dan diolah tiap 2 frame
  (`face.every`), supaya mode lain tetap ringan.
- Sebagian mesin Windows memblokir DLL matplotlib lewat Smart App Control, dan
  MediaPipe mengimpornya untuk fungsi menggambar yang tak kita pakai. `core/
  mpcompat.py` memasang tiruan matplotlib kalau yang asli gagal, jadi MediaPipe
  tetap bisa diimpor.
- Daerah efek berupa poligon dari ujung jari yang lurus. Efeknya sendiri tetap
  dikerjakan pada kotak pembatas — jauh lebih murah dan membuat tiap efek tetap
  sederhana; yang membatasi ke bentuk sebenarnya adalah penggabungan bermasker
  di `effects/base.py`.
- Masker itu dihaluskan antar frame, bukan titik poligonnya. Jumlah titik
  berubah setiap kali sebuah jari dianggap lurus atau tidak, jadi tidak ada
  pasangan titik tetap yang bisa dihaluskan satu per satu.
- Penghalusan landmark dan histeresis pose diikatkan ke **sisi tangan**
  (kiri/kanan), bukan urutannya dalam daftar. MediaPipe tidak menjamin urutan
  itu tetap antar frame, dan kalau tertukar, filter tangan kiri dipakai untuk
  tangan kanan lalu landmark melompat.
- Nama aset yang berasal dari config disaring supaya tidak bisa keluar dari
  folder `assets/`.
## Pemeriksaan lokal

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe tools\preview_ui.py
```

Tes tidak membuka kamera. Pratinjau menggunakan frame sintetis dan ditulis ke
`docs/ui-preview/`. Kontrak desain dan batas pemeriksaan ada di
[`docs/ui-contract.md`](docs/ui-contract.md).

Di desktop, setelah foto tersimpan, tombol **Print foto** muncul dan `P` membuka
pratinjau cetak pada browser bawaan. Pilih printer dan kertas pada dialog cetak.
Pratinjau `.print.html` disimpan di samping PNG dalam folder captures dan tetap
lokal. Tombol Print tidak bergantung pada kamera yang masih aktif.

Untuk tes web: `npm test`, `npm run build`, dan `npm run test:e2e` setelah
`npx --no-install playwright install chromium`. GitHub Actions menjalankan tes
desktop dan browser di setiap push/pull request.

## Privacy and security

Camera captures and virtual environments stay local and are ignored by Git. Use only trusted model files. See [SECURITY.md](SECURITY.md).
