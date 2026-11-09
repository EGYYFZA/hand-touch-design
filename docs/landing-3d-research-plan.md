# EGZ studio — riset dan plan landing 3D

Tanggal: 9 November 2026, Asia/Jakarta. Status: **DISETUJUI DAN DIIMPLEMENTASIKAN LOKAL**.

Baseline kode: `afc9bd22aaa4724f35ee4b825056e83021753b63`. Bagian riset dan rencana di bawah merekam proposal awal. Setelah pengguna mengarahkan implementasi keseluruhan, landing, dependency, build dan verifikasi lokal diselesaikan; hasilnya dicatat di akhir dokumen. Backend/database dan deployment produksi tidak diubah dalam pekerjaan ini.

## Rekomendasi

Kembangkan maskot bintang limau yang sudah ada menjadi karakter 3D bergaya clay: badan berisi dengan tepi membulat, mata dan senyum hijau, tangan kecil yang melambai, serta beberapa dekorasi 3D dari bentuk mint/lilac/pink/kuning saat ini. Gunakan **Three.js langsung di JavaScript**, geometri original yang dibantu AI melalui kode, dan poster statis sebagai tampilan awal/fallback.

Three.js berlisensi MIT dan menyediakan ekstrusi bentuk dengan bevel. Karena frontend saat ini memakai ES modules biasa, pilihan ini memberi kendali bentuk serta interaksi tanpa memigrasikan aplikasi ke React. Kesimpulan kecocokan ini merupakan penilaian arsitektur; belum dibuktikan melalui prototype atau benchmark. [Three.js](https://github.com/mrdoob/three.js), [ExtrudeGeometry](https://threejs.org/docs/pages/ExtrudeGeometry.html).

AI berperan membantu desain bentuk, penulisan geometry dan koreografi. Tidak diperlukan model AI di browser, inference GPU pada Netlify, ataupun foto pengguna untuk membuat karakter ini.

## Pertanyaan riset

1. Apa identitas visual, motion, dan batas teknis project saat ini?
2. Engine GitHub apa yang paling sesuai untuk satu karakter interaktif pada frontend vanilla?
3. Alat AI/authoring/motion graphics apa yang benar-benar terbuka, dan apa batas lisensi runtime, editor, serta modelnya?
4. Bagaimana mendapatkan nuansa lucu dan hasil motion design yang halus dengan layout satu layar?
5. Bagaimana memastikan render 3D tidak menghambat kamera, aksesibilitas, keamanan publikasi, atau perangkat kecil?

## Review struktur project

Inventaris baseline: **179 file dilacak Git, 19 direktori tingkat atas, dan 15 file di root**. Review mencakup pemetaan seluruh direktori kode dan pembacaan mendalam jalur landing/motion/build/kamera. Ini review struktur dan dampak perubahan, bukan audit keamanan baris demi baris seluruh repository.

Skill `source-command-go-review` telah dibaca. Tidak ada file `.go`, `go.mod`, atau `go.sum` dalam source aplikasi yang ditemukan. Status **Go review: tidak berlaku**; `go vet`, race detector Go, dan linter Go tidak dijalankan. Stack sebenarnya adalah JavaScript, Python, SQL, dan fungsi retensi TypeScript.

| Folder | Fungsi yang ada | Dampak plan landing |
| --- | --- | --- |
| `.github/` | CI dan dependency checks | Pertahankan gerbang CI; tambahkan cakupan lifecycle landing. |
| `api/`, `netlify/` | Adapter hosting/API | Tidak membutuhkan perubahan API untuk dekorasi 3D. |
| `assets/` | Panduan aset aplikasi desktop | Aset web siap-publik tetap melalui `web/` dan allowlist. |
| `config/` | Konfigurasi dan security headers | Scene harus bekerja dengan CSP domain sendiri. |
| `core/` | Kamera/tracking/pipeline Python | Di luar implementasi landing browser. |
| `effects/`, `gestures/`, `modes/` | Efek dan mode aplikasi Python | Pertahankan perilaku aplikasi desktop. |
| `render/`, `storage/` | UI/export/cetak Python | Tidak perlu perubahan untuk maskot landing. |
| `docs/` | Arsitektur, keputusan, laporan | Tempat dokumen proposal ini; ADR lama tidak otomatis berubah. |
| `licenses/`, `models/` | Lisensi dan model MediaPipe | Model tracking bukan model 3D maskot; lisensi baru dicatat bila dipakai. |
| `server/`, `supabase/` | Akun, sesi, RLS, foto, consent, retensi | Tidak diperlukan migrasi backend/database dalam scope ini. |
| `tests/` | Browser, Node, Python regressions | Uji tambahan yang penting: lifecycle scene, fallback, dan transisi kamera. |
| `tools/` | Build, audit, benchmark, renderer tutorial | Build browser saat ini menyalin berkas eksplisit; renderer tutorial terisolasi. |
| `web/` | Frontend vanilla, SVG landing, Canvas kamera | Area utama implementasi. |

Direktori privat/generatif seperti cache, virtual environment, `node_modules/`, `captures/`, `dist/`, `secrets/`, dan hasil tes hanya diinventarisasi berdasarkan peran; isinya tidak dibaca untuk riset visual. File root konfigurasi/build/dependency ikut dipetakan. Tidak ditemukan instruksi `AGENTS.md` yang berlaku dalam pemeriksaan source ini.

Path IDE `plan/skills/design-system/templates/design-tokens-starter.json` tidak tersedia di workspace ini saat review. Token yang dapat diverifikasi berada di `web/theme.css`; dokumen ini tidak mengasumsikan isi file IDE tersebut.

### Temuan kode yang memengaruhi desain

- `web/index.html:27`: dekorasi berupa tile mint, bintang lilac, kapsul kuning, pita pink, dan titik warna.
- `web/index.html:40`: maskot adalah bintang/spark limau tidak beraturan, bermata hijau, tersenyum dan melambai. Nama class `.hand-art` tidak menggambarkan bentuknya secara tepat.
- `web/motion.css:46` dan `web/home-motion.js:14`: motion saat ini terdiri dari float, bob, blink, wave, dan parallax. Ia berhenti ketika opening disembunyikan, tab tersembunyi, atau reduced motion aktif.
- `web/app.js:247`: opening baru disembunyikan setelah permintaan izin kamera dan playback berhasil. Scene 3D kelak harus berhenti **sejak percobaan mengaktifkan kamera**, termasuk selama prompt izin; mengamati `hidden` saja terlambat untuk lifecycle yang diusulkan.
- `web/styles.css:4`: selector `.stage canvas` mengenai semua canvas. Canvas 3D baru harus dibedakan dari `#preview` agar posisi/ukuran/touch rules kamera tidak ikut diterapkan secara salah. Ini risiko integrasi yang diprediksi, bukan bug 3D yang sudah terjadi.
- `web/vision-worker.js:12` dan `:25`: delegate MediaPipe sekarang **CPU**. Tidak ada dasar menyatakan inferensi saat ini memakai GPU. Render dekoratif tetap perlu dihentikan agar tidak menambah beban compositor, memori, dan main thread saat studio digunakan.
- `tools/build-web.mjs:11`: allowlist publik eksplisit, belum ada bundler browser. Bare import `from 'three'` tidak otomatis diselesaikan browser.
- `tools/tutorial-video/package.json`: Three/React/Remotion yang sudah ada hanya dependency alat render video. Itu tidak membuat runtime Three tersedia pada situs publik.
- `config/security-headers.json`: CDN script, remote viewer, dan iframe tidak sesuai CSP sekarang. Modul dan aset scene harus disajikan lokal dari origin website.
- `web/photo-strip.js:65`: frame foto mempunyai stamp karakter sendiri. Perubahan landing tidak memerlukan perubahan hasil ekspor foto.

## Perbandingan proyek GitHub

### Engine browser dan efek

Lisensi dalam tabel adalah yang dinyatakan sumber saat ditinjau; pilihan versi dan dependency transitif tetap diperiksa ketika implementasi.

| Proyek/sumber | Kemampuan dan lisensi | Keputusan untuk EGZ |
| --- | --- | --- |
| [Three.js](https://github.com/mrdoob/three.js) | Engine 3D JavaScript, MIT; mendukung bentuk custom, lighting, material dan animasi transform. | **Utama**: kendali langsung atas karakter original. |
| [OGL](https://github.com/oframe/ogl) | Library WebGL minimal, Unlicense; lebih dekat ke shader/WebGL. | Alternatif jika ukuran runtime terbukti bermasalah; biaya pembuatan material/lighting lebih manual. |
| [Babylon.js](https://github.com/BabylonJS/Babylon.js) | Engine lengkap, Apache-2.0. | Layak, tetapi kemampuan tambahan belum dibutuhkan oleh satu scene landing. |
| [model-viewer](https://github.com/google/model-viewer) | Web component untuk GLB/glTF, Apache-2.0; poster dan pemutaran animasi model. | Alternatif bila dipilih aset GLB rigged, bukan geometri interaktif prosedural. |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | Renderer Three untuk React, MIT. | Tetap cocok pada alat React yang ada; migrasi frontend tidak diperlukan untuk scope ini. |
| [postprocessing](https://github.com/pmndrs/postprocessing) | Efek sesudah render, Zlib. | Opsional setelah profiling; lighting/material/bayangan sederhana dahulu. |
| [Motion](https://github.com/motiondivision/motion) | Core animation MIT; produk premium terpisah. | Tidak perlu dependency tambahan untuk beberapa transform karakter. Integrasi khusus Three di docs saat riset ditandai Motion+ early access. [Dokumentasi animate](https://motion.dev/docs/animate). |

### Authoring, AI-assisted modeling, dan motion graphics

| Proyek/sumber | Kemampuan dan lisensi | Penggunaan yang masuk akal |
| --- | --- | --- |
| [Blender](https://github.com/blender/blender) | Modeling, animation, rendering, compositing; software GPL. | Authoring offline opsional bila bentuk prosedural perlu dipoles lebih jauh. |
| [MCP for Blender](https://github.com/ahujasid/mcp-for-blender) | Kode MIT; AI dapat menjalankan Python dalam Blender. Beberapa integrasi generasi aset memakai layanan premium/API. | Opsional untuk authoring. Script Python lokal yang ditinjau cukup untuk satu maskot; add-on tidak menjadi bagian website. |
| [glTF-Blender-IO](https://github.com/KhronosGroup/glTF-Blender-IO) | Importer/exporter glTF Blender, Apache-2.0. | Jalur alternatif Blender → GLB; validasi bentuk, material, dan animasi di browser, bukan menganggap semua efek Blender ikut terekspor identik. |
| [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | TypeScript + editor preview, MIT; fokus animasi vektor informatif. | Opsi motion graphics bergaya explainer. Bukan kebutuhan runtime landing 3D. |
| [Theatre.js](https://github.com/theatre-js/theatre) | Timeline numerik/3D; core Apache-2.0, editor Studio AGPL-3.0. | Opsi bila koreografi makin kompleks. Sapaan pendek belum membutuhkan editor timeline tambahan. |
| [Remotion versi terpasang](https://github.com/remotion-dev/remotion/blob/v4.0.539/LICENSE.md) | Source tersedia dengan lisensi khusus dan kelayakan penggunaan gratis tertentu; bukan MIT/Apache tanpa batas. | Pipeline tutorial sudah ada; boleh dievaluasi untuk poster/video jika syarat penggunaan sesuai. Bukan dependency kamera/browser. |
| [Lottie-web/Bodymovin](https://github.com/airbnb/lottie-web) | Runtime/exporter MIT. | Relevan untuk aset vektor; alur exporter After Effects tidak mengubah Adobe menjadi editor OSS. |
| [Rive runtime](https://github.com/rive-app/rive-runtime) | Runtime MIT; editor/layanan AI berada di bawah ketentuan layanan tersendiri. [Terms](https://rive.app/docs/legal/terms-of-service). | Tidak menyamakan lisensi runtime dengan editor. Tidak dipilih sebagai integrasi baru untuk rilis ini. |

"After effect design" ditafsirkan sebagai kualitas motion graphics: timing, easing, lapisan kedalaman, compositing, dan transisi. Hasil seperti itu dapat dibuat dari kode, bukan harus memakai aplikasi Adobe atau mengekspor seluruh animasi sebagai video. Video hasil render tidak memberi interaksi perspektif yang sama dengan scene 3D live; ini alasan memilih scene live untuk greeting yang merespons pointer.

### Generator AI 3D: pilihan eksperimen, bukan jalur wajib

| Proyek/sumber | Fakta yang relevan | Penilaian |
| --- | --- | --- |
| [TripoSR](https://github.com/VAST-AI-Research/TripoSR) | README menyatakan source dan pretrained models MIT; sekitar 6 GB VRAM pada konfigurasi default. | Kandidat eksperimen offline. Tetap perlu menilai siluet, mesh, dan bagian yang akan dianimasikan; belum terbukti menghasilkan rig EGZ siap pakai. |
| [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) | Kode dan model MIT; repo meminta Linux/NVIDIA ≥24 GB. [Model card](https://huggingface.co/microsoft/TRELLIS.2-4B) menyebut batas kualitas mesh/gaya. | Eksplorasi aset offline, tidak diperlukan untuk bentuk maskot geometris ini. |
| [Hunyuan3D-2.1 LICENSE](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE) | Tencent Community License mempunyai pembatasan penggunaan/wilayah. | Tidak dimasukkan kelompok OSS permisif dan tidak dipilih sebagai default. |
| [Stable Fast 3D LICENSE](https://github.com/Stability-AI/stable-fast-3d/blob/main/LICENSE.md) | Stability AI Community License bersyarat. | Source-available, bukan pengganti MIT/Apache tanpa syarat. |

GSAP juga tidak dikategorikan sebagai OSS permisif: lisensi [Standard No Charge](https://gsap.com/community/standard-license/) berbeda dari MIT/Apache. "Gratis dipakai", "source tersedia", "model open weights", dan "open source" tidak disamakan dalam keputusan ini.

**Pilihan AI yang direkomendasikan:** mulai dari geometry original yang terkontrol dan koreografi yang dibantu AI. Generator neural baru dipertimbangkan bila ada kebutuhan bentuk organik kompleks yang tidak terpenuhi; foto pengguna tidak dibutuhkan sebagai input.

## Arah visual: maskot yang sama, kini memiliki volume

Ini proposal desain, bukan preview yang telah dibuat.

- **Badan:** pertahankan siluet bintang tidak beraturan dan warna `--festival-lime`; tambah ketebalan dan bevel lembut. Hindari menggantinya dengan karakter manusia/robot generik.
- **Wajah:** mata hijau gelap berbentuk oval/capsule, senyum sederhana, tatapan kecil mengikuti pointer. Mata dan lengan terpisah agar motion dapat dikendalikan tanpa skeletal rig kompleks.
- **Material:** clay matte/satin, highlight lembut, warna cerah di atas putih. Mulai dari pencahayaan sederhana dan bayangan kontak ringan, tanpa HDR besar atau postprocessing penuh layar.
- **Dekorasi:** turunkan tile mint, star lilac, kapsul kuning, dan pita pink yang ada menjadi tiga atau empat objek bervolume. Tetap sisakan ruang kosong di sekitar nama, CTA, dan teks error kamera.
- **Komposisi:** satu scene dekoratif; header, judul, tombol Aktifkan kamera dan Privacy Policy tetap HTML. Desktop memberi ruang lebih lega; mobile mengurangi jumlah/ukuran dekorasi; landscape pendek memakai komposisi atau poster ringkas. Tetap satu viewport tanpa page scroll di studio.
- **Token:** baca nilai yang sudah ada dari `web/theme.css`. Jangan menduplikasi palette dalam template token baru yang belum terverifikasi.

### Storyboard sambutan

| Waktu/trigger | Gerakan yang diusulkan | Tujuan |
| --- | --- | --- |
| Sebelum scene siap | Poster/SVG tampil langsung; CTA aktif | Halaman langsung dapat dipakai. |
| 0–0,7 detik | Karakter masuk lembut, sedikit squash lalu settle | Memperlihatkan volume tanpa gerakan mendadak. |
| 0,7–2,6 detik | Satu sapaan melambai dan satu kedipan | Identitas ramah/lucu. |
| 2,6–4 detik | Dekorasi dan karakter berhenti di pose sambutan | Menjaga fokus pada CTA. |
| Pointer bergerak setelahnya | Lirikan/tilt kecil dengan batas sudut, lalu kembali tenang | Interaktif tanpa mengambil alih halaman. |
| Touch/keyboard | Semua fungsi HTML tetap langsung digunakan; hover tidak menjadi syarat | Setara di berbagai perangkat. |

Sambutan otomatis dibuat selesai dalam 3–4 detik, bukan infinite loop. Ini mempertahankan keputusan sebelumnya untuk menghapus tombol pause: W3C menjelaskan gerakan otomatis lebih dari lima detik yang tampil bersama konten lain memerlukan mekanisme pause/stop/hide bila tidak esensial. Mode reduced motion memakai pose statis dan meniadakan tilt/motion dekoratif. [W3C Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), [W3C reduced motion](https://www.w3.org/WAI/WCAG22/Techniques/css/C39).

## Rencana teknis setelah arahan lanjut

### Tahap 1 — bentuk dan motion preview

Turunkan outline SVG ke shape 3D original dengan bevel, buat wajah/lengan terpisah, dan tampilkan tampak depan serta tiga-perempat untuk menilai identitas karakter. Susun greeting sesuai storyboard dan satu poster dari karakter final. Keluaran: model/scene ringan dan preview lokal yang dapat ditinjau, belum deployment produksi.

### Tahap 2 — progressive enhancement landing

Gunakan `web/home-motion.js` sebagai pengendali lifecycle dan modul scene kecil, misalnya `web/home-scene.js`, untuk geometry/rendering. Poster tetap tersedia saat modul belum selesai, WebGL2 tidak tersedia, atau scene gagal. Versi Three saat ini memerlukan WebGL2; karena itu fallback harus diuji. [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).

Tambahkan hanya dependency browser Three yang dipilih/pin saat implementasi. Build menyalin ekspor ES module yang diperlukan, termasuk modul core yang dirujuk, ke direktori vendor lokal. Import harus berupa relative URL yang dapat diselesaikan browser; tidak bergantung pada bare import, CDN atau inline import map. Sertakan lisensi melalui build dan `THIRD_PARTY.md`. Bundler baru hanya dipertimbangkan jika jalur vendor yang sederhana terbukti tidak cukup.

### Tahap 3 — lifecycle kamera dan kegagalan

Hubungkan scene dengan `startCamera()`, `stopCamera()`, serta jalur gagal/ditolak di `web/app.js` melalui hook kecil yang eksplisit. Hentikan render saat percobaan start, sebelum meminta kamera. Impor/initialization yang selesai terlambat tidak boleh menghidupkan scene ketika kamera sudah aktif. Selama kalibrasi, menu dan studio, scene dekoratif tidak berjalan.

Saat benar-benar meninggalkan landing, hentikan loop dan lepas resource/listener yang dimiliki scene. Penghapusan mesh saja tidak membuang resource GPU; geometry, material, texture, render target dan renderer memerlukan cleanup yang sesuai. Bila kamera gagal atau dimatikan, tampilkan fallback segera dan bangun ulang scene secara terkendali bila masih diperlukan. Tangani context loss tanpa retry loop tak terbatas. [Three disposal](https://threejs.org/manual/pages/how-to-dispose-of-objects.html), [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

### Tahap 4 — responsive dan anggaran performa

Gunakan ukuran container/aspect yang benar dan batasi resolusi render. Hindari menerapkan DPR perangkat tanpa batas. Titik awal yang akan diuji: DPR maksimum 1,5 pada desktop dan 1 pada profil hemat, satu renderer, maksimal empat dekorasi, tanpa texture/HDR besar atau physics. Target 30 FPS selama greeting/interaksi; setelah settle tidak ada render loop terus-menerus. Nilai ini **target eksperimen, bukan hasil benchmark**. [Three responsive rendering](https://threejs.org/manual/pages/responsive.html).

Ukuran unduhan scene/runtime yang dikompresi ditargetkan ≤500 KiB di luar aset aplikasi yang sudah ada; poster ditargetkan ≤120 KiB. Angka final diperiksa terhadap artefak build. Jika target visual/performa tidak tercapai, kurangi detail/efek atau gunakan poster pada profil hemat sebelum menambah library. Persetujuan kamera tidak boleh menunggu asset 3D.

### Tahap 5 — verifikasi dan review rilis

- Visual: karakter masih dikenali sebagai maskot lama, bukan sekadar primitive generik; lighting, tepian dan gerak dinilai dari preview nyata.
- Viewport: 320×568, 390×844, 568×320, 844×390, tablet, laptop dan desktop; CTA, Privacy Policy dan pesan izin/error tetap terlihat tanpa scroll/overlap.
- Lifecycle: camera-start, izin ditolak, kamera gagal, stop/start berulang, tab tersembunyi, reduced motion berubah, import terlambat, WebGL unavailable dan context loss.
- Aksesibilitas: canvas dekoratif tidak mengambil fokus; semua tindakan tetap HTML/keyboard/touch; reduced motion benar-benar menghentikan motion JavaScript dan CSS.
- Regresi: tes build allowlist dan keamanan publikasi, workflow browser yang terdampak, serta pengujian kamera/gestur yang relevan. Perluas tes hanya bila ditemukan perubahan dampak atau kegagalan.
- Resource/performa: buktikan loop berhenti dan resource tidak terus bertambah setelah beberapa siklus landing–kamera. Benchmark di perangkat nyata bila tersedia; hardware pengguna belum diukur pada tahap plan.
- Rilis: siapkan diff dan preview yang reviewable; lakukan secret/dependency checks dan verifikasi CSP tanpa melonggarkannya untuk dekorasi. Publikasi produksi menjadi langkah setelah implementasi diverifikasi.

### Perkiraan berkas yang tersentuh

| Berkas | Perubahan yang direncanakan |
| --- | --- |
| `web/index.html` | Mount scene/fallback sambil mempertahankan struktur CTA/aksesibilitas. |
| `web/home-motion.js`, modul scene baru | Koordinasi visibility/reduced motion, loading, pointer dan cleanup. |
| `web/app.js` | Hook start/stop/failure kamera yang mencegah scene berjalan bersamaan. |
| `web/styles.css`, `web/motion.css` | Scope canvas kamera/scene dan ganti hanya motion artwork landing. |
| `web/` aset poster original | Poster untuk loading/reduced motion/failure. |
| `tools/build-web.mjs` | Vendor module graph dan aset publik yang diizinkan. |
| `package.json`, lockfile, `THIRD_PARTY.md`, lisensi | Dependency Three terpilih dan notices yang benar. |
| Tes browser/build yang relevan | Lifecycle dan fallback baru; cakupan regresi layout tetap bermakna. |

Model GLB, loader/decoder, MIME tambahan, Blender MCP, compositor berat dan timeline editor tidak menjadi baseline. Jika evaluasi visual kemudian memilih Blender → GLB, baru tambahkan bagian yang diperlukan dan audit referensi texture/decoder agar tidak mengambil aset CDN diam-diam.

## Risiko dan pertanyaan yang belum dibuktikan

| Hal | Status / cara menyelesaikan |
| --- | --- |
| Kualitas visual geometry prosedural | Belum ada render baru; nilai model sheet dan preview sebelum memutuskan jalur GLB. |
| FPS, bundle size, penggunaan memori/GPU | Target belum diukur; lakukan spike kecil dan transisi kamera berulang saat implementasi. |
| Dukungan WebGL2/perangkat hemat | Fallback statis wajib; tidak menganggap semua laptop/ponsel mendukung konfigurasi sama. |
| Lisensi aset selain kode | `THIRD_PARTY.md:46` mencatat hak gambar meme yang sudah ada belum terdokumentasi. Ini item review hak aset sebelum rilis umum, bukan bukti bahwa kode MIT mencakup gambar tersebut. Maskot baru dibuat original. |
| Template token dalam tab IDE | Path tidak ditemukan di workspace; acuan nyata adalah `web/theme.css`. |
| Alat/model AI tertentu | Belum dipasang/diunduh/diuji; kompatibilitas OS/GPU dan output rig tidak diasumsikan. |

## Metodologi, confidence, dan batas riset

Riset dibagi menjadi pemeriksaan source, evaluasi engine web, serta alur AI/authoring dan motion graphics. Dokumen ini merujuk **30 URL sumber primer**: GitHub, lisensi proyek, model card pembuat dan dokumentasi resmi; tautan berada di dekat klaim. Firecrawl/Exa tidak tersedia, sehingga pencarian dan pembacaan menggunakan tool web yang tersedia. Jalur riset AI mencatat delapan query pencarian; jalur utama menambahkan tiga query WebGL/aksesibilitas, serta pembacaan langsung dokumentasi/repository. Jumlah query total lintas jalur engine tidak direkap.

Dokumen yang dibaca mendalam meliputi lifecycle/disposal Three, WebGL best practices, W3C motion, lisensi Remotion v4.0.539, pembagian lisensi Theatre, serta README/lisensi TripoSR, TRELLIS.2 dan generator bersyarat. URL manual Three lama yang gagal diakses diganti dengan `/manual/pages/`; beberapa halaman manual/API Blender gagal fetch dan diganti sumber resmi GitHub/Khronos yang tersedia. Tanggal akses sumber adalah 9 November 2026; versi/lisensi yang dipilih perlu dicek ulang saat pemasangan.

**Confidence saat riset:** tinggi untuk struktur source, API dan perbedaan lisensi yang ditautkan; sedang untuk kecocokan Three prosedural sebelum prototype. Pada tahap riset awal tidak ada implementasi, benchmark, unduhan model atau deployment. Bukti implementasi berikut tidak mengubah batas bukti riset awal tersebut.

## Hasil implementasi lokal — 9 November 2026

- Dipasang **Three.js 0.187.0**, satu dependency baru, dipin di root package dan lockfile. Paket ini tidak membawa dependency tambahan. Dua modul browser disalin tanpa modifikasi ke `dist/vendor/`, dengan lisensi MIT di `dist/licenses/Three-MIT.txt`. Versi ini mendistribusikan modul non-minified; angka gzip di bawah adalah pengukuran kompresi lokal, bukan ukuran berkas mentah atau transfer produksi.
- `web/home-scene.js` membuat badan maskot dari outline SVG original dengan bevel, wajah dan lengan terpisah, warna CSS yang sama, material matte, lighting dan bayangan ringan, serta empat dekorasi 3D pada desktop. Ponsel memakai dua dekorasi dengan komposisi yang menjauhi CTA.
- Sapaan selesai setelah sekitar empat detik. Tatapan dan tilt merespons mouse; renderer berhenti ketika pose sudah settle. Landscape pendek memakai komposisi statis, reduced motion tidak mengunduh runtime scene, dan WebGL/import/context-loss failure mempertahankan poster serta kontrol HTML.
- Tambahan setelah uji lokal: keempat dekorasi sekitar ikut mengikuti kursor dengan parallax, tilt dan rotasi kecil menggunakan smoothing yang sama. Kedalaman gerak berbeda per objek, diperkecil pada viewport sempit, dan dihitung dari pose asal agar tidak bergeser kumulatif. Tes browser membandingkan render pada empat area dekorasi sebelum/sesudah pointer, lalu memverifikasi render berhenti kembali. Tujuh tes landing lolos setelah perubahan ini; dua screenshot tambahan merekam respons kiri/kanan. Angka benchmark di bawah berasal dari pengukuran sebelum tambahan parallax dekorasi ini.
- `web/home-motion.js` mengoordinasikan lazy import, visibility, modal, layout, reduced motion dan cleanup. `web/app.js` menghentikan scene sebelum `getUserMedia`; late import tidak membuat scene di atas kamera. Resource renderer dilepas saat kamera aktif atau tab disembunyikan, lalu dibangun ulang secara terkendali saat landing kembali.
- Selector canvas kamera dibatasi ke `#preview`. Header, menu, alat, tutorial, alur login/unduh, consent dan foto tidak didesain ulang.
- Poster original `web/home-mascot.webp` dirender dari scene yang sama: **560×420, alpha/transparan, 21.900 byte**. `npm run home:poster` mengulang render dengan server demo lokal aktif; jalankan build sesudahnya. Tidak memakai foto pengguna atau layanan generasi gambar eksternal.
- README, build allowlist, lisensi dan benchmark lama diperbarui agar mendeskripsikan runtime baru secara benar. Tidak diperlukan Blender MCP, framework React pada browser, model neural, ataupun compositor tambahan untuk hasil ini.

### Verifikasi yang selesai

| Pemeriksaan | Hasil dan cakupan |
| --- | --- |
| Build + Node tests | Build lolos; **31 tes Node lolos**, termasuk allowlist publik, sesi, CSRF, validasi PNG, header dan file privat. |
| Browser regressions | **56 tes browser lolos**: tujuh tes landing baru serta seluruh 49 workflow sebelumnya. Runner Windows sempat menunggu cleanup server; server tes yang diverifikasi ditutup dan runner berakhir dengan exit 0. |
| Pemeriksaan setelah penyesuaian komposisi ponsel | Tujuh tes landing diulang dan lolos; bukti visual diperbarui. Tidak ada perubahan perilaku kamera/akun dalam penyesuaian posisi dekorasi ini. |
| Review visual | Tujuh ukuran: 320×568, 390×844, 568×320, 844×390, 768×900, 1366×768, 1440×900. CTA/privacy tetap dapat dijangkau tanpa page scroll; short landscape sengaja memakai artwork statis. |
| State dan aksesibilitas | Loading tertunda, poster/reduced motion, module/WebGL gagal, context loss, prompt izin sintetis, penolakan kamera, tab visibility simulasi, fokus keyboard dan transisi kamera berulang diperiksa. |
| Bukti lokal | Screenshot dan JSON di `docs/ui-preview/home-3d/`; checker bukti skill frontend-design-direction lolos. Tidak ada page error atau request eksternal pada pengambilan bukti landing. Semua artefak ini diabaikan Git. |
| Dependency dan repository | `npm audit` melaporkan 0 kerentanan. Pemindaian repository melaporkan 0 secret dan 0 jalur privat pada working tree/history yang diperiksa; binary dan berkas >2 MiB berada di luar pemindaian konten. |

### Pengukuran lokal

Alat yang diperbarui: `node tools/benchmark-web.mjs http://127.0.0.1:4174`. Ia memakai Chromium headless, SwiftShader, koneksi loopback tanpa throttling, tiga context browser baru dan kamera sintetis untuk inferensi CPU MediaPipe. Tidak ada foto orang nyata atau unggahan cloud. Hasil tersimpan lokal di `.ecc/benchmarks/egz-2026-11-09.json`.

- Runtime landing tambahan sekitar **416 KiB gzip**, di bawah target 500 KiB; poster sekitar **21,4 KiB**, di bawah target 120 KiB.
- Sapaan mencatat **29,1–29,4 FPS** pada tiga run software renderer. Penghitung render tidak bertambah setelah settle, dan canvas dekoratif tidak ada saat kamera berjalan.
- FCP lokal 108–136 ms dan CLS sekitar 0,000265. Server loopback menyajikan modul tanpa kompresi sehingga transfer awal terukur sekitar 2,99 MB; angka itu tidak disamakan dengan gzip atau performa internet produksi.
- Inferensi CPU dengan piksel kamera sintetis: Efek Tangan p50 sekitar 47 ms/p95 61,8 ms; Meme p50 sekitar 57,3 ms/p95 75,4 ms. Tidak ada kesimpulan akurasi deteksi tangan/wajah dari input sintetis ini.
- Belum mengukur GPU/kamera fisik, browser Safari/iOS/Android nyata, jaringan seluler, field INP, atau produksi Netlify pada perubahan ini. Tidak ada push, merge atau deploy untuk pembaruan 3D ini.

## Revisi transisi dan splash — 10 November 2026

Revisi ini menggantikan perilaku awal yang membuang scene saat tombol kamera diklik serta komposisi statis khusus landscape pendek. SVG dekorasi datar sudah diganti empat WebP transparan hasil render dari objek Three yang sama: mint, bintang, tiket dan pita, total 18.022 byte. Poster maskot tetap 21.900 byte. Aset ini dipakai saat runtime sedang dimuat, reduced motion, atau WebGL tidak tersedia, sehingga bahasa visual tetap bervolume.

Splash singkat memakai maskot dan dekorasi EGZ dengan gerak ringan, tombol Lewati dan batas tunggu sekitar empat detik. Scene baru ditandai siap setelah render frame pertama berhasil. Selama prompt izin kamera, scene yang sama tetap hidup; penolakan izin tidak menggantinya dengan ilustrasi datar atau renderer baru. Scene dilepas setelah video siap, sebelum worker gestur dimulai. Landscape pendek memakai komposisi dua kolom agar karakter 3D, pesan kesalahan, CTA dan Privacy Policy tetap terlihat tanpa scroll.

Verifikasi lokal: 31 tes Node dan 19 tes browser terkait lulus. Tes baru memeriksa identitas canvas selama prompt dan penolakan izin, transisi saat video siap, splash saat cold import, Lewati, batas tunggu import yang macet, serta komposisi enam viewport. Tes pemutaran tutorial, unduhan PNG asli tanpa login/watermark dan isolasi galeri juga lulus. Screenshot splash, desktop, landscape, ponsel, menunggu izin dan izin ditolak serta laporan JSON tersimpan pada `docs/ui-preview/home-transition/`, diabaikan Git. Audit repository melaporkan nol secret/jalur privat pada cakupannya. Angka benchmark tanggal 9 November di atas tetap merupakan hasil historis; revisi ini belum dibenchmark pada perangkat fisik atau dideploy.
