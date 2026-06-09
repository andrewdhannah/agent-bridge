const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Librarian Intake Receipt Generator
 * 
 * This script acts as a narrow intake adapter. It transforms a queued agent-bridge 
 * work packet into a Librarian-readable intake artifact.
 * 
 * HARD GUARD:
 * This script MUST NOT call queue_approve, queue_start, queue_complete, 
 * shell execution, browser automation, or any local agent command.
 * It is a read-only transformation tool.
 */

const QUEUE_DIR = process.env.AGENT_BRIDGE_QUEUE_DIR || '/Users/andrew/Desktop/OpenWork/agent-bridge/server/queue';
const INCOMING_DIR = path.join(QUEUE_DIR, 'incoming');
const RECEIPTS_DIR = '/Users/andrew/Desktop/OpenWork/agent-bridge/docs/reports/agent-bridge/receipts';

if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

function calculateHash(text) {
  return 'sha256:' + crypto.createHash('sha256').update(text).digest('hex');
}

function classifyRisk(prompt) {
  const destructiveKeywords = ['delete', 'rm', 'format', 'drop', 'overwrite', 'erase'];
  const isDestructive = destructiveKeywords.some(k => prompt.toLowerCase().includes(k));
  
  return {
    classification: isDestructive ? 'High' : 'Low',
    approval_required: true,
    reason: isDestructive ? 'Destructive operation detected' : 'Standard intake request',
  };
}

async function runIntakeReceiptGenerator() {
  console.log('--- Librarian Intake Receipt Generator ---');

  if (!fs.existsSync(INCOMING_DIR)) {
    console.error(`Error: Incoming queue directory not found at ${INCOMING_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(INCOMING_DIR);
  if (files.length === 0) {
    console.error('Error: No incoming packets found. Please submit a prompt first.');
    process.exit(1);
  }

  // Process the most recent packet
  const packetFile = files[0];
  const packetPath = path.join(INCOMING_DIR, packetFile);
  const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));

  console.log(`Processing packet: ${packet.packetId}`);

  const promptHash = calculateHash(packet.prompt);
  const risk = classifyRisk(packet.prompt);

  const receipt = {
    source: "agent-bridge",
    artifact_type: "librarian_intake_receipt",
    queue_item_id: packet.packetId,
    capture_timestamp: packet.capturedAt,
    intake_timestamp: new Date().toISOString(),
    request_summary: packet.prompt.substring(0, 100) + (packet.prompt.length > 100 ? '...' : ''),
    source_integrity_hash: promptHash,
    provenance: {
      origin: "browser_capture_or_queue_fixture",
      bridge_state_at_intake: "incoming",
      intake_adapter: "scripts/librarian-intake-receipt.js"
    },
    risk: risk,
    execution: {
      status: "not_executed",
      execution_attempted: false,
      approval_granted: false
    },
    next_allowed_action: "human_review_only"
  };

  const jsonPath = path.join(RECEIPTS_DIR, `${packet.packetId}-intake-receipt.json`);
  const mdPath = path.join(RECEIPTS_DIR, `${packet.packetId}-intake-receipt.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(receipt, null, 2));

  const mdContent = `# Intake Receipt: ${packet.packetId}

**Status:** NOT EXECUTED
**Next Action:** Human Review Only

## Metadata
- **Source:** ${receipt.source}
- **Artifact Type:** ${receipt.artifact_type}
- **Queue Item ID:** ${receipt.queue_item_id}
- **Capture Timestamp:** ${receipt.capture_timestamp}
- **Intake Timestamp:** ${receipt.intake_timestamp}
- **Integrity Hash:** \`${receipt.source_integrity_hash}\`

## Request
**Summary:** ${receipt.request_summary}

## Risk Assessment
- **Classification:** ${receipt.risk.classification}
- **Approval Required:** ${receipt.risk.approval_required}
- **Reason:** ${receipt.risk.reason}

## Execution State
- **Status:** ${receipt.execution.status}
- **Attempted:** ${receipt.execution.execution_attempted}
- **Approved:** ${receipt.execution.approval_granted}

---
*This is a read-only intake artifact. No local execution has occurred.*
`;

  fs.writeFileSync(mdPath, mdContent);

  console.log(`\n✅ Intake Receipt Generated:`);
  console.log(`- JSON: ${jsonPath}`);
  console.log(`- MD: ${mdPath}`);
  console.log('\nVerification: No execution transitions were triggered. This script is a read-only adapter.');
}

runIntakeReceiptGenerator().catch(console.error);
