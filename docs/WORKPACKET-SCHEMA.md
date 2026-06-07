# WorkPacket Schema

The `WorkPacket` is the primary data structure flowing through the bridge.

## 📄 JSON Schema

```json
{
  "packetId": "string (UUID v4)",
  "source": "string",
  "threadTitle": "string",
  "capturedAt": "string (ISO-8601)",
  "prompt": "string",
  "requiresHumanApproval": "boolean (Forced to true)",
  "state": "incoming | approved | in-progress | complete | rejected",
  "version": "number",
  "repo": "string (optional)",
  "allowedFiles": "string[] (optional)",
  "forbiddenActions": "string[] (optional)",
  "acceptanceCriteria": "string[] (optional)",
  "result": "string (optional, written at 'complete')",
  "rejectionReason": "string (optional, written at 'rejected')",
  "completedAt": "string (optional, ISO-8601)"
}
```

## 🔍 Field Definitions

- `packetId`: Unique identifier used for file naming (`<packetId>.json`).
- `source`: The origin of the prompt (e.g., "chatgpt", "claude").
- `prompt`: The actual instruction captured from the web AI.
- `state`: The current position in the state machine.
- `result`: The final output or summary of work performed by the local agent.
- `repo`: A hint to the agent about which local repository the work pertains to.
