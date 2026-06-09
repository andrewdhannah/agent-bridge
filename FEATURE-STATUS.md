# Feature Status — agent-bridge

| Feature / Sprint | Status | Notes |
|---|---|---|
| AB-1 — Verification Gate | ✅ Complete | Verified safe V0.1 lifecycle |
| AB-2 — Integration Boundary Spec | ✅ Complete | Formal contracts and boundaries defined |
| AB-3 — Controlled Intake Prototype | ✅ Complete | Proven safe intake without auto-execution |
| AB-4 — Intake Contract Validation | ✅ Complete | Receiver-side validator enforces 14-point intake contract; rejects unsafe/malformed receipts |
| AB-5 — Controlled Custody Handoff | ✅ Complete | Validated receipt enters Librarian custody as evidence_of_intent; execution not_granted; bridge queue unchanged |
| AB-5b — Extension Identity Boundary | ✅ Complete | Boundary doc: pairing, signed requests, decision intent ≠ approval |
| AB-6 — Extension Status Reflection | ✅ Complete | Read-only aggregated status endpoint with HMAC pairing; 30/30 tests pass |
| AB-7 — Browser Decision Intent Surface | ✅ Complete | Signed intent channel (POST /api/decision-intent); no queue mutation; 31/31 tests pass |
| AB-8 — Decision Review / Record Viewer | 🔍 Pending Human Verification | Read-only viewer; Class A/B/E under SEC-1 inheritance; 248/248 acceptance tests pass; no approval, queue mutation, execution trigger, identity exposure, or authority transfer |
| AB-9 — Persistent Pairing + Decision Context | 🔍 Pending | Persistent local pairing, context cards from custody/provenance, no repeated prompts; 175/175 tests pass; Class A/B/C/E |
