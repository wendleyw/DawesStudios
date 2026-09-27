# Retire Versions — acceptance run (2026-09-27)

This is the Phase 5 acceptance of
[the retire-Versions spec](../superpowers/specs/2026-09-27-retire-versions-design.md). The user
approved the one fresh reset in chat on 2026-09-27. Every result below comes from commands run in
that session.

## Before the reset

- Backup: `supabase/.backups/pre-reset-2026-09-27` (git-ignored). It holds 10 clients, 68 projects,
  218 Storage objects and 81 ledger entries.
- The old overlay's checkpoint files were set aside in the git-ignored
  `supabase/.local/sabre-demo/pre-reset-2026-09-27/`.

## Canonical database (fresh `local_stack.py reset --confirm-local-data-loss`)

- Provisioning: 13 Auth accounts, 70 brand files and 25 covers, all attested by the media worker.
- `verify_seed.py`: PASS. It checked the 10 clients and 25 projects, designer board isolation, that
  no designer name appears in client rows, and that the credit ledger reconciles.
- `supabase test db`: 1004/1004. Three assertions were updated for the seed's two-designer projects
  3, 8 and 10 (`296955c`).
- Full Playwright run: 89 passed, 10 failed.
  - 5 failures were `sabre-demo`, expected because the demo was not applied yet.
  - 5 had root causes that were fixed:
    - the seed produced 13-character Miro ids that Miro 404s and refuses to frame (`8d2d93c`);
    - `files-campaigns` depended on SABRE files (`66c15c0`);
    - `miro-version-links` also depended on SABRE files (`cec6924`);
    - `project-cover` did not scope its cover-request check to the fixture project (`3d1efbb`).
- A project named "yuyu" and one cover-visibility toggle, both made by hand in the browser after the
  reset, were removed with the user's approval before the seed was verified again.

## SABRE overlay (fresh apply)

- Canary: `apply --canary`, then `remove`, then `startup_preservation_test.py compare`: **pass**,
  back to 10 clients / 25 projects.
- The full apply exposed two defects, both fixed in `97321bf`:
  - acceptance debited empty due-date months under monthly credits;
  - the apply added a second designer to seeded projects.
- Full `remove` followed by `compare`: **pass**. The overlay can be removed again, with 140 demo
  files removed.
- Re-apply `status`: 10 clients / 68 projects / 50 SABRE, 68 covers, 8 Drive links.
  `remove --dry-run` is accepted. `sabre_demo_http_test.py` and `sabre-demo.spec.ts` (5/5) pass.
- Full Playwright run on the overlay: 87 passed, 14 failed, in 1.1 hours.
  - The count failures are expected on the overlay: `canonical-workspaces`, `design-audit`,
    `workspace-actions` and `workspace.spec`.
  - Re-run alone, the other specs gave 24 passed and 3 failed: `client-navigation:113`,
    `files-campaigns:155` and `project-drive-link:80`. These 3 are being fixed.

## Concurrent change during the run

- A peer session applied `202609270011_project_drive_links_by_channel.sql` during the overlay run.
  It replaces `projects.drive_url` with channel-scoped `project_drive_links`, which accounts for the
  `project-drive-link` failure.
- After that migration and the e2e fixtures, `sabre_demo.py remove --dry-run` refuses with "SABRE
  changed after population", on purpose, to protect newer work. Observed differences:
  - the dropped `drive_url` column;
  - `updated_at` on the SABRE credit rows, left behind by fixture debits and their cleanup;
  - one client Playground board created lazily while browsing.

  Removal was proven before those changes (see above). The remaining guard differences are a
  follow-up for the demo tooling.
