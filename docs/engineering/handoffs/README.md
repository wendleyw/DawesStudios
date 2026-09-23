# Delegated handoff reports

Each delegated worker owns one report in this directory. The orchestrator assigns it before the
work begins. Use an English, dated filename such as `2026-09-20-backend-foundation.md`, and add a
suffix for later assignments rather than overwriting a report. The orchestrator links accepted
reports from [the shared checkpoint](../handoff.md).

Save the report before you return, stop or transfer work. **Keep it to 30 lines or fewer.** Link
evidence on disk instead of pasting logs, diffs or long test output. If you were interrupted, a
later reconstruction must name its actual author and evidence sources. Never treat reconstructed
context as proof that tests passed.

```markdown
# <Task name>

- Updated: <ISO timestamp with timezone> · Agent: <name / Codex or Claude Code> · Model: <tier>
- State: <planned / implemented / tested / verified / blocked / interrupted>
- Objective and owned paths: <one line each>

## Changes
- <path — what changed and why, one line each>

## Decisions and interface changes
- <decision — affected consumers; "none" if none>

## Checks actually run
- `<command or scenario>` — <pass/fail, counts> — <evidence path if any>

## Risks and next action
- <missing checks, failures, unfinished edits; the next concrete step>
- Ownership: <paths released; any still-active writer or process>
```

Keep credentials, environment values, private service keys and raw agent transcripts out of these
reports. Save screenshots to the ignored `outputs/` directory unless a verification record needs a
final-state image. A task report does not approve a production release.
