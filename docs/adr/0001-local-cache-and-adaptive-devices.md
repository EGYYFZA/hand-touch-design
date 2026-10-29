# ADR-0001: Cache lokal dan profil perangkat adaptif

**Date**: 2026-10-29  
**Status**: proposed  
**Deciders**: pemilik aplikasi; Codex sebagai penyusun

## Context

Foto sebelumnya hanya bertahan di memori tab. Pemilik menginginkan hasil lokal,
dukungan berbagai perangkat dengan prioritas laptop/desktop, dan telah memilih
akun untuk akses lintas perangkat. Pencatatan ADR ini sebagai proposed sudah
disetujui. Saat proposal awal ditulis, backend akun belum dibuat.

## Decision

Gunakan IndexedDB untuk cache Blob PNG dan Unduh PNG untuk salinan berkas,
dengan batas lokal 12 hasil/40 MiB tanpa penghapusan otomatis saat penuh.
Pada versi publik yang memakai akun, wajib batasi cache berdasarkan UID yang
terautentikasi dan bersihkan cache/Blob URL saat logout atau berganti akun.
Gunakan profil kamera/inferensi ringan pada perangkat terbatas dan profil lebih
detail pada desktop; mouse, sentuh, dan keyboard tetap tersedia.

## Alternatives Considered

### Memori tab saja

- **Pros**: sederhana dan tidak meninggalkan galeri setelah tab ditutup.
- **Cons**: kehilangan foto saat reload atau tab ditutup.
- **Why not**: tidak memenuhi kebutuhan menyimpan hasil lokal antarsesi.

### localStorage atau File System API sebagai satu-satunya penyimpanan

- **Pros**: localStorage sederhana; akses filesystem dapat membuat berkas langsung.
- **Cons**: base64 menambah ukuran; File System API memerlukan izin/dukungan khusus.
- **Why not**: IndexedDB mendukung Blob dan ekspor Unduh PNG tetap lintas browser.

### Galeri cloud saja

- **Pros**: pemulihan lintas perangkat lebih mudah.
- **Cons**: bergantung koneksi dan persetujuan cloud untuk setiap foto.
- **Why not**: foto lokal harus tetap tersedia bila upload gagal atau ditolak.

## Consequences

### Positive

- Reload dapat memulihkan foto setelah transaksi simpan berhasil.
- Pembatasan inferensi mengurangi pekerjaan pada perangkat kecil/terbatas.
- Foto tetap dapat diunduh jika penyimpanan persisten gagal.

### Negative

- Storage dapat dibersihkan/dieviksi; bukan cadangan permanen.
- Cache bergantung pada identitas akun; perubahan alur Auth harus menjaga isolasi UID dan pembersihan logout.
- Perubahan resolusi inferensi perlu pengujian akurasi/performa pada perangkat nyata.

### Risks

- Demo tanpa akun masih memakai satu galeri per profil browser. Versi terhubung
  wajib mempertahankan login, cache per UID, dan pembersihan saat pergantian akun.
- Orang yang menguasai profil browser/perangkat tetap berada di trust boundary
  lokal; jangan menjanjikan perlindungan terhadap akses fisik/devtools.
- Foto demo tanpa owner tidak boleh otomatis dikaitkan ke akun yang baru login.
- Uji reload, isolasi browser context, kuota, gagal simpan, hapus, dan perangkat fisik.

## Implementation update — 2026-10-29

Auth, IndexedDB per UID, karantina foto demo, serta pembersihan cache/Blob URL
saat logout, pergantian akun, dan sesi kedaluwarsa sudah diterapkan. Tes browser
mencakup batas tersebut dan viewport kecil; kamera/performa perangkat fisik
masih memerlukan validasi. Foto lokal dapat diunduh sebagai berkas asli;
cache browser dapat dieviksi dan bukan cadangan permanen.

Koreksi pemilik pada 2026-10-29: studio publik tidak lagi mewajibkan login untuk
kamera, mode, galeri lokal atau Print. Foto tamu berada di namespace `guest`,
terpisah dari cache UID dan demo lama. Login eksplisit saat unduh memindahkan
foto tamu secara atomik; kegagalan storage tetap mempertahankan foto di memori.
Galeri cloud pengguna dan login memakai dialog pada halaman studio.

Status ADR tetap **proposed**, sesuai persetujuan pencatatan pemilik. Bukti dan
batas rilis tercatat pada [status integrasi](../backend-integration-status.md).
