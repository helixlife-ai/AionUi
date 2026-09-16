#!/usr/bin/env node
// Build-time only: AionCore prefers its bundled CLI over PATH. Keep both on the pinned version.
const fs = require('node:fs');
const path = require('node:path');

const root = process.argv[2];
const source = process.argv[3];
if (!root || !source || !fs.statSync(source).isFile()) throw new Error('Expected bundle root and pinned Claude binary');
let count = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.isFile() && entry.name === 'claude' && target.includes('/managed-resources/cli/claude/')) {
      fs.copyFileSync(source, target);
      fs.chmodSync(target, 0o755);
      count += 1;
    }
  }
}
walk(root);
if (!count) throw new Error('Bundled Claude entry not found; check the AionCore bundle layout');
console.log(`[agent-hub] pinned ${count} bundled Claude entrypoints`);
