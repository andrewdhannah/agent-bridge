# AB-6 — Extension Status Reflection Report

**Date:** 2026-06-09
**Status:** ✅ PASSED
**Verifier:** OpenWork Agent

---

## 1. Goal

Expose Librarian custody/decision status back to the Chrome extension as **read-only state**, using the extension identity boundary, without allowing approval, execution, browser postback, or custody mutation from the extension.

---

## 2. Trust Chain Context

| Sprint | Layer | Direction |
|---|---|---|
| AB-3 | Receipt generation | Producer → Receiver |
| AB-4 | Receipt validation | Receiver-side check |
| AB-5 | Custody handoff | → Librarian |
| AB-5b | Extension identity boundary | Constraint definition |
| **AB-6** | **Status reflection** | **Librarian/Bridge → Extension (read-only)** |

AB-6 establishes the first **read-only return path** — status flows from the local system to the browser for human visibility. It does not reverse any previous constraint.

---

## 3. Implementation

### Modified/New Files

| File | Change | Purpose |
|---|---|---|
| `server/src/types.ts` | Extended | Added `PairingConfig`, `SignedEnvelope`, `StatusPayload`, `CustodyStatusSummary`, `WorkPacketSummary` types |
| `server/src/pairing.ts` | **Created** | HMAC-SHA256 signature verification, pairing config load/save |
| `server/src/custody-status.ts` | **Created** | Read-only Librarian MCP client for custody artifact queries |
| `server/src/http-server.ts` | Extended | Added `GET /api/status` with pairing verification |
| `server/src/index.ts` | Extended | Passes `pairingConfigPath` to HTTP server config |
| `scripts/bridge-pair.js` | **Created** | CLI tool to generate extension pairing config |
| `tests/ab-6-status-readonly.js` | **Created** | Acceptance test (30 assertions) |
| `docs/architecture/DATA-FLOW-MATRIX.md` | Extended | Added Librarian → Bridge custody status flow |

### Endpoint: `GET /api/status`

Returns aggregated read-only state when the request includes a valid `X-Signed-Request` header.

**Verification flow:**
1. Bridge loads stored `PairingConfig` from `bridge-config.json`
2. Extension request includes `X-Signed-Request` header with signed envelope (`clientId`, `timestamp`, `nonce`, `signature`)
3. Bridge recomputes HMAC-SHA256 over `method + path + timestamp + nonce + bodyHash`
4. Constant-time comparison against provided signature
5. Timestamp must be within 5-minute window (replay protection)
6. Unverified requests receive **401 Unauthorized**

**Payload includes:**
- `bridge` — instance identity and uptime
- `queue` — counts per state (incoming, approved, in-progress, complete, rejected)
- `queueItems` — last 10 items per state with summary fields
- `custody` — status from Librarian (or null if unreachable)
- `librarianHealth` — `connected` or `disconnected`

All fields are read from disk or Librarian MCP queries. No mutation occurs.

---

## 4. Acceptance Test Results

| # | Test | Assertions | Result |
|---|---|---|---|
| 1 | Unpaired client cannot access status | 2 | ✅ PASS |
| 2 | Paired client receives aggregated status | 1 | ✅ PASS |
| 3 | Status payload contains all required fields | 17 | ✅ PASS |
| 4 | Queue item summaries have correct shape | 5 | ✅ PASS |
| 5 | Expired/replayed signature is rejected | 2 | ✅ PASS |
| 6 | No write paths through status endpoint | 3 | ✅ PASS |
| **Total** | | **30** | **✅ ALL PASS** |

---

## 5. Hard Constraint Verification

| Constraint | Status | Evidence |
|---|---|---|
| No approval from extension | ✅ | Status endpoint is read-only (GET only, no mutation) |
| No execution from extension | ✅ | No execution path in any endpoint |
| No custody mutation from extension | ✅ | Custody queries are read-only MCP (`librarian_search`) |
| No browser postback | ✅ | Extension polls bridge; bridge does not push to browser |
| No browser UI injection | ✅ | No code injection of any kind |
| No Librarian bypass | ✅ | Extension talks to bridge; bridge queries Librarian |
| No human credential exposure | ✅ | Pairing stores client secret only; no human credentials |
| Paired client ≠ approved client | ✅ | Status is read-only; no write operations available |

---

## 6. Extension Pairing Model

The pairing model matches `EXTENSION-IDENTITY-BOUNDARY.md`:

```
Pairing proves the client.
The Librarian proves the human.
Custody records the decision.
```

The bridge now enforces:

- **Scoped pairing** — single client secret per bridge instance
- **Signed requests** — HMAC-SHA256 over method + path + timestamp + nonce
- **Replay protection** — 5-minute timestamp window
- **No browser-side human credentials** — the pair secret proves client identity only
- **No approval based on pairing** — even a valid signature returns read-only data only

---

## 7. Conclusion

AB-6 is complete. The Chrome extension can now receive read-only aggregated status (queue state, custody status, Librarian health) by presenting a signed request that proves client pairing.

The status flow is:
```
Librarian (MCP, read-only)  →  Bridge (aggregate)  →  Extension (poll, signed)
```

No write path exists. No approval bypass is possible. The extension identity boundary is preserved and operationalized.
