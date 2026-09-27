# CI checks

`.github/workflows/check.yml` runs two independent jobs. `static` checks types, lint, formatting,
unit tests and a production build. `acceptance` creates a disposable local Supabase stack on a
GitHub-hosted Ubuntu runner and exercises the real PostgreSQL, Auth, Storage, media and Chromium
paths. It does not use repository secrets or a linked Supabase project.

The static job also runs local recovery safety tests. Acceptance includes backend fixture-cleanup
regressions for Playground files/boards and client preferences. Its final read-only foreign-key
audit detects orphan records even when table counts still match; trigger-disabled fixture cleanup
must explicitly remove dependent rows.

The designer invitation journey uses the runner's local mail capture to verify the entered name,
password setup, acceptance and fresh sign-in. It never sends email to an external mailbox.

The acceptance job pins Supabase CLI 2.98.2, matching the validated local CLI version. It starts
the CLI stack with the repository's migrations and seed, applies the local PostgreSQL permission
hint compatibility setting, starts the real media worker, and provisions the fixture Auth accounts
and files. `verify_seed.py` requires the exact 10-client, 25-project dataset and checks real stored
objects and role reads. pgTAP runs after fixture provisioning. The production Next.js server then
serves targeted Chromium journeys for role isolation, Miro review, comments, role-specific pending actions, Drive links, working
files, project details and the canonical all-client tour.

`scripts/ci-acceptance.py` refuses execution outside the GitHub Actions workspace and refuses an
existing local credential file or Supabase containers/volumes. It exports the backend's newly generated credentials to later job
steps, masks them in job output and sets the explicit `ACCEPTANCE_*` variables required by
`apps/web/tests/e2e/test-support.ts`. The acceptance URL uses `localhost` while the local fixture
file uses `127.0.0.1`; these resolve to the same throwaway runner stack, and the distinct string
forces the E2E harness to use the declared CI credentials. Before and after browser tests, the job
compares eight fixture table counts and reruns the strict seed verifier. The final comparison also
runs when a browser test fails, provided the baseline was recorded.

The media worker runs as a local Node process on the runner so it can reach the loopback-only
Supabase API. Poppler is installed for actual PDF conversion. Runner-private logs and credentials
are removed with the ephemeral GitHub runner. A passing workflow proves this particular CI run;
local or production deployments need their own operational verification.
