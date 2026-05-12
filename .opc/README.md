# OPC

OPC stores project-local agent rules and work item state here.

## config.json

`runner` chooses which local agent command OPC calls.

Default:

```json
{
  "runner": "codex",
  "timeoutMs": 1200000
}
```

`timeoutMs` is the maximum time a single Agent run may take before OPC stops it and retries.

The agent prompts use the fixed files in `.opc/agents/`.

## agents/

- `design.md`: turns the request into `spec.md`
- `code.md`: implements the spec
- `verify.md`: writes `verify.md`
- `pr.md`: writes `pr.md`

## work-items/

Generated work items live here and are ignored by Git by default.
