# Browser verification

Use the repository Playwright suite for repeatable role, persistence, error-path and accessibility
checks. Use the Microsoft Playwright MCP extension for interactive checks in the user's Chrome,
including visible feedback, existing browser sessions and investigation of a failing action.
Keep both kinds of evidence distinct; an installed extension is not a completed browser test.

## Extension connection

Install the [Microsoft Playwright extension](https://github.com/microsoft/playwright/tree/main/packages/extension)
in the Chrome profile used for testing. Configure a personal MCP server with `npx @playwright/mcp@latest
--extension`; the local configuration may also select Chrome with `--executable-path`.
Codex stores MCP configuration in its personal configuration, as described in the
[official MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

The extension's `PLAYWRIGHT_MCP_EXTENSION_TOKEN` belongs in personal MCP configuration, never the
repository, reports, screenshots or command output. Use the extension's connection page to select
the test tab. Each client has its own tab group; operate on the application's test tabs only.

A successful handshake lists Playwright tools. Verify attachment separately with a tab operation
and a snapshot of the application. If the connection page reports `Failed to connect to MCP relay:
WebSocket error`, keep the MCP server alive and start a fresh browser-tool connection; an old
connection page can refer to an expired relay. If it still fails, verify the extension is installed
in that profile and the configured token matches it. Do not rotate credentials as a first step.

In the 2026-09-27 audit the personal server was already enabled, but this conversation did not
expose its tools natively. A temporary standard MCP SDK stdio client called that configured server.
After the first attachment timeout, a fresh connection succeeded and real browser actions were
executed through the extension. This was not a replacement headless browser or a simulated login.
The temporary client and redacted working records live under ignored `outputs/extension-audit-2026-09-27/`.

The same audit confirmed an extension limitation: native file upload returned
`DOM.setFileInputFiles: Not allowed`. This matches the
[upstream extension report](https://github.com/microsoft/playwright-mcp/issues/1481).
The final-file download button was available, but the bridge did not return a Playwright download
event before its timeout. These are not passing upload/download checks. Run those actions through
the repository's normal Playwright browser and verify the resulting stored/downloaded bytes.
The audit did that successfully, while completing delivery through the real Chrome extension.
Do not bypass the bridge restriction with injected file data or relaxed browser security.

Bring the selected test tab to the foreground when actionability waits stall in a background tab.
At the end, sign out and close only the tab created for the audit, then close the temporary MCP
client. Existing user tabs and personal configuration remain in place.

## Repeatable suite and dataset boundaries

Run commands from `apps/web` after the local web, Supabase and media services are available:

```bash
npm run check
npm run test:e2e -- tests/e2e/settings-actions.spec.ts tests/e2e/files-actions.spec.ts
SYSTEM_TOUR=1 npm run test:e2e -- tests/e2e/system-tour.spec.ts
```

`SYSTEM_TOUR` visits screens and dialogs; it does not establish that an action persisted. Mutation
specs verify real writes, reloads, roles and guarded cleanup. The action coverage record identifies
which mechanism was used for each family.

The optional live SABRE overlay is 10 clients / 68 projects / 50 SABRE. Exact canonical assertions
belong on the separate 10-client / 25-project staging dataset, using the declared
`ACCEPTANCE_*` environment described in the [web README](../../apps/web/README.md#build-and-verification).
Never change canonical assertions to accommodate the overlay.

Run one mutation suite per database at a time. Even runs against different databases must have
separate output directories, or one Playwright invocation can delete another's active traces:

```bash
npm run test:e2e -- --output=../../outputs/browser-local-results
# For a separately configured staging run:
npm run test:e2e -- --output=../../outputs/browser-staging-results
```

Use separate JSON reporter paths too, and serialize screenshots that share a fixed evidence path.
Keep raw working artifacts ignored. Commit only the final captures cited by a verification record.
See the [2026-09-27 action audit](../verification/extension-role-actions-2026-09-27.md) for results.
