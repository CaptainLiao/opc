# OPC Quick Guide for Agents

OPC makes coding-agent work reviewable, resumable, and verifiable.

A tiny local runner for coding-agent workflows: specs in, artifacts out, verified before done.

Core idea:

```text
file protocol + state machine + agent execution + verification/rework
```

## Commands

```powershell
npm test
npm run opc -- init
npm run opc -- update
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


# LLM 指引
## Think Before Doing

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 错误处理
- 禁止吞掉错误，除非明确说明不显示/处理错误
- 总是在最外层处理错误




