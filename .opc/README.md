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

Run `opc update` to add missing built-in prompt files or small compatibility notes without overwriting local prompt changes.

## agents/

- `design.md`: turns the request into `spec.md`
- `code.md`: implements the spec
- `verify.md`: writes `verify.md`
- `ui-verify.md`: verifies UI behavior with Playwright when `config.json` has `ui` and the work item requires UI verification
- `pr.md`: writes `pr.md`

Optional UI verification config:

```json
{
  "ui": {
    "baseUrl": "http://localhost:5173",
    "startCommands": ["pnpm mock", "pnpm dev"],
    "timeoutMs": 60000
  }
}
```

UI verification only runs when `spec.md` contains:

```text
uiVerification: required
```

## work-items/

Generated work items live here and are ignored by Git by default.

## UI verification

UI verification is optional per work item. It only runs when `.opc/config.json` has `ui` and `spec.md` contains:

```text
uiVerification: required
```

Example config:

```json
{
  "ui": {
    "baseUrl": "http://localhost:5173",
    "startCommands": ["pnpm mock", "pnpm dev"],
    "timeoutMs": 60000
  }
}
```
