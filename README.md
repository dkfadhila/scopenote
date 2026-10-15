# ScopeNote

A scope-of-work app for independent designers and developers. Bring a client brief or voice note, generate a draft with Gemma through Mastra, edit the document and hours, save the project, and export a Markdown proposal.

**Status:** deployed on Render at https://scopenote.dktirta.tech with verified HTTPS. The public health check returns 200 and private project endpoints reject unauthenticated requests. All six services are configured. Workspace login, real Gemma/Mastra scope generation and Markdown export work in production. Atlas connectivity works locally but fails from Render; ElevenLabs still rejects the configured key for missing `speech_to_text` permission. Sentry accepted a local test trace with HTTP 200. See `INTEGRATION-STATUS.md` for evidence and remaining limits. The fictional Tanah example remains hand-authored and clearly labeled; no customer results are claimed.

## Run locally

Node.js 22.13+ is required. From this directory:

```sh
npm install
npm run dev
```

This starts Vite on http://127.0.0.1:5178 and the Express backend on port 3001. Vite forwards `/api` to the backend. Copy `.env.example` to `.env` when ready to configure credentials. No keys are necessary to explore the example and browser-local drafts.

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
- `WORKSPACE_PASSWORD`: private-workspace access password.
- `SESSION_SECRET`: at least 32 random characters; Render Blueprint generates this value.
- `APP_ORIGIN`: exact frontend origin, such as `https://your-service.onrender.com`, without a trailing slash.

Do not prefix server secrets with `VITE_`. Never commit `.env`, credentials, promo codes or real client audio.

## Deploy to Render

1. Put the contents of this `scopenote` directory at the root of a source repository.
2. In Render, create a Blueprint using that repository and its `render.yaml`.
3. Fill the required environment variables. Set `APP_ORIGIN` to the exact Render origin.
4. Build command: `npm ci --include=dev && npm run build`. Start command: `npm start`. Health check: `/api/health`. The explicit dev dependencies include Vite even when `NODE_ENV=production`.
5. Open **Connections** in the app. Unlock the workspace, inspect configured services, and run **Test database**.
6. Run a real brief and voice upload, reopen a saved project, inspect Sentry traces, and record evidence before claiming prize-category eligibility.

The Blueprint uses a free web-service plan as a starting configuration. This is not a promise of provider eligibility, availability, credits, uptime or inference quota. Render runs the web server; Google serves the model. The app refuses production startup without a workspace password, session secret and origin. This is a single-owner private workspace, not a multi-tenant SaaS with individual user accounts.

## Product behavior

- Full scope editing: overview, deliverable titles/details/hours, clarification questions and exclusions.
- Deterministic rate/currency/contingency arithmetic and proposal export.
- Voice import: MP3, WAV, M4A, OGG or WebM; up to 12 MB. The transcript replaces the brief only after confirmation. Review transcription before generating a scope.
- Browser-local drafts when MongoDB is not configured, clearly identified in the UI.
- Server drafts when MongoDB is configured; failed cloud saves are reported, not silently downgraded to browser storage.
- MongoDB compare-and-swap revisions prevent silent concurrent overwrites. History is available at `/api/projects/:id/history`; no history UI is implemented yet.
- Manual saving: edits are not automatically persisted. Switching projects may discard unsaved edits.
- Eight-hour signed HttpOnly workspace cookie in protected mode; shared password controls a single workspace.

## Data handling

This is now a hosted-service architecture, not a local-only AI app. Text briefs go to Google for Gemma inference. Audio goes to ElevenLabs for transcription. Saved documents go to Atlas when configured. Audio is held in backend memory during the request and is not stored by ScopeNote. Provider retention policies still apply.

Sentry instrumentation intentionally records model identity, durations, operation success/failure and token counts only when actually returned. Raw briefs, prompts, audio, proposals and API keys are not intentionally attached. No inference price is invented. Verify outbound telemetry in your own Sentry environment before using confidential briefs.

## Verification

```sh
npm test
npm run build
```

Tests cover auth, cross-origin rejection, request validation, project route contracts using injected storage, upload MIME checking, missing-key errors, schema rejection, estimate arithmetic, and an actual Mastra workflow using stub model responses. These tests do not prove remote provider availability or live Atlas/Sentry behavior.

The UI verification scripts use Playwright. Run `npx playwright install chromium`, start the app, then run `node scripts/verify-ui.cjs` and `node scripts/verify-integrations-ui.cjs`. To use an existing browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path. Browser checks cover 390/768/1024/1440 px, tabs, persistence, estimates, export, empty states and reduced motion. Screenshots are in the ignored `artifacts/` directory.

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

Live application: https://scopenote.dktirta.tech. Render serves the frontend and API; Cloudflare DNS points the subdomain to `scopenote.onrender.com`. The custom domain is verified and Render has issued its certificate. The current deployment requires a workspace password for private APIs and is configured to save drafts to MongoDB Atlas.
