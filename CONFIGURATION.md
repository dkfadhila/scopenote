# Konfigurasi ScopeNote

Frontend dan API berjalan di satu service Render. Semua secret hanya di Environment Render atau .env lokal yang diabaikan Git. Jangan gunakan awalan VITE_ untuk secret.

| Variabel | Fungsi |
| --- | --- |
| ACCOUNT_MODE=true | Akun individual; default aktif di production |
| APP_ORIGIN | https://scopenote.dktirta.tech tanpa slash akhir |
| SESSION_SECRET | Minimal 32 karakter acak |
| MONGODB_URI, MONGODB_DATABASE | Atlas; database default scopenote |
| GOOGLE_GENERATIVE_AI_API_KEY, GEMMA_MODEL | Gemma melalui Google AI SDK dan Mastra |
| ELEVENLABS_API_KEY | Izin Speech to Text; model default scribe_v2 |
| SENTRY_DSN | Telemetri backend tanpa teks brief/audio |
| RESEND_API_KEY | Key Resend dengan izin sending |
| EMAIL_FROM | ScopeNote <scopenote@dktirta.tech> |
| AI_DAILY_LIMIT | Batas global percobaan AI per hari UTC; default 50 |

## Email

Domain dktirta.tech sudah terdaftar di Resend. DKIM TXT resend._domainkey dan dua CNAME send serta rsend telah ditambahkan di Cloudflare pada 16 Oktober 2026. Verifikasi domain telah dimulai. Sender dan key sending-only disimpan di Render; full-access key hanya digunakan untuk konfigurasi domain, bukan runtime aplikasi.

Reset menggunakan link 15 menit sekali pakai, token hash di database, dan mencabut seluruh sesi lama. Verifikasi email berlaku 24 jam. Jika pengiriman gagal, UI menampilkan kegagalannya. Setelah email dikonfigurasi, verifikasi alamat diperlukan sebelum menggunakan AI; edit dan simpan proyek tetap tersedia.

Tanpa email terkonfigurasi, reset mengembalikan pesan layanan belum aktif. Konfigurasi saja tidak membuktikan email tiba di inbox; uji menggunakan alamat yang kamu kontrol.

## Run dan deploy

Node 22.13+: salin .env.example ke .env, isi Atlas dan provider, npm install lalu npm run dev. Port frontend 5178, backend 3001. /draft.html adalah simulasi, / memakai API nyata. Akun individual memerlukan Atlas.

Render build: npm ci --include=dev && npm run build. Start: npm start. Health: /api/health. Atlas harus mengizinkan outbound Render. Custom domain memakai CNAME dan HTTPS dari Render.

Free: 3 percobaan scope dan 1 transkripsi per bulan UTC, 5 proyek. Kuota dihitung saat request valid diterima, termasuk kegagalan provider. Premium US$1/bulan masih rancangan, belum ada checkout atau entitlement berbayar.
