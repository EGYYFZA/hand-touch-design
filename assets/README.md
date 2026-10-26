# Folder aset

Versi open source menyertakan empat stiker yang digambar oleh kode di
`storage/assets.py`; PNG tambahan tidak diperlukan. Gambar kustom dibaca jika
tersedia secara lokal. Folder PNG meme/photobooth diabaikan oleh Git agar foto
pribadi dan aset yang izinnya belum jelas tidak ikut dipublikasikan.

Taruh gambar Anda di sini. Format yang dibaca: `.png`, `.webp`, `.jpg`, `.jpeg`
— dicoba sesuai urutan itu. **Pakai PNG dengan latar transparan** kalau ingin
gambarnya menempel rapi di atas tangan; JPG akan muncul sebagai kotak penuh.

Nama berkas disebut **tanpa ekstensi** di config dan manifest.
Gambar dibaca sekali lalu ditahan di memori, jadi kalau Anda mengganti berkas
saat aplikasi berjalan, tutup dan jalankan ulang untuk melihat perubahannya.

```
assets/
  memes/        gambar untuk mode "Meme" (dipicu ekspresi + gestur)
  photobooth/   bingkai dan stiker untuk strip photobooth
```

---

## memes/

Empat berkas, satu untuk tiap pemicu ekspresi:

```
assets/memes/
  idea.png      telunjuk ke atas + senyum
  tongue.png    julurkan lidah
  clingy.png    satu jari di mulut + senyum
  shock.png     dua tangan di dada + wajah kaget
```

Pemicunya sudah tetap di dalam kode — Anda cukup mengganti gambarnya. Namanya
harus persis seperti di atas. Ambang tiap ekspresi (senyum, kaget, lidah) diatur
di `config/settings.yaml` bagian `meme:`.

Kalau sebuah berkas gambar tidak ada, aplikasi memberi tahu sekali di konsol lalu
melanjutkan — tidak berhenti.

## photobooth/

- `frame.png` — bingkai yang ditempel di **setiap jepretan**. Harus PNG
  transparan di bagian tengahnya, kalau tidak fotonya tertutup. Ukuran bebas,
  akan diregangkan mengikuti ukuran frame kamera.
- `logo.png` — ditempel di pojok kanan bawah strip. Opsional.

Kedua berkas ini opsional. Kalau tidak ada, strip dibuat polos seperti biasa.
