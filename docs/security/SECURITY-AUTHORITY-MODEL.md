# Security and Authority Model

## Summary

agent-bridge inherits the SEC-1 and SEC-1A security model from The Librarian suite.

SEC-1 is not project-local. It applies to any repository, extension, add-on, model workflow, crawler, RAG pipeline, or integration that touches The Librarian custody, authority, privacy, decision, diagnostic, bridge, or export chain.

## Inheritance declaration

| Surface | Classes | Controls inherited |
|---|---|---|
| Bridge server | A / B / C / E | Human validation boundary, custody/provenance controls, privacy/export controls, visual-boundary controls |
| Browser extension | A / B / C / E | Intent-only UX, no authority fields, no CSS permission, no identity exposure |

## Five-class model

| Class | Category | Core rule |
|---|---|---|
| A | Authority-touching | Human validates. No auto-approval. Audit log. Fail closed. |
| B | Custody/provenance | Hash verify. Source provenance. Tamper detect. |
| C | Privacy/export | Redact. Minimize. Retain. Privacy mode. |
| D | Advisory/model | Output is advisory. Cannot self-verify or approve. |
| E | Visual-only | No permission in CSS. No authority fields. Intent path. |

## Important boundary

Class D and Class E close two common authority leaks:

1. Model output that sounds authoritative.
2. UI display state that implies permission.

For agent-bridge, the second is especially important:

```text
A button class may look like approval.
It is not approval.
It can only emit signed intent.
```

## Prohibited fields in extension-visible payloads

Avoid exposing or inventing fields such as:

```text
approvedBy
humanId
authorizedUser
permissionGranted
canExecute
canApprove
approvalStatus
```

Use review/evidence vocabulary instead:

```text
intent_status
custody_status
integrity_status
queue_state
review_status
provenance_chain
extension_visible_status
```

## Implementation rule

```text
GET endpoints may assemble evidence.
GET endpoints may not resolve authority.
```

## AB-8 security inheritance

AB-8 is classified as:

- Class A — authority-touching
- Class B — custody/provenance-touching
- Class E — visual-only

Therefore AB-8 must remain a read-only viewer. It must not introduce approval, execution, queue mutation, or identity exposure.
