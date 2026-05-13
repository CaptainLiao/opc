# OPC

OPC is a local workflow protocol for coding agents.

It includes a tiny CLI controller that turns requirements into reviewable, resumable, and verifiable work items:
specs in, artifacts out, verified before done.

Core idea:

```text
file protocol + state machine + agent execution + verification/rework
```

## usage
```
opc init
opc update
opc new "需求文本" [--draft]
opc run <work-item-id>
opc resume <work-item-id>
opc status [work-item-id]
```