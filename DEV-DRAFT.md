*Draft for the [Hacktoberfest Open-Source AI Challenge Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12). Work in progress: integrations are implemented, but live provider verification and public demo/repository links are still needed before publication.*

## What I Built

A client asks for a workshop booking page. Does that mean a link to an existing service, or a custom reservation system with payments? The difference can be several days of work. It is worth resolving before a proposal becomes a promise.

ScopeNote helps independent web designers and developers turn an early brief into a working scope: concrete deliverables, estimated hours, open questions, and exclusions. The freelancer edits the document, adjusts the rate and contingency, then exports a Markdown proposal.

The intended customer is a freelancer or small studio preparing several proposals each month. A possible paid product is a private hosted workspace with saved projects and voice-brief import. Pricing, willingness to pay, and operating cost remain hypotheses. There are no customer interviews, paying users or measured time savings to claim yet.

## Demo

The app currently runs locally. A public deployment link must be added before publication.

The Tanah Studio example is fictional and explicitly labeled. Its ceramics website brief mentions four pages, mobile support, pending photographs, and an uncertain booking request. The hand-authored sample scope treats the booking service choice as a question and excludes a custom payment system. It is a fixture for exploring the editor, not model-performance evidence.

The interactive app includes editable overview, deliverable titles/details/hours, questions and exclusions; rate and contingency calculations; proposal preview and Markdown export; and saved drafts. Voice upload and cloud storage are integrated into the interface and require configured services.

## Code

Public source repository: still to be added. The new source is MIT licensed.

The stack is React/Vite and an Express backend, with Gemma, Mastra, MongoDB Atlas, Sentry Agent Tracing and ElevenLabs. Render deployment is described by a Blueprint. Fonts are bundled; icons are Phosphor and UI motion uses Motion.

I revised the early frontend after feedback that it felt like a styled mockup. The large promotional heading and oversized sidebar were removed. The current screen puts a readable brief and editable document beside each other, with the estimate beneath them. This is a review tool, so the user's words deserve more room than marketing copy.

The visual audit used skills from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill). Codex assisted with implementation and article drafting under human direction.

## How I Built It

```text
Typed brief ───────────────────────────────┐
Voice file → ElevenLabs Scribe → transcript ┤
                                          ↓
                   Express backend → Mastra workflow
                                          ↓
                            Gemma drafts the scope
                                          ↓
                         Zod validates the response
                                          ↓
                           Human edits the document
                                          ↓
                        MongoDB save / proposal export

Sentry: agent, model, validation and transcription spans
Render: deployment target for the web app and API
```

Mastra runs a two-step workflow: `extract-scope` invokes the Gemma agent; `validate-scope` parses and validates the result. The Google AI adapter selects an actual Gemma model explicitly. The current default configuration is `gemma-4-26b-a4b-it`, listed in [Mastra's Google model reference](https://mastra.ai/models/providers/google). Model access and quota still need to be checked on the deployment account. There is no fallback to Gemini or another model family.

The prompt asks the model to expose missing information as questions rather than silently inventing commitments. Responses are checked for required content, valid estimated hours and bounded arrays. Invalid output becomes an error, not a substituted example. Schema validation cannot establish that the model understood the brief: [AI Explore's discussion of type safety versus correctness](https://dev.to/aiexplore369zoho/function-calling-gives-llms-type-safety-not-correctness-5661) is the reason human review remains part of the product.

Cost arithmetic stays in ordinary code:

```js
const hours = items.reduce((sum, item) => sum + Number(item.hours), 0);
const total = Math.round(hours * rate * (1 + buffer / 100) * 100) / 100;
```

Suggested hours remain estimates. The app does not know the freelancer's real capacity or promise a commercially correct quote.

ElevenLabs transcribes uploaded voice notes, up to the app's 12 MB limit. The user reviews the transcript before asking Gemma to plan the scope. Audio is held in request memory and is not stored by ScopeNote; the provider's retention policy still applies.

MongoDB stores saved projects and up to ten prior revision snapshots. Compare-and-swap revisions reject stale saves from another tab instead of silently overwriting them. With no MongoDB configuration, the app explicitly uses browser-local drafts. A failed configured cloud save does not silently change storage mode.

This iteration uses a single private workspace per deployment, protected in production by a workspace password and signed HttpOnly session cookie. It is not yet a multi-user SaaS with separate customer accounts.

Sentry instrumentation creates agent, model, validation and transcription spans. Model identity and token counts are attached only when actually supplied. Raw briefs and proposals are not intentionally attached. No token price or total inference cost is invented. Trace delivery and privacy filtering still need inspection against a real Sentry project.

The Render Blueprint builds the frontend and starts the Express server, which serves both the built UI and API. Gemma inference runs at the model provider; the app does not assume a free web instance can load the model's weights.

## Why Does Open Innovation Matter?

Gemma provides an open-weight foundation for the core transformation from brief to scope. The value is the ability to inspect the model's published materials and evaluate or change the serving arrangement instead of tying the product logic to a single closed model family. [Google's Gemma documentation](https://ai.google.dev/gemma/docs/core) describes running the weights on your own hardware or hosted services.

The current implementation chooses hosted inference to keep setup out of the freelancer's workflow. That has a clear trade-off: text briefs are sent to Google; audio goes to ElevenLabs; saved projects go to Atlas when configured. This is no longer a local-only privacy claim. Credentials stay on the backend, and confidential input should not be used until the service configuration and data handling are reviewed.

## Verification and Current Limits

Twelve automated tests pass. They cover access control, foreign-origin rejection, brief validation, project API contracts using injected storage, audio format validation, missing-key failures, parsing, estimate arithmetic and export content. A real Mastra workflow was exercised with a stubbed model response; that proves workflow wiring, not Gemma quality.

Browser checks pass at 390, 768, 1024 and 1440 pixels for the main tabs, estimate editing, draft persistence, export, validation states and reduced motion. The production frontend build passes.

Live Gemma inference, actual ElevenLabs transcription, Atlas persistence, Sentry trace delivery and Render deployment remain unverified because credentials have not been configured. Before publishing I need to connect them, capture genuine evidence and have a freelancer review a scope produced from their own anonymized brief.

## Prize Categories

The intended categories are Best Use of Render, Gemma, Mastra, MongoDB Atlas, Sentry Agent Tracing and ElevenLabs. These are implementation targets, not a statement that qualification has been established. Before publication, keep only categories with working, demonstrated integrations and include the relevant evidence.

<!-- Required tags: devchallenge, hf26challenge. Add public demo/repository links and genuine integration evidence. AI assistance: some_ai. No first-user or payment results have been invented. -->
