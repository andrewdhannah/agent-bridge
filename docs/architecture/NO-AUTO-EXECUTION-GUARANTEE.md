# No-Auto-Execution Guarantee

## Statement of Commitment
The `agent-bridge` and its integration with The Librarian are designed with a fundamental commitment to **Human-in-the-Loop (HITL)** control. 

**We guarantee that no request originating from a web browser can result in the automatic execution of local code, file modifications, or system changes without explicit, conscious human approval.**

## 1. The Mandatory Gate
The transition from `incoming` to `approved` is the **Execution Gate**. 
- This transition can only be performed by a human user.
- No automated process, AI model, or extension script can call `queue_approve` on its own behalf.
- Any attempt to bypass this gate via the API will be rejected by the server's state machine.

## 2. Forbidden Automations
To maintain this guarantee, the following capabilities are strictly forbidden:
- **Auto-Start:** The server will not automatically move a packet to `in-progress` upon receipt.
- **Auto-Postback:** The system will not automatically inject results back into a browser window or send messages to a web AI.
- **Auto-Clicking:** The bridge will not drive the browser UI to "approve" its own requests.

## 3. Verification of Guarantee
This guarantee is verified by:
1. **State Machine Enforcement:** The server code explicitly forbids the `incoming` $\rightarrow$ `in-progress` transition.
2. **Audit Trail:** Every execution must be preceded by an `approved` state record with a timestamp and approver identity.
3. **Code Review:** The `http-server.ts` and `tools.ts` are audited to ensure no "fast-track" paths exist.

## 4. Scope of Guarantee
This guarantee applies to all work packets processed through the `agent-bridge`. It does not preclude the human from using other tools to automate their own workflow, but the bridge itself will never act as an autonomous executor.
