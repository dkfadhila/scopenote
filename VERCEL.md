# Vercel deployment

The migration keeps the Vite frontend and Express API in one Vercel project. The
custom domain remains `scopenote.dktirta.tech`, and the existing Atlas database,
email sender and AllScale webhook URL are retained. DNS must only move after the
Vercel deployment can read Atlas and pass the checks below.

## Runtime

`vercel.json` builds `dist/`, serves its static files and sends `/api/*` to
`api/index.js`. The Express app and MongoDB client are initialized once per warm
function instance. There is no `listen()` or `setInterval()` in the function. The
function runs in Singapore with a 300-second maximum; provider requests retain
their existing 120-second timeouts.

Copy production provider settings into Vercel as server secrets. Keep
`ACCOUNT_MODE=true`, `APP_ORIGIN=https://scopenote.dktirta.tech` and the existing
session secret. Never prefix provider keys with `VITE_`. Set the nonsecret build
flag `VITE_BLOB_UPLOAD=true` on Vercel only. A normal Render/local build retains
the multipart audio endpoint.

## Voice notes up to 12 MB

Vercel Functions cap request bodies at 4.5 MB. On Vercel the browser requests a
short-lived token at `/api/audio-upload`, uploads the file directly to a
**private** Vercel Blob store, then submits its pathname to
`/api/transcribe-upload`. Set `BLOB_READ_WRITE_TOKEN` on the server. No provider or
store read-write token goes into the browser bundle.

Tokens permit one specific random pathname, supported audio types and at most
12 MB, and expire after ten minutes. Atlas records the owning account; another
account cannot transcribe that path. An atomic claim prevents duplicate use. The
server validates the bytes and consumes the existing voice quota before calling
ElevenLabs. Audio is deleted in `finally`, including provider and quota failures.
Abandoned uploads expire after 15 minutes and are deleted by maintenance. Blob
storage receives temporary voice audio; account and project storage stays in
Atlas. Blob usage is subject to the Vercel account's quotas and charges.

## Scheduled work

`.github/workflows/maintenance.yml` calls `/api/internal/maintenance` every five
minutes to retry payment receipts and remove expired audio. Configure the same
random value as Vercel `CRON_SECRET` and GitHub Actions
`SCOPENOTE_CRON_SECRET`. The workflow must be on the repository's default branch
and GitHub Actions must be enabled. GitHub schedules can be delayed; successful
transcriptions delete audio immediately and receipt delivery still runs during
payment reconciliation.

An absent or incorrect bearer secret returns 401. Maintenance awaits all work
before responding; it does not rely on a process surviving after a request.

## Database network access and cutover

Atlas must allow the Vercel function's outbound network. Render-specific IP ranges
do not cover Vercel. Do not disable Atlas network restrictions without the owner's
explicit approval; a fixed egress solution may require a paid service.

Before changing DNS, check the Vercel host for:

- `/api/health`: 200 with `status: ok`.
- `/api/public/stats` and `/api/public/projects`: successful Atlas reads.
- `/api/account`: existing account mode and email configuration.
- `/api/projects`: 401 when anonymous; private data never appears anonymously.
- Real account login, saved projects, scope generation, a private audio upload
  larger than 4.5 MB and immediate deletion after transcription.
- Static CSS, fonts, PDF assets, deep links and public share links.
- `/api/internal/maintenance`: 401 without a secret and 200 with the secret.

Add the custom domain to the Vercel project, complete the requested TXT
verification, then change only the `scopenote` CNAME to the value recommended by
Vercel. Check HTTPS and the full flow through the custom domain. Keep Render as a
rollback target until these checks pass. Suspend its compute only after cutover
is verified; deleting the old service is unnecessary.

## Source and updates

The Vercel project is `tirta3/scopenote`. Deploy from this repository root using
`vercel deploy --prod`. GitHub automatic deployments require the Vercel GitHub
integration to have access to `dkfadhila/scopenote`; a CLI deployment by itself
does not establish that connection.

Local secrets and `.vercel/` are ignored by Git. Do not commit exported environment
files or include them in a source archive.
