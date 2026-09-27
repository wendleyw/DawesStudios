# All-role audit — recovered Claude task

Date: 2026-09-27. Orchestrator: Codex. Scope: agency, clients and both designers; current Miro
workspace, Drive channels, intake, credits, review/delivery, administration and responsive UI.
This is application verification, not production release approval.

## Recovery and findings

Claude's agency/client audit workers stopped at the usage limit, before completing the designer
audit. Codex preserved the working tree, integrated the separate [Drive task](drive-links-recovery-2026-09-27.md)
as `85d0a6f`, then completed fresh role audits and functional browser checks.

| Finding | Correction and evidence |
|---|---|
| Designers could send another round on a delivered project; agency could share/new-version despite server refusal. | Hide the three actions after delivery; an open round/share dialog closes if delivery arrives. Unit regression and live desktop/mobile checks for agency and both designers passed. |
| A shared round still offered to share itself again. | Keep its Shared status/history and omit the duplicate action. Unit and real Miro round-trip browser assertions passed. |
| Project details displayed raw service codes. | Resolve names from the existing briefing catalog. AI-Enhanced Add-On and UI Web Layout verified on desktop and mobile. |
| Existing clients could not accept a second workspace or return after removal. | Forward migrations and local mail delivery support both flows. Preserve active memberships; on return, discard stale memberships before restoring only the invited client. Staff-role escalation and removed staff remain denied. |
| Invitation setup could change a wrong/existing account's password before rejecting the token. | Validate authenticated token/email setup before password mutation; ignore editable URL hints and preserve existing passwords. New-account setup uses trusted per-invitation metadata because Auth fills an internal password value during email verification. |
| Invitation could return a client before the prior Auth removal completed. | Creation, setup and acceptance wait for completed removal under the membership transaction lock. Paused-removal regression assertions cover all three entry points. |
| White logo was barely visible on invitation/recovery light surfaces. | Render the original logo silhouette using the theme's foreground color while retaining its accessible name and dimensions. |

The optional system-tour harness was aligned with the current two-step Playground entry from Miro
and excludes only the external Miro iframe from axe. It still inspects the application's surrounding
controls. The existing intake test now expects an already-active same-client invitation to fail
before mail creation; it also verifies that a forged URL hint cannot bypass new-account setup.

## Visual and role evidence

- [Agency report](../engineering/handoffs/2026-09-27-codex-agency-audit.md): 43 routes at two sizes,
  86 visits, 14 axe samples, no global overflow or accessibility violations in those samples.
- [Client/designer report](../engineering/handoffs/2026-09-27-codex-client-designer-audit.md):
  130 route visits, both designers plus SABRE/Acme clients, mobile navigation and dark-mode checks.
  REST results matched client memberships and designer assignments; clients received no boards or
  assignments, designers received no billing/client Drive links.
- Explicit system tour: 57 agency, 45 designer and 45 client surfaces at 1600×1000 and 390×844.
  Zero overflow, serious/critical axe violations or uncaught application exceptions.
- [Invitation implementation](../engineering/handoffs/2026-09-27-codex-invitation-fix.md) and
  [independent review](../engineering/handoffs/2026-09-27-codex-invitation-independent-review.md)
  distinguish implemented changes, executed checks and static review.

Final-state captures inspected by the orchestrator:

- [Delivered client channel, agency phone](screenshots/recovery-2026-09-27/delivered-agency-client-phone.png).
- [Delivered assigned project, designer desktop](screenshots/recovery-2026-09-27/delivered-designer-internal-desktop.png).
- [Catalog service name, agency desktop](screenshots/recovery-2026-09-27/project-service-ai-desktop.png).
- [Existing-client invitation and readable logo, phone](screenshots/recovery-2026-09-27/existing-client-invitation-phone.png).

## Executed integration checks

The broad pass ran 95 active overlay browser tests and seven canonical browser tests, all passing.
Three optional tour tests were then explicitly enabled and passed; they were not counted as
successful when skipped in the default run. The two new invitation cases bring the distinct browser
cases exercised to 107, distributed across the canonical and live-overlay environments.

| Final check | Result |
|---|---|
| `npm run check` in `apps/web` | PASS: types, lint, formatting; 124 Vitest files / 1,206 tests |
| Full canonical pgTAP through migration 0016 | PASS: 26 files / 1,052 assertions |
| Canonical `verify_seed.py --staging` | PASS: exact 10 clients / 25 projects, credits and role/board isolation |
| Focused invitation, intake/admin and Miro browser regression | PASS: 10/10 after final backend/UI corrections |
| Production web/media image build | PASS |
| Canonical browser checks on the final production image | PASS: 7/7 |
| SABRE authenticated HTTP suite | PASS: 42/42 checks |
| Dependency audit (web production and development) | PASS: zero reported vulnerabilities |
| Gitleaks history scan | PASS: 545 commits, no leaks found |
| Live dataset and cleanup | PASS: 10 clients / 68 projects / 50 SABRE; zero Acceptance clients/projects or orphan Drive links |

The checks found and corrected integration mistakes, rather than waiving failures: stale hidden-title
locators, a missing query mock, two test-source lint/type errors, and the Auth temporary-password
behavior described above. New/existing-account behavior was then rerun through actual local mail.
An initial HTTP count check overlapped disposable browser fixtures; the clean 42-check rerun above
was executed after fixture cleanup. No canonical count assertion was weakened for the overlay.

## Preservation and limits

- Canonical staging stays at 10 clients / 25 projects; live local stays at 10 clients / 68 projects,
  including 50 SABRE projects. No reset or migration rollback was performed.
- SABRE removal correctly refuses its older ignored checkpoint when populated tables or newer
  data are not covered. It remains protected; no fabricated rollback baseline was written.
- Seeded Miro IDs are placeholders. The tour observed external Miro 404/X-Frame-Options messages;
  all failed requests in its reports were to Miro. These captures verify application chrome and
  isolation, not access to real creative boards or their contents.
- Chromium desktop/mobile and a dark-mode sample were covered. Firefox/WebKit, browser CI and
  cross-origin Miro accessibility remain outside this pass.
- Unknown URLs still display the unavailable-page UI with HTTP 200 in the current parallel-route
  layout. Next.js documents [streamed not-found responses](https://nextjs.org/docs/app/api-reference/file-conventions/not-found);
  this is a known routing limitation, not a verified HTTP 404 contract.
- A failed invitation email after Auth unblocking can leave sign-in enabled while `removed_at`
  continues denying app data. Re-banning as compensation could undo a concurrent accepted invite,
  so the failed token is revoked instead. A later authenticated agency removal is a new authorized
  operation; stale-request generation semantics are not introduced in this task.
- Pending invitations prepared before migration 0016 default to no password overwrite. Accounts
  that still need a password can use the verified recovery flow; reissuing does not create a new identity.
- Staging still uses its historical MinIO rehearsal topology. Production needs filesystem Storage
  persistence/restore, TLS, SMTP and proxy rate limiting; R2 is not required. No push or deployment.

Detailed working evidence is ignored under `outputs/recovery-2026-09-27/`, `outputs/audit/codex-*`
and `outputs/system-tour/`. The portable reports and selected final screenshots above are committed.
