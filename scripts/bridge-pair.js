#!/usr/bin/env node
/**
 * bridge-pair.js — CLI tool to generate extension pairing config.
 *
 * AB-5b / AB-6: Creates a bridge-config.json file with a paired client
 * identity for the Chrome extension.
 *
 * Usage:
 *   node scripts/bridge-pair.js [--output <path>] [--client-id <name>]
 *
 * The output path defaults to server/bridge-config.json (alongside queue).
 * The extension uses this config to sign its requests.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const OUTPUT_PATH = outputIndex !== -1 && args[outputIndex + 1]
  ? resolve(args[outputIndex + 1])
  : resolve(import.meta.dirname ?? '.', '..', 'server', 'bridge-config.json');

const clientIdIndex = args.indexOf('--client-id');
const CLIENT_ID = clientIdIndex !== -1 && args[clientIdIndex + 1]
  ? args[clientIdIndex + 1]
  : `chrome-extension-${Date.now()}`;

// Generate config
const secret = randomBytes(32).toString('hex');
const config = {
  clientId: CLIENT_ID,
  clientSecret: secret,
  pairedAt: new Date().toISOString(),
  label: 'Chrome Extension',
};

// Write to file
const dir = dirname(OUTPUT_PATH);
if (!existsSync(dir)) {
  await mkdir(dir, { recursive: true });
}
await writeFile(OUTPUT_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  Extension Pairing Config Generated                        ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`\n  Output:   ${OUTPUT_PATH}`);
console.log(`  Client ID: ${config.clientId}`);
console.log(`  Secret:    ${secret.slice(0, 16)}...${secret.slice(-8)}`);
console.log(`  Paired at: ${config.pairedAt}`);
console.log(`\n  To verify an extension request:\n`);
console.log(`    curl -s http://127.0.0.1:3457/api/status \\`);
console.log(`      -H "X-Signed-Request: $(node -e '`);
console.log(`        const c=require("crypto");`);
console.log(`        const ts=new Date().toISOString();`);
console.log(`        const nonce=c.randomUUID();`);
console.log(`        const sig=c.createHmac("sha256","${secret}")`);
console.log(`          .update(["GET","/api/status",ts,nonce,""].join("\\\\n"))`);
console.log(`          .digest("hex");`);
console.log(`        process.stdout.write(JSON.stringify({`);
console.log(`          clientId:"${config.clientId}",`);
console.log(`          timestamp:ts,nonce,signature:sig`);
console.log(`        }))`);
console.log(`      ')"\n`);
