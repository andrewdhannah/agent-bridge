const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QUEUE_DIR = '/tmp/ab-verify-queue'; // Using the same test dir from AB-1
const INCOMING_DIR = path.join(QUEUE_DIR, 'incoming');
const OUTPUT_DIR = path.join('/Users/andrew/Desktop/OpenWork/agent-bridge/docs/reports/agent-bridge/ab3-prototypes');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function calculateHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function classifyRisk(prompt) {
  const destructiveKeywords = ['delete', 'rm', 'format', 'drop', 'overwrite', 'erase'];
  const isDestructive = destructiveKeywords.some(k => prompt.toLowerCase().includes(k));
  
  return {
    riskLevel: isDestructive ? 'High (Risk 4)' : 'Low (Risk 1)',
    approvalRequirement: isDestructive ? 'Explicit Owner Approval Required' : 'Standard Human Approval',
  };
}

async function runIntakePrototype() {
  console.log('--- AB-3 Controlled Intake Prototype ---');

  // 1. Find a sample queue item
  if (!fs.existsSync(INCOMING_DIR)) {
    console.error('Error: Incoming queue directory not found. Please run agent-bridge server and submit a prompt first.');
    process.exit(1);
  }

  const files = fs.readdirSync(INCOMING_DIR);
  if (files.length === 0) {
    console.error('Error: No incoming packets found. Please submit a prompt via the extension or curl.');
    process.exit(1);
  }

  const packetFile = files[0];
  const packetPath = path.join(INCOMING_DIR, packetFile);
  const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));

  console.log(`Processing packet: ${packet.packetId}`);

  // 2. Generate Intake Artifact / Receipt
  const promptHash = calculateHash(packet.prompt);
  const risk = classifyRisk(packet.prompt);

  const receipt = {
    receiptId: `receipt-${Date.now()}`,
    source: 'agent-bridge queue item',
    queueItemId: packet.packetId,
    captureTimestamp: packet.capturedAt,
    requestSummary: packet.prompt.substring(0, 100) + (packet.prompt.length > 100 ? '...' : ''),
    integrityHash: promptHash,
    provenance: {
      sourceThread: packet.threadTitle,
      sourceTool: packet.source,
    },
    riskClassification: risk,
    executionStatus: 'not executed',
    nextAllowedAction: 'human review only',
    timestamp: new Date().toISOString(),
  };

  const receiptPath = path.join(OUTPUT_DIR, `${packet.packetId}-intake-receipt.json`);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

  console.log(`\n✅ Intake Receipt Generated: ${receiptPath}`);
  console.log('\n--- RECEIPT CONTENT ---');
  console.log(JSON.stringify(receipt, null, 2));
  console.log('-----------------------\n');
  console.log('Verification: No execution transitions were triggered.');
}

runIntakePrototype().catch(console.error);
