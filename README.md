# ScopeNote

A scope-of-work app for independent designers and developers. Bring a client brief or voice note, generate a draft with Gemma through Mastra, edit the document and hours, save the project, and export a PDF or Markdown proposal.

**Status:** account migration: email/password accounts, public Free drafts/scopes, server-side usage limits, password reset and email verification. There is no demo or simulated entry point. Premium is prepaid: US$1 once for 30 days through AllScale, with no subscription or automatic renewal. Checkout requires server configuration. Resend sender domain is verified; verification and reset email delivery plus old-session revocation passed against the production API. See CONFIGURATION.md.

## Run locally

Node.js 22.13+ is required. From this directory:

```sh
npm install
npm run dev
```

This starts Vite on http://127.0.0.1:5178 and the Express backend on port 3001. Vite forwards `/api` to the backend. Copy `.env.example` to `.env` when ready to configure credentials. Real accounts require MongoDB. Public drafts and scopes can be read without signing in.

## The six integrations

| Service | Actual code path | Needed to verify it |
| --- | --- | --- |
| Render | `render.yaml`, Express serves built frontend and API in one service | Connected source repository and deployment |
| Gemma | `server/agent.js`, Google AI SDK selects a Gemma model explicitly | Google AI Studio key with access to selected Gemma |
| Mastra | `extract-scope` and `validate-scope` steps in `brief-to-scope` workflow | Already loaded; tested with stub model responses |
| MongoDB Atlas | `server/storage.js`, project CRUD and last 10 revision snapshots | Atlas URI, database user and network access |
| Sentry Agent Tracing | `server/telemetry.js`, invoke-agent, model, validation and transcription spans | Node project DSN and a real traced request |
| ElevenLabs | `server/app.js`, multipart voice upload to Scribe | API key with speech-to-text access and credits |

The default configured model is `gemma-4-26b-a4b-it`, listed in Mastra's current Google provider documentation. Availability and quota must be checked on your own account. The model must actually be Gemma, not Gemini. The app does not switch to another model family if generation fails. Gemma weights are not downloaded to Render; the backend calls the hosted model service.

## Credentials

Fill these only in the local ignored `.env` file or Render's environment settings:

- `GOOGLE_GENERATIVE_AI_API_KEY`: Google AI Studio key for the Gemma API. Not exposed to the browser.
- `GEMMA_MODEL`: selected Gemma model identifier; verify it is available for your key.
- `MONGODB_URI`: Atlas driver connection string. Set a dedicated database user and allow the backend's network egress in Atlas.
- `MONGODB_DATABASE`: defaults to `scopenote`.
- `ELEVENLABS_API_KEY`: ElevenLabs key with transcription access. Promo subscription status does not itself supply a usable API key or guarantee API quota.
- `SENTRY_DSN`: DSN for a Sentry Node project.
- `ACCOUNT_MODE=true`: individual accounts; defaults on in production.
- `RESEND_API_KEY` and `EMAIL_FROM`: verified-domain transactional email. See CONFIGURATION.md.
- `AI_DAILY_LIMIT`: global AI attempts/day UTC, default 50.
- `WORKSPACE_PASSWORD`: retired legacy mode only.
- `SESSION_SECRET`: at least 32 random characters; Render Blueprint generates this value.
- `APP_ORIGIN`: exact frontend origin, such as `https://your-service.onrender.com`, without a trailing slash.

Do not prefix server secrets with `VITE_`. Never commit `.env`, credentials, promo codes or real client audio.

## Deploy to Render

1. Put the contents of this `scopenote` directory at the root of a source repository.
2. In Render, create a Blueprint using that repository and its `render.yaml`.
3. Fill the required environment variables. Set `APP_ORIGIN` to the exact Render origin.
4. Build command: `npm ci --include=dev && npm run build`. Start command: `npm start`. Health check: `/api/health`. The explicit dev dependencies include Vite even when `NODE_ENV=production`.
5. Register an individual account and verify the email. Check that a second account cannot access the first account’s projects.
6. Run a real brief and voice upload, reopen a saved project, inspect Sentry traces, and record evidence before claiming prize-category eligibility.

The Blueprint uses a free web-service plan as a starting configuration. This is not a promise of provider eligibility, availability, credits, uptime or inference quota. Render runs the web server; Google serves the model. Production requires a session secret, exact origin and Atlas. Individual accounts default on; old shared-workspace cookies are not accepted.

## Product behavior

- Full scope editing: overview, deliverable titles/details/hours, clarification questions and exclusions.
- Deterministic rate/currency/contingency arithmetic, Markdown and PDF proposal export on both plans. Exports include project name, client name when available, full scope, estimate and “Made with ScopeNote”. PDF generation runs locally in the browser and loads only when requested. Public exports include the client name returned by the public API after the owner saves the public draft. They never fetch private owner metadata.
- Voice import: MP3, WAV, M4A, OGG or WebM; up to 12 MB. The transcript replaces the brief only after confirmation. Review transcription before generating a scope.
- Free client names, drafts and their complete scopes are public by default when saved; no publication modal or checkbox is required. Premium drafts/scopes are private. Existing private records stay private; saving does not silently publish them.
- Server drafts when MongoDB is configured; failed cloud saves are reported, not silently downgraded to browser storage.
- MongoDB compare-and-swap revisions prevent silent concurrent overwrites. History and restore are available in the UI and at `/api/projects/:id/history`.
- Manual saving: edits are not automatically persisted. Switching projects may discard unsaved edits.
- Seven-day opaque HttpOnly account cookie; token hashes and revocation in Atlas. Passwords use salted scrypt. Reset tokens are hashed, single-use and expire after 15 minutes; reset revokes every old session.
- Free: 3 scope attempts, 1 transcription per month UTC, 5 saved projects. Failed provider attempts still count. Premium proposes 10 voice imports/month, each up to 12 MB, and is disabled pending payment integration.
- Every project operation derives ownership from the server session. Existing legacy projects remain isolated.

## Data handling

This is now a hosted-service architecture, not a local-only AI app. Text briefs go to Google for Gemma inference. Audio goes to ElevenLabs for transcription. Saved documents go to Atlas when configured. Audio is held in backend memory during the request and is not stored by ScopeNote. Provider retention policies still apply.

Sentry instrumentation intentionally records model identity, durations, operation success/failure and token counts only when actually returned. Raw briefs, prompts, audio, proposals and API keys are not intentionally attached. No inference price is invented. Verify outbound telemetry in your own Sentry environment before using confidential briefs.

## Verification

```sh
npm test
npm run build
```

Tests cover auth, cross-origin rejection, request validation, project route contracts using injected storage, upload MIME checking, missing-key errors, schema rejection, estimate arithmetic, and an actual Mastra workflow using stub model responses. These tests do not prove remote provider availability or live Atlas/Sentry behavior.

The earlier UI scripts target the retired workspace UI. Browser QA covers real account and public-draft flows, disabled Premium, public-by-default Free saves and honest reset errors. `node scripts/account-integration.mjs` tests two synthetic accounts against a local isolated QA API; 36 assertions cover tenant isolation, revision conflicts, anonymous rejection and logout revocation.

Dependency audit currently reports five moderate transitive findings through Mastra -> gray-matter -> js-yaml -> argparse -> sprintf-js. No high/critical findings were reported. The published sprintf-js version has no fixed release; we did not force an unrelated Mastra downgrade. ScopeNote does not expose a YAML/frontmatter-processing endpoint. Review the upstream advisory before production use.

## Sources and attribution

- [Mastra Google model IDs](https://mastra.ai/models/providers/google)
- [Gemma official model documentation](https://ai.google.dev/gemma/docs/core)
- [ElevenLabs transcription endpoint](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- [Render Express deployment](https://render.com/docs/deploy-node-express-app)
- [Function Calling Gives LLMs Type Safety, Not Correctness](https://dev.to/aiexplore369zoho/function-calling-gives-llms-type-safety-not-correctness-5661), by AI Explore: a schema-valid scope still needs human review.

React + Vite, Motion, Phosphor Icons, DM Sans and Instrument Serif; typography is bundled. Taste-skill's minimalist-ui and redesign audit informed the visual direction. Source is MIT licensed. AI-assisted implementation and writing with Codex under human direction. No competition submission has been published.

## Project links

Source repository: https://github.com/dkfadhila/scopenote

Live application: https://scopenote.dktirta.tech. Render serves the frontend and API; Cloudflare DNS points the subdomain to `scopenote.onrender.com`. The custom domain is verified and Render has issued its certificate. The account mode stores projects in Atlas. New Free projects appear in the public gallery when saved. Premium and older private records remain private. Publishing MIT source does not grant access to private database records.

## Community Wisdom

Account tests explicitly check a second user and derive ownership from the session: [The one test that proves no user can see another user’s data](https://dev.to/spoe/the-one-test-that-proves-no-user-can-see-another-users-data-26fp), [Pull the tenant from the auth context, not the request body](https://dev.to/authbyexample1/pull-the-tenant-from-the-auth-context-not-the-request-body-dag).

Commercial launch still needs live payment verification, cost validation and an independent security review. No complete production-readiness claim is made.

## Plans and publication

| Plan | Drafts and scopes | Voice | Billing |
| --- | --- | --- | --- |
| Free | Client name, draft and scope public by default when saved | 1 transcription/month | Free |
| Premium | Private to the account, including after expiry | 10 voice imports per 30-day access period, each up to 12 MB | US$1 once for 30 days; no automatic renewal |

Free retains 3 AI scope attempts/month and 5 saved projects. Public pages include the project title, client name, brief, full scope, deliverables, hours, questions, exclusions and estimate when saved. Account email, owner identifier and revision history are omitted; authors must still remove confidential information from the text itself. Edits become public when the owner saves them. Deleting the source project removes its public listing; copies already taken elsewhere cannot be recalled. No anonymous edit API is provided. Premium checkout is available only when AllScale is configured and explicitly enabled on the server. Both plans retain 3 AI scopes and 5 saved projects; Premium AI quotas use anchored 30-day periods. Existing private projects remain private after expiry.

The former standalone design draft and sample demo have been removed. [Follow @tirtavex on X](https://x.com/tirtavex).

Publication checks were informed by [Public sharing as a snapshot, not a live editor](https://dev.to/julian_tao_82353720ba9ff5/public-sharing-as-a-snapshot-not-a-live-editor-3gmh), by [Julian Tao](https://dev.to/julian_tao_82353720ba9ff5): separate public identifiers and restricted public fields. ScopeNote publishes the latest explicit save rather than a separate snapshot; there were no comments on the retrieved article.

## PDF template

Both plans include Markdown and PDF export. The A4 PDF is created entirely in the browser using pdf-lib and embedded Lato fonts, with a generated transparent stationery background, project/client details, scope, estimates, clarification questions, exclusions, page numbers and Made with ScopeNote credit. Assets are self-hosted; document content is not sent to a PDF service. The PDF module is loaded only when requested. Unsupported characters fail explicitly rather than disappearing; Markdown remains available. Public exports use the client name returned by the public API; older hidden names are not fetched from private APIs.

Lato is distributed under the included SIL Open Font License. The transparent background was generated with OpenAI image generation for this project. PDF layout QA renders the actual exported file with Poppler. The regression approach was informed by [A PDF preview is a rendering contract](https://dev.to/dev_truth_f4c8f876c/a-pdf-preview-is-a-rendering-contract-lessons-from-a-japanese-worksheet-tool-hbp), by [dev_truth](https://dev.to/dev_truth_f4c8f876c): check exported fonts, geometry, complete content and pagination, not just the browser preview. No comments were present on the retrieved article.


Free drafts publish their client name, brief, full scope and estimate on save with a visible notice before saving. Older public client names become public on the owner’s next save. The server tracks `clientNamePublishedAt` for public client-name visibility and supports existing publication markers for compatibility. Existing private drafts remain private. Authors must only save client information they have permission to publish.

## Prepaid AllScale billing

The server fixes each checkout to 100 USD cents for 30 days. Returning to `#billing=` never grants access: the server reconciles the provider intent, amount, currency, order and owner. Signed raw-body webhooks and manual payment checks share the same order-level idempotent grant. The atomic MongoDB user update records the paid order and extends access together; a failed ledger write can be repaired on retry without granting twice. Purchase again to add 30 days; no recurring subscription exists.

Set the AllScale store webhook URL to `https://scopenote.dktirta.tech/api/billing/allscale/webhook`. Set server secrets `ALLSCALE_API_KEY` and `ALLSCALE_API_SECRET`, then `ALLSCALE_CHECKOUT_ENABLED=true` only after the store is ready. Read CONFIGURATION.md. No real payment has been completed during integration QA.
