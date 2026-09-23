# Production hardening and workflow consolidation — 2026-09-23

Orchestrator: Claude Code (session `dawesstudios-29`). Checks run in this session on the local
stack (SABRE overlay active: 10 clients / 68 projects). Earlier evidence is historical and is
linked from the [checkpoint history](../engineering/history/handoff-through-2026-09-23.md).

## Scope

- Finished the interrupted brand-folder remote-change task and consolidated 618 pending files
  into 13 conventional commits (`859e849..a5f610e`).
- Wrote the [production guide](../operations/production.md): self-hosted Supabase with Cloudflare
  R2 as the Storage backend, plus the `web` and `media` containers.
- Ran three read-only audits (security/production, web structure, database migrations) on Sonnet
  and fixed the verified findings, one commit per task.

## Audit results

| Audit | Result | Action |
| --- | --- | --- |
| Dependencies | `npm audit --omit=dev`: 0 advisories (web, media) | None |
| Secrets | gitleaks: 155 commits, no leaks; working-tree matches are all ignored files | None |
| CSP | Only `frame-ancestors`/`object-src`/`base-uri`/`form-action` were set | Full policy from build-time origins (`ea4ca8f`) |
| Headers | `X-Powered-By` sent; no HSTS | Disabled; HSTS in production builds (`ea4ca8f`) |
| Invitation body cap | Relied on `Content-Length` | Streamed 4096-byte cap; read errors stay 400 (`ea4ca8f`) |
| Missing-Origin check | Not exploitable: Bearer-only routes, and Origin is forgeable outside browsers | No change |
| Database | No critical or high issue; safe on a fresh database | Cascade indexes (`9750473`) |
| Legacy Playground rows | 2 local boards without `project_id` are unreachable | Local data only; recorded |
| Web structure | Dead CSS, single-consumer globals, unused exports, 964-line component | `80cfe7e`, `e338dd6`, Playground split |
| Client logo (other session) | `.svg` logos could execute when opened directly | Raster-only migration `0012` (`3650c2a`) |

## Checks

| Check | Result |
| --- | --- |
| `npm run check` on `4516409` | 607 tests / 52 files; types, lint and format clean |
| `npm run build` on `4516409` | Exit 0 |
| `npm run db:test` | 17 of 18 files pass. `access_and_workflows` fails 6 of 55, all canonical-count assertions, because the SABRE overlay is active (expected per the demo guide) |
| `content-security-policy.spec.ts` | 1 passed: no violations on 8 surfaces across agency, designer and client |
| Headers on `/login` | CSP present; no `X-Powered-By`; no HSTS in development (expected) |
| `intake-admin.spec.ts` after `3b8f890` | 6 of 6 passed |

### Browser suite (44 scenarios, one worker, local stack)

Run on the integrated tree: playground, video-designs, video-loading, production-workflow,
project-feedback, console-errors, team-management, intake-admin, content-security-policy,
brand-folders and board-views. 37 passed and 3 failed. The 4 that did not run are the
`intake-admin` scenarios after its failure in that serial group; all 6 passed in the rerun after
the fix. All 7 Playground scenarios passed after the hook split, and the video,
production, team and console-error scenarios passed under the new CSP.

| Failure | Root cause (evidence) | Status |
| --- | --- | --- |
| `board-views.spec.ts:343`, 768×1024 canvas | `c529671` (another session) enlarged the header client mark from 36 to 48px. Measured in the browser: "SABRE" has scrollWidth 57 but clientWidth 47 at 48px, and 57/57 when only the mark is forced back to 36px. | Open. Reported to the logo owner. |
| `project-feedback.spec.ts:205`, reading space | Same commit: `canvas-header.tsx` uses the same mark. The project header grows from 58 to 70px at 1600px and from 120 to 128px at 390px, leaving the feedback list at 221px where more than 223 is required. | Open. Reported to the logo owner. |
| `intake-admin.spec.ts:424`, timezone notice | Test data dependency: the feed shows the latest 100 notifications, and the SABRE overlay gives the agency 271 newer ones, so the notice dated 2026-09-20 was never rendered. | Fixed in `3b8f890`: the notice is dated ahead of real notifications. |

The notification feed has no pagination beyond its latest 100 items. That is a product limitation
worth a later decision, not a defect found by these checks.

## Not verified here

- A container build and a staging installation with the production topology (release checklist
  in the production guide).
- The J10 release audit and the full browser suite.
