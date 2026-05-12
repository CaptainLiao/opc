# OPC

OPC stores project-local agent rules and work item state here.

## config.json

`runner` chooses which local agent command OPC calls.

Default:

```json
{
  "runner": "codex"
}
```

The agent prompts use the fixed files in `.opc/agents/`.

## agents/

- `design.md`: turns the request into `spec.md`
- `code.md`: implements the spec
- `verify.md`: writes `verify.md`
- `pr.md`: writes `pr.md`

## work-items/

Generated work items live here and are ignored by Git by default.
