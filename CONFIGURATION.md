# Konfigurasi ScopeNote

Integrasi sudah disiapkan. Tahap ini belum melakukan deployment, membuat akun provider, atau membelanjakan kredit.

1. Salin `.env.example` menjadi `.env` di folder ini. File `.env` diabaikan Git.
2. Buat API key di [Google AI Studio](https://aistudio.google.com/apikey). Isi `GOOGLE_GENERATIVE_AI_API_KEY`. Pastikan akun punya akses ke model Gemma yang dipilih; nama default dapat diganti melalui `GEMMA_MODEL`.
3. Buat cluster di [MongoDB Atlas](https://cloud.mongodb.com), database user khusus, dan aturan Network Access untuk server. Masukkan driver connection string ke `MONGODB_URI`. Jangan memakai password login website MongoDB sebagai password database user.
4. Buat proyek Node di [Sentry](https://sentry.io) dan isi `SENTRY_DSN` dari pengaturan proyek. Kode membuat span agent, model, validasi, serta transkripsi.
5. Buat API key ElevenLabs dengan akses Speech to Text dan isi `ELEVENLABS_API_KEY`. Langganan Creator atau kode promo bukan API key. Kredit API dan akses transkripsi tetap perlu dicek di akun.
6. Jalankan `npm run dev`. Buka Connections. “Configured” hanya berarti nilainya terisi; gunakan Test database dan request nyata untuk memastikan koneksi.
7. Untuk Render, siapkan repo berisi source ScopeNote pada root, lalu buat Blueprint dari `render.yaml`. Isi password workspace dan variabel lain di Environment. `SESSION_SECRET` dibuat Blueprint; `APP_ORIGIN` harus sama persis dengan alamat aplikasi Render.

Jangan kirim kredensial lewat chat dan jangan menaruhnya di variabel `VITE_*`. Jika kredensial belum siap, contoh dan penyimpanan browser masih bisa dipakai. Model dan upload audio tidak akan menghasilkan respons palsu ketika kredensial kosong.

## Bukti sebelum masuk kategori hadiah

- Render: URL deployment dan request yang berfungsi.
- Gemma: identitas model serta contoh brief/hasil asli dan evaluasi kualitas.
- Mastra: workflow dan eksekusi langkah asli.
- MongoDB: simpan, muat ulang dan revisi di Atlas.
- Sentry: tangkapan trace request asli beserta kegagalan yang diperbaiki.
- ElevenLabs: file suara asli, transkrip dan scope yang direview pengguna.

Belum ada bukti layanan remote tersebut karena belum ada kredensial. Tes otomatis memakai adapter/respons pengganti untuk memastikan kontrak kode, bukan mengklaim provider sudah aktif.
