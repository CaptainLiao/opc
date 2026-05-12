# OPC Quick Guide for Agents

OPC is the MVP implementation of the Symphony idea: a local CLI for turning agent coding into a recoverable, reviewable workflow.

Core idea:

```text
file protocol + state machine + agent orchestration + verification/rework
```

## Current Flow

Work items live in `.opc/work-items/`.

```text
created -> design_done -> code_done -> verified -> done
```

Verification can also send implementation failures to `fixing_code` once, then `blocked`.

## Commands

```powershell
npm test
npm run opc -- init
npm run opc -- new "需求文本" --draft
npm run opc -- status
npm run opc -- run <work-item-id>
```

## Key Files

- `bin/opc.js`: CLI commands.
- `lib/workflow.js`: workflow states and transitions.
- `lib/orchestrator.js`: runs agents, validates artifacts, retries, blocks failures.
- `lib/work-items.js`: work item file protocol.
- `lib/init.js`: `.opc` setup and default agent prompts.
- `lib/runner.js`: external runner invocation.
- `test/`: Node built-in tests.

## Notes

- Keep the first version simple: CLI, files, fixed workflow, structured outputs.
- Agents should communicate through files, not direct conversation state.
- Generated runtime data in `.opc/work-items/` is ignored by Git.
- When changing workflow behavior, update `lib/workflow.js`, `lib/orchestrator.js`, and tests together.
