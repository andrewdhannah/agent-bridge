# agent-bridge V0.1 — Session Handoff

**Status:** Implementation-ready, awaiting end-to-end verification  
**Project:** `/Users/andrew/Desktop/OpenWork/agent-bridge`  
**Server:** `/Users/andrew/Desktop/OpenWork/agent-bridge/server`  
**Extension:** `/Users/andrew/Desktop/OpenWork/agent-bridge/extension` (to be created)

---

## What Was Built

A **human-in-the-loop bridge** between web AI tools (ChatGPT, Claude, etc.) and local agents (OpenWork/OpenCode):

1. **MCP Server** (`server/src/`) — TypeScript, exposes 7 queue tools via stdio
2. **HTTP Bridge** (`server/src/http-server.ts`) — Accepts POST /incoming from Chrome extension
3. **Queue State Machine** (`server/src/queue.ts`) — File-based JSON packets with enforced transitions
4. **Tool Definitions** (`server/src/tools.ts`) — Unified `queue_*` naming convention
5. **Chrome Extension Spec** — Manifest V3, background.js, popup.html/js (defined, not yet created on disk)

## Architecture

```
Web AI page
    ↓
Chrome extension captures prompt
    ↓
POST http://127.0.0.1:3457/incoming
    ↓
Bridge validates → writes WorkPacket JSON
    ↓
queue/incoming/
    ↓ human/MCP approval (queue_approve)
queue/approved/
    ↓ agent picks up (queue_start)
queue/in-progress/
    ↓ execution completes (queue_complete)
queue/complete/  ← result payload stored here
```

## File Inventory

| File | Purpose |
|------|---------|
| `server/package.json` | Node project config, ESM, MCP SDK dependency |
| `server/tsconfig.json` | TypeScript config (NodeNext, ES2022, strict) |
| `server/src/index.ts` | Entry point — starts MCP stdio + HTTP servers |
| `server/src/types.ts` | WorkPacket interface, QueueState, VALID_TRANSITIONS |
| `server/src/queue.ts` | File-based queue ops: enqueue, transition, inspect, list, summary |
| `server/src/tools.ts` | MCP tool registration: queue_status, queue_list, queue_inspect, queue_approve, queue_reject, queue_start, queue_complete |
| `server/src/http-server.ts` | HTTP server: POST /incoming, GET /status, GET /inspect/:id, GET /health |
| `server/queue/` | Runtime queue directory (incoming/, approved/, in-progress/, complete/, rejected/) |

## Tool Naming (Unified)

- `queue_status` — summary counts
- `queue_list` — list packets in a state
- `queue_inspect` — full packet details
- `queue_approve` — incoming → approved
- `queue_reject` — any → rejected
- `queue_start` — approved → in-progress
- `queue_complete` — in-progress → complete (stores result)

## Environment Variables

```bash
export AGENT_BRIDGE_QUEUE_DIR="/Users/andrew/Desktop/OpenWork/agent-bridge/server/queue"
export AGENT_BRIDGE_PORT=3457        # default
export AGENT_BRIDGE_NAME="agent-bridge"  # default
```

## Build & Start

```bash
cd /Users/andrew/Desktop/OpenWork/agent-bridge/server
npm install      # if needed
npm run build    # compiles src/ → dist/
npm run start    # starts both MCP + HTTP servers
```

## Known Issues / Pending

1. **Port conflict on 3457** — Previous server instances may not terminate cleanly. Use `lsof -i :3457` to find and `kill -9 <PID>` before starting.
2. **Extension files not yet created** — The extension source is fully specified but not written to disk. Create `/Users/andrew/Desktop/OpenWork/agent-bridge/extension/` with manifest.json, background.js, popup.html, popup.js.
3. **End-to-end verification not yet run** — See Verification Gate below.

## Verification Gate (10 Steps)

**PASS only if all 10 succeed:**

1. `npm run build` passes with no errors
2. `npm run start` exposes both MCP stdio and HTTP server without errors
3. Chrome extension submits a prompt successfully (POST /incoming returns 201)
4. Packet appears in `queue/incoming/` as JSON file
5. `queue_approve` moves packet: incoming → approved
6. `queue_start` moves packet: approved → in-progress
7. `queue_complete` moves packet: in-progress → complete (with result payload)
8. Result payload is preserved and retrievable via `queue_inspect`
9. Invalid transition rejected (e.g., complete → approved fails)
10. Web payload cannot disable `requiresHumanApproval` (forced to `true` in http-server.ts)

**Test helper (run in second terminal):**

```bash
cd /Users/andrew/Desktop/OpenWork/agent-bridge/server
export AGENT_BRIDGE_QUEUE_DIR="/tmp/agent-bridge-test-queue"
mkdir -p "$AGENT_BRIDGE_QUEUE_DIR"

# After extension submits, grab packet ID:
packetId=$(basename "$(ls -t "$AGENT_BRIDGE_QUEUE_DIR/incoming"/*.json | head -n 1)" .json)
echo "Packet ID: $packetId"

# Run transitions
node -e " (async () => { const { transition } = await import('./dist/queue.js'); await transition(\"$AGENT_BRIDGE_QUEUE_DIR\", \"$packetId\", \"approved\"); console.log('approved'); })()"
node -e " (async () => { const { transition } = await import('./dist/queue.js'); await transition(\"$AGENT_BRIDGE_QUEUE_DIR\", \"$packetId\", \"in-progress\"); console.log('in-progress'); })()"
node -e " (async () => { const { transition } = await import('./dist/queue.js'); await transition(\"$AGENT_BRIDGE_QUEUE_DIR\", \"$packetId\", \"complete\", { result: \"demo result\" }); console.log('completed'); })()"

# Verify result
node -e " (async () => { const { inspect } = await import('./dist/queue.js'); const pkt = await inspect(\"$AGENT_BRIDGE_QUEUE_DIR\", \"$packetId\"); if (!pkt) throw new Error('not found'); console.log('result:', pkt.result); })()"

# Invalid transition test (should reject)
node -e " (async () => { const { transition } = await import('./dist/queue.js'); try { await transition(\"$AGENT_BRIDGE_QUEUE_DIR\", \"$packetId\", \"approved\"); console.log('should have failed'); } catch (e) { console.log('rejected (as expected):', e.message); } })()"
```

## Design Principles (Preserved)

- **Human gate:** All work items require explicit approval (`requiresHumanApproval: true`)
- **No auto-postback:** Phase 1 stops at `complete/` — no automatic posting back to web AI
- **Audit trail:** Every state transition is a file system operation on plain JSON
- **Browser constrained:** Extension only POSTs to localhost — no file system access
- **MCP-only approval:** Approval/rejection is via MCP tools, not HTTP endpoints

## Next Steps for New Session

1. Resolve port conflict and verify server starts cleanly
2. Create extension files on disk (manifest.json, background.js, popup.html, popup.js)
3. Load extension in Chrome Developer Mode
4. Run the 10-step verification gate
5. If all pass: label as `production-shaped V0.1 accepted`
6. If issues found: fix and re-run gate

---

**Outcome if all 10 pass:** production-shaped V0.1 accepted  
**Outcome if any fail:** debug, fix, re-run gate
