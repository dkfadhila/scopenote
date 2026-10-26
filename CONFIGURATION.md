# Konfigurasi ScopeNote

Production berjalan di Vercel. Konfigurasi audio privat 12 MB, maintenance
terjadwal, dan hasil migrasi ada di [VERCEL.md](VERCEL.md). Bagian Render di bawah
tetap menjadi referensi deployment lama untuk rollback.

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

Domain dktirta.tech sudah terdaftar di Resend. DKIM TXT resend._domainkey dan dua CNAME send serta rsend telah ditambahkan di Cloudflare pada 16 Oktober 2026. Domain berstatus Verified; ketiga record DNS terverifikasi. Sender dan key sending-only disimpan di Render; full-access key hanya digunakan untuk konfigurasi domain, bukan runtime aplikasi.

Reset menggunakan link 15 menit sekali pakai, token hash di database, dan mencabut seluruh sesi lama. Verifikasi email berlaku 24 jam. Jika pengiriman gagal, UI menampilkan kegagalannya. Setelah email dikonfigurasi, verifikasi alamat diperlukan sebelum menggunakan AI; edit dan simpan proyek tetap tersedia.

Tanpa email terkonfigurasi, reset mengembalikan pesan layanan belum aktif. Konfigurasi saja tidak membuktikan email tiba di inbox; uji menggunakan alamat yang kamu kontrol.

## Run dan deploy

Node 22.13+: salin .env.example ke .env, isi Atlas dan provider, npm install lalu npm run dev. Port frontend 5178, backend 3001. /draft.html mengarahkan ke /; tidak ada demo. Akun individual memerlukan Atlas.

Render build: npm ci --include=dev && npm run build. Start: npm start. Health: /api/health. Atlas harus mengizinkan outbound Render. Custom domain memakai CNAME dan HTTPS dari Render.

Free: 3 percobaan scope dan 1 transkripsi per bulan UTC, 5 proyek. Kuota dihitung saat request valid diterima, termasuk kegagalan provider. Premium US$1 sekali bayar untuk akses 30 hari, tanpa subscription atau tagihan otomatis. Premium mendapat 10 voice import/30 hari, 3 scope/30 hari dan 5 proyek.

## Visibilitas paket

Free: nama klien, draft dan scope baru langsung publik saat disimpan, tanpa dialog konfirmasi. Premium: draft dan scope privat; 10 kali voice import/30 hari, masing-masing maksimal 12 MB. Record privat lama tidak dipublikasikan otomatis. Checkout hanya tersedia ketika konfigurasi AllScale di server aktif. Tidak ada demo.

## AllScale — Premium prabayar

Simpan `ALLSCALE_API_KEY` dan `ALLSCALE_API_SECRET` di Environment Render atau `.env` lokal yang diabaikan Git. Jangan gunakan awalan VITE_. `ALLSCALE_CHECKOUT_ENABLED=true` mengaktifkan checkout; default false. Key store Checkout baru sudah berhasil membuat intent US$1 dan membaca detail pesanan, tanpa pembayaran nyata.

Di pengaturan Checkout store AllScale, isi Webhook URL: `https://scopenote.dktirta.tech/api/billing/allscale/webhook`. Redirect URL ditetapkan per pesanan oleh server. Panduan resmi: https://allscale.io/skill. API tunggal https://openapi.allscale.io; test store tidak menjamin pembayaran tanpa dana sungguhan.

Alur: pengguna masuk, memilih US$1 sekali untuk 30 hari, membuka checkout hosted AllScale, lalu kembali ke `#billing=<orderId>`. Tombol Check payment membaca status provider melalui server. Webhook diverifikasi menggunakan raw body, HMAC, timestamp, key, ID dan nonce. Server mencocokkan intent, 100 USD cents, currency, order dan user sebelum pemberian akses. Satu update atomik pada dokumen pengguna menyimpan order yang dipenuhi dan menambah 30 hari; replay atau retry setelah ledger gagal tidak memberi akses dua kali. Tidak ada subscription atau auto-debit. Pembelian berikutnya menambah 30 hari pada sisa akses aktif.

Sesudah expiry, akun kembali Free; proyek privat lama tetap privat dan dapat diedit/diekspor. Scope dan voice Premium dihitung pada periode 30 hari dari aktivasi; Free memakai bulan UTC. Tidak ada refund otomatis atau pembayaran keluar yang diimplementasikan. Pembayaran nyata dan webhook live belum teruji; uji itu perlu dilakukan dengan akun pemilik sebelum mengumumkan penjualan siap digunakan.

Tes koneksi tanpa pembayaran: `node scripts/check-allscale.mjs`. Tes regresi billing: `node --test server/billing.test.js server/accounts.test.js`.

## Ekspor proposal

Free dan Premium sama-sama menyediakan ekspor Markdown dan PDF, dengan nama proyek, nama klien jika tersedia, scope lengkap, estimasi dan kredit “Made with ScopeNote”. PDF dibuat di browser; modul PDF baru dimuat saat tombol Download PDF diklik. Ekspor dari halaman publik tidak mengambil metadata klien privat.

## Email kuitansi dan pilihan visibilitas

Sesudah status pembayaran paid, kuitansi diproses melalui receiptOutbox dan Resend memakai key per order. Worker satu menit mengirim ulang pekerjaan tertunda dan kuitansi pembayaran lama yang belum terkirim. Pesan dan penerima disimpan tetap agar retry cocok dengan idempotency key. Retry ambigu setelah 23 jam memerlukan pemeriksaan manual. Tidak ada pengiriman ulang akses Premium. Email verifikasi/reset memakai template HTML dan teks dengan gambar `/email/scopenote-stationery.png`.

Premium dapat memilih Public/Private; default Private. Pilihan berlaku ketika Save. Free baru selalu Public. Public menampilkan client name dan nama author disamarkan (Alexander → A***r), tanpa email akun/owner/history.

## Always-on compute and health check

ScopeNote uses a single Render Starter compute instance (0.5 CPU, 512 MB RAM, US$7/month at upgrade), while the workspace remains Hobby. Paid compute does not sleep because of inactivity. Promotional credits offset eligible invoices; charges continue after credits are exhausted. The Blueprint uses `plan: starter` to match the service.

`.github/workflows/health-check.yml` is available as a manual health check from GitHub Actions. Its five-minute schedule was removed after upgrading compute because keep-alive traffic is no longer needed. The endpoint `/api/health` remains available to Render and monitoring tools.
