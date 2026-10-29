# ADR-0002: Akun, galeri privat, dan arsip admin Supabase

**Date**: 2026-10-29  
**Status**: proposed  
**Deciders**: pemilik aplikasi; Codex sebagai penyusun

## Context

Pemilik memilih login akun agar foto dapat dibuka lintas perangkat, pengguna
hanya melihat foto milik akunnya, dan admin dapat mengumpulkan hasil setelah
persetujuan jelas. Semua salinan cloud pengguna dan admin dipilih memiliki masa
simpan 30 hari. Saat proposal awal ditulis repo belum mempunyai backend;
pencatatan proposal ini disetujui pemilik.

## Decision

Usulkan Supabase Auth untuk akun permanen, PostgreSQL untuk metadata, dan
Storage **private** untuk foto. API same-origin memverifikasi sesi, persetujuan,
gambar, dan kuota; owner membaca hanya foto ber-UID miliknya melalui RLS, sedangkan
admin memerlukan membership operator dan MFA (`aal2`). Semua salinan cloud dihapus
otomatis setelah 30 hari melalui Storage API, job idempoten, dan monitoring.

Pemilik mengonfirmasi satu masa simpan 30 hari untuk owner dan admin; foto lokal
serta berkas yang sudah diunduh tetap dikelola pengguna. Usulkan satu object
cloud privat dengan `expires_at` 30 × 24 jam setelah unggah pertama berhasil
menurut server; pembacaan dan retry tidak memperpanjang retensi. Tolak akses
segera saat expired, hapus file melalui job, dan jangan otomatis mengunggah
ulang foto lokal yang sudah kedaluwarsa di cloud. Tanpa persetujuan, hasil tetap
lokal dan tidak disinkronkan dalam desain satu object ini.

## Alternatives Considered

### Firebase

- **Pros**: Auth dan Storage dengan Security Rules, ekosistem terintegrasi.
- **Cons**: model Rules berbeda, Storage memerlukan paket Blaze, metadata SQL terpisah.
- **Why not**: Supabase lebih cocok dengan metadata relasional dan audit lifecycle ini.

### Cloudflare R2 + Workers + layanan identitas/database

- **Pros**: menarik untuk arsip besar dan distribusi/unduhan.
- **Cons**: identitas, membership, metadata, dan otorisasi memerlukan perakitan tambahan.
- **Why not**: kompleksitas belum dibenarkan oleh volume yang belum diketahui.

### Anonymous Auth atau public bucket

- **Pros**: onboarding anonim mudah; public bucket sederhana untuk distribusi.
- **Cons**: anonim tidak memulihkan akun lintas perangkat; public URL mengizinkan pembacaan publik.
- **Why not**: bertentangan dengan pilihan akun dan privasi pemilik.

## Consequences

### Positive

- Owner dapat membuka hasil akun yang sama di perangkat lain.
- Isolasi metadata/object ditegakkan oleh kebijakan data selain pemeriksaan API.
- Admin dapat memantau arsip, retensi, dan penghapusan terpusat dengan audit.

### Negative

- Ada biaya Storage, compute, auth, operasi, dan download; belum dihitung tanpa volume.
- Upload gagal/ditolak tidak masuk arsip atau perangkat lain.
- Admin yang sah mempunyai akses foto; ini bukan enkripsi end-to-end hanya-pengguna.

### Risks

- Kunci privileged dapat melewati RLS: simpan hanya di server dan batasi penggunaannya.
- Uji owner A/B, admin tanpa MFA, role palsu, CSRF, logout/pergantian akun,
  quota race, replay, consent revoke, expired object, dan orphan sebelum produksi.
- Signed URL adalah kredensial sementara; utamakan proxy terautentikasi/no-store.
- Retensi harus menghapus file melalui Storage API, bukan hanya row database.
- Login dashboard Supabase via GitHub tidak otomatis memberi hak admin aplikasi.

Riset dan kontrak implementasi: [proposal backend](../backend-architecture-proposal.md).

## Implementation update — 2026-10-29

Proyek Supabase khusus EGZ sudah terhubung. Tiga migration diterapkan dengan
checksum tercatat. API memakai sesi server, RLS owner/admin, persetujuan
eksplisit, PNG ternormalisasi, kuota atomik dan idempotency. Admin memerlukan
membership serta MFA; password dan autentikator pribadi dipilih pemilik.

Upload cloud dan retensi sudah aktif pada backend terhubung. Job Supabase
setiap lima menit menghapus file lewat Storage API; pembacaan expired segera
ditolak RLS. Pengiriman cron HTTP200 dan penghapusan file sintetis sudah diuji.
Tes SQL serta 25 pemeriksaan live mencakup isolasi akun, admin MFA, consent,
expiry, logout dan cleanup.

Pendaftaran umum masih ditutup. Domain pengirim Resend, SMTP, proteksi Auth,
hosting HTTPS dan pemeriksaan perangkat nyata belum selesai. Status ADR tetap
**proposed**, sesuai persetujuan pencatatan; implementasi bukan perubahan status
ke accepted. Lihat [status integrasi](../backend-integration-status.md).

Koreksi alur pemilik pada 2026-10-29: akun diperlukan untuk unduh PNG dan akses
cloud; penggunaan studio lokal serta Print tersedia sebagai tamu. Login tidak
mengirim foto tamu ke cloud. Pemilik menyetujui foto tamu dapat diarsipkan setelah
persetujuan cloud aktif dan tindakan eksplisit Simpan foto ini ke cloud.
Tidak ada perubahan pada owner RLS, MFA admin atau retensi 30 hari.
