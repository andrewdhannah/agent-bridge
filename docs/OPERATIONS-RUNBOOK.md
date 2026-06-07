# Operations Runbook

## 🛠️ Daily Operations

### Monitoring the Queue
Use the `queue_status` tool to check for pending work:
- `incoming`: Needs review/approval.
- `approved`: Ready for agent pickup.
- `in-progress`: Currently being worked on.

### Handling Stuck Packets
If a packet is stuck in `in-progress` (e.g., agent crashed):
1. Identify the `packetId`.
2. Use `queue_reject` to move it to the rejected state.
3. Analyze the `rejectionReason` for debugging.

## 🚨 Troubleshooting

### Port Conflict (EADDRINUSE)
If the server fails to start on port 3457:
```bash
lsof -i :3457
kill -9 <PID>
```

### Permission Denied
Ensure the `AGENT_BRIDGE_QUEUE_DIR` is writable by the user running the server.

### Extension Not Connecting
1. Verify the server is running (`curl http://127.0.0.1:3457/health`).
2. Check Chrome extension logs for CORS errors.
