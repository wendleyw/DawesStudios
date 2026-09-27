# Drive links by channel — recovered implementation

Date: 2026-09-27. Owner: Codex. State: implemented and verified locally and in disposable staging.
No production release, push or deployment is implied.

## Contract and completed work

- Recovered Claude's interrupted Drive task and preserved its working tree before integration.
  [Original backend report](../engineering/handoffs/drive-links-db.md),
  [web integration](../engineering/handoffs/2026-09-27-codex-drive-web.md), and
  [independent backend review](../engineering/handoffs/2026-09-27-codex-drive-db-review.md).
- Migration `202609270011` replaces the single project link with independent internal/client rows.
  Agency edits both; assigned designers receive only internal; clients receive only client.
  Files selects only the client channel. Editor identity remains outside authenticated projections.
- Project details has separate editors with loading/error/retry handling. The workspace menu follows
  the visible channel, and saving a client link refreshes Files. Browser coverage verifies reload
  persistence, role isolation, editing and independent removal.
- Forward migration `202609270012` rejects NULL channels consistently. Both blank and nonblank NULL
  cases failed before the fix and pass afterward. No applied migration was rewritten or reverted.
- SABRE removal now refuses a populated table absent from every saved checkpoint layer before any
  write. Regression cases cover complete/resumed removal and dry runs; empty new tables remain safe.
  This protects old snapshots from orphaning newly introduced Drive rows. Test fixture cleanup also
  explicitly deletes Drive rows when FK triggers are disabled.
- Canonical seed/types, demo scripts, tests and current feature/security documentation use the new
  channel contract. The canonical manifest contains four client links and two internal links.

## Checks executed in this recovery

| Check | Result |
|---|---|
| `npm run check` in `apps/web` | PASS: typecheck, lint, format, 122 Vitest files / 1,195 tests |
| Drive pgTAP, local transaction with rollback | PASS: 40/40 assertions |
| SABRE Python unit/rollback suites | PASS: 22/22 tests |
| Drive Playwright spec | PASS: 1 full agency/designer/client journey |
| Client navigation + Files campaign browser specs | PASS: 8/8 |
| Canonical `verify_seed.py --staging` | PASS: exact 10 clients / 25 projects and scoped role assertions |
| Full pgTAP on canonical staging | PASS: 25 files / 1,020 assertions |
| Production web/media image build | PASS |
| Four canonical browser specs on staging | PASS: 7/7 |
| Current SABRE removal dry run | PASS as a guard: refuses uncovered populated `project_drive_links` before writes |

The first combined browser run had a strict locator matching a hidden dialog title; the corrected
Drive spec passed on rerun. The first integrated unit run exposed a missing hook mock; the corrected
full source gate passed. The broader all-role browser/audit task continues separately.

## Environments and preservation

The live local stack retains the authorized 10-client / 68-project / 50-SABRE overlay. The old ignored
rollback checkpoint also has newer credit timestamps and a new Playground board relative to its
saved state; it remains protected, not rewritten to manufacture a passing rollback.

Canonical checks used the existing disposable self-hosted staging volumes, resumed without a reset.
Applied migrations 0011/0012, refreshed only the six fixture Drive links and corrected older fixture
Miro identifiers to the current generator format. No canonical seed was loaded into the live stack.
This staging environment uses its historical MinIO configuration; it does not verify the new
filesystem Storage production target. R2 remains unnecessary.

Working logs and pre-integration backup: ignored `outputs/recovery-2026-09-27/`.
Screenshots and complete all-role findings belong to the subsequent audit record.
