# Agent Orchestration

The primary development agent is the orchestrator and accountable integrator. Specialist agents operate on bounded tasks and report upward. This is the development governance model, not a product feature or a permanently running autonomous service.

## Delegation contract

Each assignment names the objective, allowed paths, dependencies, acceptance criteria, and required evidence. Agents must read the applicable AGENTS.md before writing. Shared interface changes return to the orchestrator before dependent implementation. File ownership must not overlap without an explicit handoff.

## Required report

1. Work completed and paths changed.
2. Decisions and their rationale, including impacts on other domains.
3. Checks actually executed, command or browser scenario, and observed result.
4. Remaining gaps, risks, blocked dependencies, and recommendations.
5. Whether the deliverable is planned, implemented, tested, or verified.

An agent cannot declare the whole system complete. The orchestrator compares reports with current files, database results, browser behavior, and the acceptance matrix before integrating and closing a task. Reports stay at 30 lines or fewer, using the [template](handoffs/README.md).

## Efficient delegation

Most of this project's model usage came from delegated agents and from sessions running above 150k tokens of context. These rules keep both down without weakening verification.

| Agent (`.claude/agents/`) | Model | Use it for | Writes |
| --- | --- | --- | --- |
| `explorer` | Haiku | Locating code and answering where-and-how questions, as `path:line` pointers | No |
| `verifier` | Haiku | Running an already-decided list of checks and reporting exact results | No |
| `implementer` | Sonnet | One bounded change with owned paths, acceptance criteria and a report path | Owned paths only |
| `reviewer` | Sonnet | Independent audits of a diff, feature or concern, with verified and ranked findings | No |

- **Agents load when a session starts.** A session that creates or edits these files cannot call them by name until the next session. Until then, use a built-in agent with the same rules in its prompt and an explicit `model`.
- **Pick the cheapest model that fits.** The orchestrator keeps cross-domain design, integration, and the release audit. A single known file or symbol is a direct search, not a delegation. Do not use general-purpose agents for routine work. Codex applies the same tiers with its own subagent configuration.
- **Delegate with a bounded prompt.** Name the objective, owned or read paths, what not to read (history, verification records, screenshots, `docs/ref`), the checks to run, and an output cap. Run at most three agents at once unless the user asks for more.
- **Watch context size.** Read large files by excerpt. Summarize long command output instead of printing it. Compact at task milestones and start a fresh session between unrelated tasks. Only the current [checkpoint](handoff.md) is read by default. The [history](history/) is for evidence lookup.
- **Commit per task.** Every integrated task ends with a passing gate and a Conventional Commit of that task's files. The hooks run gitleaks, lint-staged and commitlint. Pushing, pull requests and deployment still need an explicit request. When another session is editing the same tree, stage explicit paths only, and avoid committing a file that also holds someone else's unstaged hunks: lint-staged hides those hunks during the commit and restores them afterwards, so a concurrent write in that window can conflict.
- **Keep evidence lean.** Capture screenshots only when a task changes UI. Save working captures to the ignored `outputs/` directory, and commit only the few final-state images a verification record cites. The browser suite does this by default; `EVIDENCE_SCREENSHOTS=1` writes to `docs/verification/screenshots/` instead.

## Codex and Claude continuity

The durable entry point is [handoff.md](handoff.md), a current-state checkpoint of 100 lines or fewer. Superseded entries move to [history](history/). Both root instruction files require the incoming orchestrator to read the checkpoint and the outgoing orchestrator to update it. Save individual reports using the [handoff report template](handoffs/README.md); keep each agent's report path disjoint from other agents' paths. Only the orchestrator edits the shared checkpoint and implementation plan.

The Codex [subagent workflow](https://learn.chatgpt.com/docs/agent-configuration/subagents) gives delegated work its own thread and returns summaries to the main thread. Names such as `/root/product_architecture` are useful provenance labels. This repository does not connect those threads to Claude or configure automatic takeover when a quota is exhausted. Shared skills and instruction files do not transfer unsaved conversation state.

### Outgoing orchestrator

1. Ask available workers to finish a bounded checkpoint and save their report; collect or stop them before another orchestrator writes to their paths. Record unavailable workers as unknown rather than inventing their final reports.
2. Preserve the working tree, including untracked files. Record the branch, commit if one exists, active processes or writers actually observed, changed paths, decisions, exact checks, unresolved failures, and the next task in `handoff.md`. Exclude secrets and raw authentication/session logs.
3. Link evidence already on disk. Mark reconstructed context and historical test results explicitly; a report is not a new passing test.
4. Release write ownership after the outgoing run and its workers stop. A context-readiness check can use Claude earlier with read-only tools; it must not start simultaneous implementation.

### Incoming orchestrator

1. Read `CLAUDE.md` or `AGENTS.md`, the checkpoint, the implementation plan, and the acceptance matrix. Read the relevant saved reports and evidence for the next task.
2. Check `git status --short` and compare the current files with the checkpoint. If a base commit exists, inspect its diff; with an unborn branch, inspect untracked files as well. Do not run cleanup/reset commands to make the tree match an old report.
3. Reconcile any still-running outgoing sessions or workers before overlapping writes. This is a coordination protocol, not an automatic filesystem lock. If the previous session ended unexpectedly, inspect the current tree and preserve incomplete changes.
4. Record the new owner and next bounded task in the checkpoint, then continue the first incomplete item. Update evidence and the matrix only when the relevant checks actually pass.

For a manual switch, stop the outgoing development run, then start Claude Code from the repository root:

```bash
claude "Read CLAUDE.md and docs/engineering/handoff.md, reconcile the current working tree and saved reports, record yourself as the incoming orchestrator, and continue the first incomplete next action. Preserve existing changes and distinguish historical evidence from checks you run now."
```

Use the same checkpoint when switching back to Codex. There is no need to recreate historical agent thread names. Delegate again only when authorized and useful, with new bounded assignments and persistent reports. No permanent bridge, credential transfer, or quota-monitoring service is required by this procedure.

## Responsibilities and skills

| Responsibility | Skills | Required evidence |
| --- | --- | --- |
| Orchestration and scope | update-project, first-principles-review | Current implementation plan and requirement traceability |
| Domain and architecture | project-structure | Explicit contracts, ownership, invariants and dependency direction |
| Frontend and canvas | project-structure, refactor | Reference mapping, browser behavior, keyboard and responsive checks |
| Backend and access | security, testing | Migrations, RLS/privilege tests, immutable snapshots and transaction tests |
| Tooling | setup | Reproducible install/build/typecheck/lint and documented commands |
| Quality and release | codebase-review, testing, security | Whole-flow, negative, persistence, visual and duplication evidence |

## Sharing skills with Claude Code

The project workflow uses the eight development skills listed above. On the current workstation, their directories under `~/.codex/skills/` are also available through same-name symlinks in `~/.claude/skills/`. Claude Code reads the same `SKILL.md`, rules, scripts and references as Codex; editing a shared source updates both tools. Existing Claude skills are preserved.

The personal installation also includes `xcode-26` and `xcode-build-fixer` from `~/.codex/skills/`, and `find-skills` from `~/.agents/skills/`. These are available for relevant tasks and do not add Apple tooling to this application.

This installation belongs to the workstation, not the repository. On another machine, first install the source skill directories, then create one same-name directory symlink under `~/.claude/skills/` for each skill. Preserve existing destination skills and resolve conflicts before linking. Do not copy credentials, account settings or agent session data.

Use `/skills` in Claude Code to confirm discovery, and invoke a workflow with its name, such as `/project-structure` or `/testing`. If an existing session does not show the linked skills, start a new session in the repository. Follow the repository-root `CLAUDE.md` and keep it synchronized with `AGENTS.md`; shared procedures do not guarantee identical model behavior or tool availability.

Skills provided by Codex plugins may depend on their host's tools and connectors. They are not part of this personal-skill transfer and require compatible Claude integrations separately. Local personal skills also do not automatically install into Cowork or cloud sessions. See the [official Claude Code skills documentation](https://code.claude.com/docs/en/skills#choose-where-skills-load) for supported locations and symlinks.

## Integration gates

- Domain agreement: state changes, payloads, permissions, and storage contracts are explicit.
- Implementation: working behavior replaces prototype-only simulations.
- Verification: checks include failure paths, cross-client access, retries, and reload persistence.
- Visual audit: use the reference for workflow inspiration, evaluate the new minimalist modern design at 1600 by 1000 and verify smaller viewports, long content, empty states, spacing and focus behavior.
- Release: no unresolved critical defects; exactly 10 seeded clients and 25 seeded projects can exercise all required flows; deployment and recovery instructions match the tested state.

## Scope control

The supplied references describe the original prototype. Their instructions to avoid real backend work were superseded by the production goal. Do not delete reference content to make coverage look complete. New evidence belongs in docs/verification; mark untested requirements as unverified.
