# agent-bridge Product Overview

agent-bridge is a local-first bridge for moving browser-side AI work intent into local agentic workflows without giving the browser direct control over the machine.

It is designed for workflows where a person wants to use a web AI interface for ideation, planning, or prompting, but wants execution to remain local, auditable, and human-gated.

## What problem it solves

Web AI tools are useful for generating work requests, but they should not have direct uncontrolled access to local projects, files, agents, terminals, or custody records.

agent-bridge provides a safer path:

```text
Browser intent → local bridge verification → audit → custody → human authority → local execution path
```

## What makes it different

agent-bridge is intentionally non-authoritative.

It is not an automation tunnel. It is not browser-to-terminal control. It is not an approval engine.

It is a trust-preserving transport and review layer.

## Current maturity

The project now has:

- verified bridge lifecycle
- signed decision intent
- read-only status reflection
- audit trail
- cross-project security inheritance
- planned read-only decision review viewer

## Product one-liner

```text
agent-bridge securely carries human-facing intent from the browser to your local agent workflow without transferring authority to the browser, extension, bridge, or model.
```
