# Extension Identity Boundary

## Purpose

This document defines how the Chrome extension identifies itself to the local system
without becoming a human identity authority.

The extension is a **paired local client**. It is not a login surface, approval authority,
custody authority, or execution authority.

Human identity, team membership, agent bindings, role permissions, encrypted identity
records, and approval authority remain owned by **The Librarian**.

---

## Core Principle

```
Pairing proves the client.
Login proves the human.
Custody binds the decision.
```

The Chrome extension may submit signed decision intents, but The Librarian must resolve
the active human session, validate authority, record the decision, and enforce any
permitted state transition.

---

## Role Separation

### Chrome Extension

The Chrome extension **may**:
- pair with the local bridge or Librarian service;
- store a scoped local client secret;
- sign requests using that client secret;
- display custody and decision status;
- submit decision intents such as `approve_requested`, `reject_requested`,
  or `defer_requested`;
- display results returned from the local system for human review.

The Chrome extension **must not**:
- authenticate the human independently;
- store human credentials;
- store unencrypted team or agent identity data;
- approve work directly;
- execute work directly;
- change bridge state by itself;
- bypass The Librarian custody layer;
- post results back into a browser page automatically.

### The Librarian

The Librarian owns:
- human authentication;
- active user session;
- team membership;
- role permissions;
- agent registry;
- user-agent bindings;
- custody records;
- approval records;
- policy validation;
- provenance records;
- final decision authority.

The Librarian validates every browser-originated decision intent before recording it.

### agent-bridge

`agent-bridge` remains the local transport and queue layer.

It **may**:
- receive signed extension requests;
- forward status and decision intents;
- expose queue state;
- preserve audit trail.

It **must not**:
- become the human identity authority;
- treat extension pairing as approval;
- start execution without validated approval;
- mutate custody records directly unless explicitly authorized by The Librarian.

---

## Pairing Model

The extension uses **local pairing**, not username/password login.

A typical pairing flow:

1. The Librarian generates a local pairing token.
2. The user pairs the Chrome extension with the local system.
3. The extension receives a scoped client secret.
4. The extension stores the client secret locally.
5. Extension requests are signed using the client secret.
6. The Librarian or local bridge verifies the signature.
7. The Librarian resolves the active logged-in human session internally.

---

## Signed Request Model

Browser-originated requests should use a signed envelope.

```json
{
  "client_id": "chrome-extension-local-1",
  "custody_id": "CUST-2026-0001",
  "decision_intent": "approve_requested",
  "timestamp": "2026-06-09T12:00:00Z",
  "nonce": "random-nonce",
  "body_hash": "sha256:...",
  "signature": "hmac-sha256:..."
}
```

The signature should cover:

```
method + path + timestamp + nonce + body_hash
```

This provides:
- client authenticity;
- body integrity;
- replay resistance;
- auditability.

---

## Human Identity Resolution

The extension does not send or prove human identity by itself.

When a signed decision intent arrives, The Librarian must resolve:
- the active logged-in user;
- whether that user is allowed to act on the custody record;
- whether that user has the required role;
- whether the requested decision is valid for the current custody state;
- whether the assigned agent is eligible for the requested work.

Example resolved decision record:

```json
{
  "client_id": "chrome-extension-local-1",
  "human_identity": "active_librarian_user",
  "agent_identity": "assigned_local_agent",
  "custody_id": "CUST-2026-0001",
  "decision_intent": "approve_requested",
  "permission_result": "allowed",
  "decision_recorded": true,
  "execution_permission": "not_granted_until_state_transition"
}
```

---

## Decision Intent vs Approval

A browser-originated decision request is only an **intent**.

It is not approval until The Librarian validates and records it.

**Required rule:**

```
extension decision intent ≠ approval
validated Librarian custody decision = approval record
approval record ≠ automatic execution
```

Execution still requires a valid downstream state transition.

---

## Agile-in-a-Box Compatibility

This boundary supports future Agile-in-a-Box team workflows.

Future identity types may include:

**Human roles:**
- Owner
- Product Owner
- Scrum Master
- Developer
- QA
- Reviewer
- Observer

**Agent roles:**
- Coding Agent
- QA Agent
- Documentation Agent
- Research Agent
- Build Agent
- Release Gate Agent

**System roles:**
- **The Librarian:** custody, provenance, and policy authority
- **agent-bridge:** transport and queue layer
- **LINK:** advisory layer only
- **Chrome extension:** paired browser client

The extension remains a client even when teams and agents are introduced.

---

## Security Requirements

The system must enforce:
- scoped extension pairing;
- signed extension requests;
- nonce and timestamp replay protection;
- no browser-side human credential storage;
- no approval based only on extension identity;
- no execution based only on extension identity;
- encrypted storage of user, team, and agent identity records where applicable;
- complete audit trail for client, human, agent, custody artifact, and decision.

---

## Audit Record Requirements

Every browser-originated decision intent should record:
- client ID;
- custody ID;
- request timestamp;
- nonce;
- request hash;
- signature verification result;
- active human identity resolved by The Librarian;
- role/permission result;
- decision outcome;
- resulting custody state;
- resulting bridge state;
- whether execution permission was granted.

---

## Hard Constraints

- The extension does not login as a human.
- The extension does not approve work.
- The extension does not execute work.
- The extension does not become custody authority.
- The extension does not store human credentials.
- The extension does not bypass The Librarian.
- The Librarian remains the decision authority.
- agent-bridge remains the transport and queue layer.

---

## Summary

The Chrome extension is a **paired local client** that improves usability by keeping
review and decision intent near the browser conversation.

It does not replace The Librarian's authentication, policy, custody, or approval systems.

```
Pairing proves the client.
The Librarian proves the human.
Custody records the decision.
```
