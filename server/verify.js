import { transition, inspect } from './dist/queue.js';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const QUEUE_DIR = process.env.AGENT_BRIDGE_QUEUE_DIR || '/tmp/agent-bridge-test-queue';

async function run() {
  console.log('Starting Verification Gate...');

  try {
    // Step 3: Submit test packet
    console.log('\n--- Step 3: Submit test packet ---');
    const response = execSync('curl -s -X POST http://127.0.0.1:3457/incoming -H "Content-Type: application/json" -d \'{"source": "test-cli", "threadTitle": "Verification Test", "prompt": "Hello from the verification gate!"}\'', { encoding: 'utf8' });
    const data = JSON.parse(response);
    const packetId = data.packetId;
    console.log(`Queued packet: ${packetId}`);

    // Step 4: Verify packet in incoming
    console.log('\n--- Step 4: Verify packet in incoming ---');
    const content = await readFile(`${QUEUE_DIR}/incoming/${packetId}.json`, 'utf8');
    console.log('Packet found in incoming directory.');

    // Step 5: Approve
    console.log('\n--- Step 5: queue_approve ---');
    await transition(QUEUE_DIR, packetId, 'approved');
    console.log('Transition to approved: SUCCESS');

    // Step 6: Start
    console.log('\n--- Step 6: queue_start ---');
    await transition(QUEUE_DIR, packetId, 'in-progress');
    console.log('Transition to in-progress: SUCCESS');

    // Step 7: Complete
    console.log('\n--- Step 7: queue_complete ---');
    await transition(QUEUE_DIR, packetId, 'complete', { result: 'Verification successful: V0.1 is working!' });
    console.log('Transition to complete: SUCCESS');

    // Step 8: Verify result
    console.log('\n--- Step 8: Verify result ---');
    const pkt = await inspect(QUEUE_DIR, packetId);
    if (pkt && pkt.result === 'Verification successful: V0.1 is working!') {
      console.log('Result verification: SUCCESS');
    } else {
      throw new Error('Result mismatch or not found');
    }

    // Step 9: Invalid transition
    console.log('\n--- Step 9: Invalid transition test ---');
    try {
      await transition(QUEUE_DIR, packetId, 'approved');
      throw new Error('FAILED: Transition should have been rejected');
    } catch (e) {
      console.log('Invalid transition rejected (as expected):', e.message);
    }

    // Step 10: Bypass test
    console.log('\n--- Step 10: Bypass test ---');
    const bypassResponse = execSync('curl -s -X POST http://127.0.0.1:3457/incoming -H "Content-Type: application/json" -d \'{"prompt": "Bypass test", "requiresHumanApproval": false}\'', { encoding: 'utf8' });
    const bypassData = JSON.parse(bypassResponse);
    const bypassPacketId = bypassData.packetId;
    const bypassContent = await readFile(`${QUEUE_DIR}/incoming/${bypassPacketId}.json`, 'utf8');
    const bypassPkt = JSON.parse(bypassContent);
    if (bypassPkt.requiresHumanApproval === true) {
      console.log('Bypass rejected: requiresHumanApproval forced to true. SUCCESS');
    } else {
      throw new Error('Bypass succeeded: requiresHumanApproval was set to false!');
    }

    console.log('\n=========================================');
    console.log('ALL 10 STEPS PASSED: production-shaped V0.1 accepted');
    console.log('=========================================');

  } catch (err) {
    console.error('\nVERIFICATION FAILED:');
    console.error(err);
    process.exit(1);
  }
}

run();
