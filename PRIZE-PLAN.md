# ScopeNote — prize targeting plan

Prepared October 15, 2026. This is a proposed build scope, not a claim of completed sponsor integration or an event submission.

Official rules and category descriptions: https://dev.to/challenges/hacktoberfest-week2-2026-10-12

Deadline: October 19, 2026 at 13:59 WIB. A project may enter every genuinely used category, but each participant may win only once per challenge. Category amounts must not be added up as an expected award.

## Primary targets

1. **Best Use of Render ($200).** Deploy the agent web application and its backend on Render. Evidence: a working public Render deployment, deployment configuration, and a demonstrable real request. Running Gemma on Render is not required merely to target the frontend-hosting category; inference may be hosted separately. No assumption that a free web service can run an arbitrary model.
2. **Best Use of Gemma ($200).** Use an actual Gemma open-weight model for extracting the scope, deliverables, ambiguities and exclusions. Evidence: exact model/version and serving provider, real input/output examples, validation failures and a small quality evaluation. A Gemini API integration is not evidence of Gemma use. Model, license, serving availability and compute cost must be checked before implementation/deployment.

## Secondary targets, only if they improve the working product

3. **Best Use of Mastra ($100).** Implement the actual brief-analysis workflow in Mastra: extract requirements → validate outputs → request clarification → prepare the editable scope. Show the workflow, traces and failure handling. A dependency import alone does not establish meaningful usage.
4. **Best Use of MongoDB Atlas ($100).** Persist authenticated users' projects, source briefs and scope revisions in Atlas. Evidence: save and reopen across browsers/devices, correct ownership isolation, database-backed revisions. Skip if no real backend persistence is built.
5. **Best Use of Sentry Agent Tracing ($100).** Instrument the actual agent and model requests, including duration, errors and usage when supplied by the provider. Evidence: traces/screenshots and a debugging example. Never fabricate token counts, prices, or cost estimates when unavailable. Avoid storing raw client briefs in tracing by default.

Build order: real inference → complete editor and persisted projects → deploy → evaluate → optional orchestration/tracing integrations that have actual product value. Retain only categories with concrete evidence in the final article.

## Possible later additions

- ElevenLabs: voice notes → transcription → Gemma scope extraction, if users need voice briefs. An account-bound event offer currently lists three months of Creator tier, no credit card required; it has not been claimed. Official skills are available from elevenlabs/skills but have not been installed for this project.
- .tech: add only if a domain is actually claimed through Hacktoberfest and the live project is reachable on it. Consider renewal costs.

## Defer for this iteration

- TabPFN requires a meaningful prediction task and suitable historical tabular data. Do not invent past client data or add unsupported "risk scores".
- Tinker requires fine-tuning and a measured improvement over a baseline; neither training data nor a baseline currently exists.
- Arduino requires UNO Q hardware integration, which does not naturally support the current workflow.
- DigitalOcean can replace Render or host a separate justified inference service; do not duplicate hosting merely to list two sponsors.
- Temporal requires a durable workflow with demonstrated recovery, rather than a superficial wrapper around one request.
- SerpApi, Backboard, Tiger Data: adopt only for a specific product requirement; current brief extraction does not require search or retrieval.
- Entire and Copilot: claim only with actual use of those specific tools. Work performed in Codex or saved through DevRelay is not proof of either.

## Current status

Implementation now includes a Render Blueprint, Gemma adapter through a real Mastra workflow, MongoDB project/revision persistence, manual Sentry AI spans, and ElevenLabs speech-to-text upload. Tests cover route contracts and a Mastra workflow with a stub model response. Real model calls, live Atlas persistence, Sentry trace delivery, ElevenLabs transcription, and Render deployment still require credentials and external verification. The UI and README now state hosted data processing rather than local-only privacy. Prize eligibility must not be claimed until those integrations are demonstrated.
