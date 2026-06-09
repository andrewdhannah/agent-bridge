# AB-3 — Controlled Librarian Intake Prototype

**Goal:**
Prove that The Librarian can consume an `agent-bridge` queue item as an intake artifact without executing it automatically.

## Hard Constraints
- **No Auto-Execution:** The act of importing a bridge item must not trigger any local scripts or file edits.
- **No Auto-Approval:** The Librarian must not automatically transition a bridge item to an "approved" or "executable" state.
- **No Browser Postback:** No results or status updates are sent back to the browser during this prototype.
- **No Custody Bypass:** The intake process must follow The Librarian's standard custody and provenance rules.
- **Intake Only:** The queue item enters The Librarian as evidence/intake only.
- **Human Authority:** The human remains the sole approval authority for any subsequent action.

## Acceptance Test Sequence
1. **Queue Item Creation:** A work packet is captured and queued in `agent-bridge`.
2. **Artifact Export:** The packet is exported or made available as an intake-readable artifact.
3. **Librarian Import:** The Librarian imports or references the artifact.
4. **Provenance Recording:** The Librarian records the provenance (source, packetId, timestamp).
5. **Risk Classification:** The Librarian classifies the risk level and identifies the required approval authority.
6. **Execution Block:** Verify that no execution occurs automatically.
7. **Human Decision:** Verify that a human can then explicitly approve or reject the next proposed action.

## Status
- **State:** Planned
- **Owner:** OpenWork Agent
