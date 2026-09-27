# Resend SMTP preparation

- Updated: 2026-09-27T17:55:08-04:00 · Agent: Codex implementer · Model: GPT-6
- State: verified documentation; target delivery untested
- Objective and owned paths: prepare Resend SMTP for upstream self-hosted Supabase Auth.

## Changes
- `deploy/production/supabase-smtp.env.example` — seven-key host `.env` fragment with Resend SMTP, verified-sender placeholder, and email confirmation enabled.
- `docs/operations/email.md` — domain, host setup, Auth routes, and deferred delivery smoke checks.
- This report — portable evidence and remaining release gate.

## Decisions and interface changes
- Supabase Auth remains the only sender; no application SDK, API call, or database change.
- SMTP uses `smtp.resend.com:587` with STARTTLS, username `resend`, API key as password.
- No cross-domain interface change; root orchestrator owns links from broader production docs.

## Checks actually run
- Official Resend SMTP/domain and Supabase self-hosted SMTP/Compose/email-template docs reviewed online — parameter and tracking guidance confirmed.
- Repository invite route, recovery component, redirect list, production runbook, and proxy README inspected — documented callbacks match code.
- Python syntax/key/link check — pass: seven expected dotenv keys and local links/anchor.
- `./apps/web/node_modules/.bin/prettier --check docs/operations/email.md` — pass.
- `git diff --check -- deploy/production/supabase-smtp.env.example docs/operations/email.md` — pass.

## Risks and next action
- Target sending domain, verified address, API key, host, and actual mailbox delivery remain unknown; no email was sent.
- On target staging, merge the fragment into upstream `.env`, restart Auth, then exercise new/existing invite and recovery links and inspect delivery.
- Ownership: three assigned files released; no process running.
