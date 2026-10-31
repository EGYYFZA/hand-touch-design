// Shared by the local video renderer and the browser. No user data or remote media.
export const TUTORIAL_PREFERENCE = 'egz-tutorial-auto-v1';
export const tutorials = {
  menu: { title: 'Mulai di sini', color: '#0d6731', seconds: 12, steps: [
    { at: 0, title: 'Pilih mode', detail: 'Klik mode atau arahkan telunjuk ke tombol.' },
    { at: 3, title: 'Tunjuk dan tahan', detail: 'Tahan telunjuk pada tombol selama 0,8 detik.' },
    { at: 6, title: 'Buka alat', detail: 'Klik ikon alat di samping untuk mengganti pengaturan.' },
    { at: 9, title: 'Ambil foto', detail: 'Tekan S untuk mengambil foto. Di Photobooth, kepalkan tangan.' },
  ] },
  free: { title: 'Efek Tangan', color: '#0d6731', seconds: 12, steps: [
    { at: 0, title: 'Dua jari', detail: 'Bentuk V dengan satu tangan untuk blur seluruh kamera.' },
    { at: 3, title: 'Dua L tegak', detail: 'Bentuk L dengan kedua tangan untuk blur area di antaranya.' },
    { at: 6, title: 'L berlawanan', detail: 'Balik satu L untuk mosaik. Gerakkan tangan untuk mengubah area.' },
    { at: 9, title: 'Dua L terbalik', detail: 'Arahkan kedua telunjuk ke bawah untuk memutar area 180 derajat.' },
  ] },
  painting: { title: 'Painting', color: '#8534f3', seconds: 12, steps: [
    { at: 0, title: 'Cubit untuk melukis', detail: 'Satukan ujung telunjuk dan jempol, lalu gerakkan tangan.' },
    { at: 3, title: 'Bentuk dengan dua tangan', detail: 'Pilih bentuk. Cubit dengan kedua tangan, rentangkan, lalu lepaskan.' },
    { at: 6, title: 'Telapak untuk menghapus', detail: 'Rapatkan lima jari dan sapukan telapak pada gambar.' },
    { at: 9, title: 'Genggaman ringan', detail: 'Tangan yang sedikit digenggam juga dapat menghapus.' },
  ] },
  photobooth: { title: 'Photobooth', color: '#a52379', seconds: 12, steps: [
    { at: 0, title: 'Kepalkan tangan', detail: 'Tahan kepalan selama setengah detik untuk memulai sesi.' },
    { at: 3, title: 'Ganti pose', detail: 'Tunggu hitungan untuk masing-masing dari tiga foto.' },
    { at: 6, title: 'Lihat hasil', detail: 'Tiga foto menjadi satu frame. Hasil langsung terbuka setelah selesai.' },
    { at: 9, title: 'Sesi berikutnya', detail: 'Buka telapak, lalu kepalkan tangan lagi untuk sesi berikutnya.' },
  ] },
  meme: { title: 'Meme', color: '#876000', seconds: 12, steps: [
    { at: 0, title: 'Clingy', detail: 'Senyum sambil menunjuk ke mulut.' },
    { at: 3, title: 'Idea', detail: 'Senyum sambil mengangkat telunjuk.' },
    { at: 6, title: 'Shock', detail: 'Buka mulut dan lebarkan mata, dengan kedua tangan rapat di dada.' },
    { at: 9, title: 'Tongue', detail: 'Senyum sambil menjulurkan lidah. Pastikan wajah terlihat jelas.' },
  ] },
};
