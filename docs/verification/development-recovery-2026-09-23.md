# Local development server recovery — 2026-09-23

The user reported that the application appeared frozen after the board/navigation revision.
The web process still listened on port 3003, but `/` timed out after 10 seconds and `/login`
after 8 seconds without response bytes. Supabase Auth health returned 200 in 3 ms.

The affected Next.js process was PID 64386 in this checkout's `apps/web` directory. It consumed
roughly one CPU core and 4–4.5 GB of resident memory. A one-second native sample showed the main
thread spending its time in uncaught-exception reporting and console/error handling. Both output
streams were pipes to the former automation session. This is consistent with an error-reporting
loop involving the abandoned output connection; the exact triggering exception was not recovered.
Do not describe this evidence as a confirmed modal render loop or database problem.

## Recovery

Stopped only the identified development process tree and restarted the same `npm run dev`
command from this repository, in a detached process session with `/dev/null` stdin and both output
streams appended to `/tmp/dawes-next-dev.log`. Confirmed the new Next.js process, PID 72150, had
regular-file output descriptors. No source behavior, database, storage, backend container or other
checkout's server was changed. Diagnostic samples/logs were preserved under `/tmp`.

## Checks executed after recovery

- Login and the SABRE board returned HTTP 200 in approximately 11–28 ms in repeated warm probes.
- The focused Playwright run passed **5/5 in 27.5 seconds**: all five board views at eight viewport
  sizes, manual zoom/fit, agency/client modal saving and submission, return to the prior view,
  searchable client navigation, and mobile focus/scroll behavior.
- Final fixture count: **10 clients, 25 projects, zero temporary acceptance clients**.
- Documentation now requires file-backed output for automation-launched development processes
  and bounded HTTP plus browser verification rather than relying on a listening port.

The in-app Browser reported no available instance, so the existing repository Playwright runner
performed browser verification. Unit/build checks were not repeated: this recovery changed only
runtime process supervision and operational documentation. No reset, commit or deployment occurred.
