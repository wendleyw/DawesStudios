# Delegated handoff reports

Each delegated worker owns one report in this directory, assigned before work begins. Use an English filename such as `2026-09-20-backend-foundation.md`; add a suffix for later assignments rather than overwriting historical reports. The orchestrator links accepted reports from [the shared checkpoint](../handoff.md).

Save a report at a meaningful checkpoint and before returning, stopping, or transferring work. If interrupted, a later reconstruction must name its actual author and evidence sources. Do not impersonate the unavailable worker or treat reconstructed context as proof that tests passed.

```markdown
# <Task name>

- Updated at: <ISO timestamp with timezone>
- Reporting agent and tool: <name / Codex or Claude Code>
- State: <planned / implemented / tested / verified / blocked / interrupted>
- Objective: <bounded task>
- Owned paths: <code paths and this report path>
- Dependencies: <contracts, reports, environment requirements>
- Acceptance criteria: <observable completion criteria>

## Completed work and changed files

<Describe what is on disk and what remains incomplete.>

## Decisions and interface changes

<Rationale, affected consumers, and orchestrator coordination.>

## Checks actually executed

| Command or scenario | Environment and time | Observed result | Evidence |
| --- | --- | --- | --- |
| <exact check> | <context> | <pass/fail/not run> | <path> |

## Remaining risks and next action

<Missing checks, failures, unfinished edits, and the next concrete step.>

## Ownership at handoff

<Released paths, any still-active writers/processes, and intended recipient.>
```

Keep credentials, environment values, private service keys, and raw agent session transcripts out of these reports. A task report does not approve production release.
