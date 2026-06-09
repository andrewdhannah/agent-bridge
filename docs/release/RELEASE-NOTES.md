# agent-bridge Release Notes

## Current product baseline

agent-bridge has moved from a simple V0.1 local queue bridge into a security-constrained trust transport for browser-to-local agent handoff.

## Major completed layers

| Layer | Status | Result |
|---|---:|---|
| AB-1 | Complete | Bridge lifecycle verified. |
| AB-2 | Complete | Integration boundary specified. |
| AB-3 | Complete | Safe receipt generation, producer-side. |
| AB-4 | Complete | Safe receipt validation, receiver-side. |
| AB-5 | Complete | Controlled custody handoff. |
| AB-5b | Complete | Extension identity boundary. |
| AB-6 | Complete | Read-only extension status reflection. |
| AB-7 | Complete | Signed decision intent channel, non-authoritative. |
| SEC-1 | Complete | Security/privacy/integrity baseline. |
| SEC-1A | Complete | Cross-project inheritance enforcement. |
| AB-8 | Planned | Decision Review / Decision Record Viewer. |

## Product message

agent-bridge is a trust bridge, not a control channel.

It safely carries human-facing intent from the browser to the local custody and agent environment while preserving the authority boundary.

## Current headline

```text
Secure browser-to-local agent handoff.
```

## Supporting claims

- Human-validated
- Audited
- Non-authoritative by design
- Local-first bridge transport
- Signed intent, not browser control
- Extension-visible status only
- No auto-execution
- No auto-approval
- No identity leakage to extension

## Recommended GitHub topic tags

```text
agentic-ai
local-first
human-in-the-loop
mcp
browser-extension
security
provenance
audit-trail
typescript
ai-tools
```
