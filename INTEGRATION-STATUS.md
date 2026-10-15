# Integration verification — 16 October 2026

Credentials are stored in Render environment variables. No credentials are included in this report or repository.

| Integration | Observed result | Limit |
| --- | --- | --- |
| Render | Public custom domain and HTTPS work; health endpoint returns 200; project API returns 401 without a session. All six services report configured. | Authenticated production requests require the owner's workspace session. |
| Gemma + Mastra | Actual `gemma-4-26b-a4b-it` run through the committed two-step Mastra workflow produced a schema-valid scope with three deliverables. Duration: 41,083 ms; reported usage: 257 input and 1,887 output tokens. | One synthetic brief from the development environment. Not a quality benchmark or customer outcome. |
| MongoDB Atlas | Native driver authenticated and database ping succeeded from the development environment. Render reports MongoDB storage configured. | Production connection, save and history have not yet been verified. |
| Sentry | SDK flushed a synthetic `gen_ai.invoke_agent` trace; ingestion returned HTTP 200. The real local scope test also used the app's configured telemetry. | Dashboard rendering and production agent traces have not yet been inspected. The connectivity trace is explicitly marked as a test. |
| ElevenLabs | Real `scribe_v2` request using a locally synthesized English WAV was rejected with HTTP 401 and `missing_permissions`. The provider specifically requires `speech_to_text`. | Transcription is not working until the key's permission is enabled. A denied user-profile request does not imply that transcription credentials are invalid. |

The Tanah Studio example shown on first load is still a hand-authored fixture, not the generated scope used in the integration test. No confidential client data was used for these tests. Keys must stay outside the frontend and Git history.
