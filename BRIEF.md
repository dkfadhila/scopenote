# ScopeNote — prototype brief

> Initial concept record. The current implementation uses hosted Gemma through Mastra, optional Atlas persistence, Sentry tracing and ElevenLabs transcription, with a Render Blueprint. Its data handling and setup are documented in README.md and CONFIGURATION.md. The local-only architecture described below has been superseded; external verification is still pending credentials.

## Product argument

Independent designers lose time before a project even starts: client messages mix requests, missing inputs and implied commitments. ScopeNote turns that first conversation into something both parties can review. It focuses on the pre-contract moment, rather than monitoring scope creep after work has started.

Target user: solo web designers and small studios drafting several proposals per month. Initial payer hypothesis: the freelancer, not their client. Pricing hypothesis to test: a USD 19 one-time local desktop package, or paid onboarding/templates. No pricing has been validated; no payment feature or sales exists.

## One useful loop

Client brief → local open-weight extraction → schema-validated scope → human-reviewed hours/rate → proposal export.

Open AI matters because private early client conversations can stay on the freelancer's machine and inference does not depend on a metered cloud API. Local hardware, setup, electricity and maintenance still have costs. Quality and model suitability must be measured before making any commercial claim.

## Art direction

Warm off-white document canvas; soft olive navigation; charcoal text; restrained terracotta action. DM Sans for UI, Instrument Serif for the editorial introduction. Original line drawing of tangled information becoming a document. Two unequal working panels and a full-width estimate strip. Phosphor icons, Motion tab transitions and panel entry; honor reduced motion. Native dialogs for keyboard and focus behavior. Avoid stock images, fake customer proof, gradient blobs and decorative feature-card rows.

## Challenge fit and gaps

- Challenge: Hacktoberfest Open-Source AI Challenge: Week 2, event 80, Side Hustle.
- Window: October 12–19, 2026; final cutoff October 19 at 13:59 WIB.
- Required tags: devchallenge, hf26challenge.
- Template: What I Built; Demo; Code; How I Built It; Why Does Open Innovation Matter? Optional first-user/session/categories sections.
- Writing quality is weighted most heavily. Explain who pays, the exact workflow, and why open matters.
- Current deliverable: interactive local UI prototype, implemented but unverified local-model connector, article draft.
- Before submission: public code URL, shareable demo, real model test, honest limits and preferably a real user's feedback.
- No partner category claimed: using an icon library or planning a deployment does not qualify as using a sponsor.
- No customer interviews, purchases, benchmark results or model-generated sample outputs are claimed.

Official source: https://dev.to/challenges/hacktoberfest-week2-2026-10-12

## Suggested validation

Ask one freelance designer to use their own anonymized brief. Record the installed model, version, latency, invalid responses, required edits, and whether the proposal was useful. Ask what they would pay only after they have used it. Do not invent results if this has not happened by submission time.
