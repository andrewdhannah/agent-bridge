# agent-bridge Trust Chain

## Purpose

This document summarizes the operational trust chain created across AB-1 through AB-8 planning.

agent-bridge is not an authority system. It is a transport, verification, audit, and review-adjacent layer that carries human-facing intent from browser surfaces into local custody workflows.

## Governing line

```text
AB-7 emits intent.
SEC-1 hardens the path.
AB-8 displays the record.
```

## Complete chain

```text
AB-3  → Generate receipt
AB-4  → Validate receipt
AB-5  → Assign custody
AB-6  → Reflect status, read-only
AB-7  → Submit decision intent, non-authoritative
SEC-1 → Security / integrity / privacy baseline
SEC-1A→ Cross-project inheritance enforcement
AB-8  → Review decision records, read-only, planned
```

## Authority map

| Component | Role | Authority status |
|---|---|---|
| TheLibrarian core | Validates and records decisions | Sole authority |
| agent-bridge | Transport layer; verifies pairing, nonce, timestamp | Non-authoritative |
| Browser extension | UI surface; submits signed intents only | Non-authoritative |
| QA-PilotV2 | Course runtime; protects student data | Privacy scoped, non-authoritative |
| LINK | Advisory layer | Cannot approve or mutate custody |

## AB-7 verified invariants

AB-7 delivered the signed decision-intent channel.

Verified properties:

- Queue counts remain unchanged after decision intent submission.
- No queue start or complete path is called.
- No human identity fields are exposed to the extension.
- Duplicate nonce is rejected.
- Expired timestamp is rejected.
- Wrong signature / unpaired extension is rejected.
- Bridge returns extension-safe response only.

## AB-8 review boundary

AB-8 may inspect decisions.

AB-8 may not make decisions.

The decision review viewer exists to let a human independently inspect:

```text
extension intent
→ bridge audit
→ Librarian custody / decision record
→ integrity status
→ extension-visible status
```

The viewer must not create an approval path, queue mutation, execution trigger, identity leak, or authority transfer.
