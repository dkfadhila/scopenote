> Implementation update — 16 October 2026: the polished UI now serves the real root application. /draft.html remains simulated. Individual accounts, private CRUD/history, hashed passwords/sessions, usage limits, email verification and reset are implemented. Payment is deferred; Premium is disabled. The original draft decisions below are historical, not the current implementation checklist.

# ScopeNote product draft

Review locally at `http://127.0.0.1:5178/draft.html`. This is a separate React entry, not the deployed application. Sample state lasts only for the current browser session and resets on reload. It does not send login credentials, email, audio, AI, database or billing requests. Markdown download and clipboard actions work locally.

## Product decisions to review

- Individual email/password accounts, with private projects by default. Open-source code does not make database contents public.
- Judges can explore a separate fictional sample without signing in. Private projects never become the public demo dataset.
- Workflow: Projects → Brief → Review scope/questions and estimate → Proposal.
- Account settings include the password-reset entry point. The draft demonstrates request, example email, new-password validation and completion; no reset email is actually sent.

| Proposed plan | Price | AI scopes/month | Saved projects | Voice | Other features |
| --- | --- | --- | --- | --- | --- |
| Free | $0 | 3 | 5 | Text briefs | Editable scope, estimate and Markdown export |
| Premium | US$1/month | 20 | 50 | 5 minutes/month | Free features plus draft revision history |

The billing interval and quotas are assumptions for review. Model costs, transcription costs, payment fees and abuse allowance must be measured before offering these quotas commercially. Premium buttons are disabled and marked Coming soon; they do not create subscriptions or take payments. Downgrading should keep existing projects readable rather than delete work.

## What real implementation still needs

- User identities and password hashing; session creation, expiry and revocation.
- Server-side ownership on every project read, update, history and deletion. Test two real accounts against the same project identifiers.
- Email verification and transactional email delivery. Reset responses must not reveal whether an email exists; reset tokens should be hashed in storage, expire after 15 minutes, be single-use, and revoke existing sessions after password change.
- Real billing provider integration with verified server-side webhook events. Never accept the browser's plan flag as entitlement. No payment-card data should pass through this application server.
- Persistent usage accounting, limits and recovery states for exhausted quota, failed transcription and provider downtime.

The existing live application still uses its original workspace authentication and real provider integrations. Those credentials and backend behavior were not changed by this draft.

## Visual direction and audit

The user asked to keep the initial white/light-grey, navy ink and orange palette and polish it. That request supersedes the later experimental full-orange editorial direction. DM Sans is retained. The final draft removes the sidebar, decorative welcome cards, fake document bars, small uppercase labels and decorative shadows. Navigation, text sizes, contrast and project scanning are prioritized.

Taste skill's initial inspection found 12 failures in the first draft. Its direction draw produced “The printed annual”, seed 154549346. The work blueprint was redrawn once to a project ledger because the app has three sample projects rather than eight photographed portfolio items. The subsequent editorial palette/type experiment was abandoned at the user's explicit request to keep the original colors and only polish the app. Its house rules are applied to app craft; this is not a marketing page with a giant hero, video or four photographs.

The source lint passes with one defended warning: the estimate's input-affix is a real form field. Shadows are limited to a floating dialog and status toast. No photos or externally credited media are used. All example projects, names, prices and usage counts are explicitly sample/proposed content.

Round 1 visual critique: the first draft had a generic sidebar/dashboard composition, decorative cards, too much tiny grey text and weak focus. Self-assessment: design 5.5, usability 6.5, creativity 4.5, content 6.0 → 5.65. The polished app is more readable and uses the product's actual documents as content. Remaining limitation: a deliberate, conventional product interface rather than an award-site composition; the user's visual review is still required. No independent jury score is claimed.
