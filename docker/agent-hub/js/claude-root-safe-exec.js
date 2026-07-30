#!/usr/bin/env node
/**
 * Run Claude Code with root-safe argv.
 *
 * Claude refuses `--dangerously-skip-permissions` when uid=0 (exit 1), which
 * Agent Hub surfaces as USER_AGENT_DISCONNECTED. aioncore maps acceptEdits /
 * bypassPermissions to that flag; as root we rewrite to
 * `--permission-mode acceptEdits`.
 *
 * Usage: node claude-root-safe-exec.js <real-claude-bin> [args...]
 */
const { spawn } = require('child_process');

const real = process.argv[2];
if (!real) {
  console.error('[agent-hub] claude-root-safe-exec: missing real binary path');
  process.exit(127);
}

const incoming = process.argv.slice(3);
const passthrough = [];
let hadYolo = false;
let modeValue = '';

for (let i = 0; i < incoming.length; i += 1) {
  const arg = incoming[i];
  if (arg === '--dangerously-skip-permissions' || arg === '--allow-dangerously-skip-permissions') {
    hadYolo = true;
    continue;
  }
  if (arg === '--permission-mode') {
    if (i + 1 < incoming.length) {
      i += 1;
      modeValue = String(incoming[i] || '');
    }
    continue;
  }
  passthrough.push(arg);
}

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const out = [];

if (isRoot) {
  // Root cannot use YOLO / bypassPermissions — demote to acceptEdits.
  let safeMode = modeValue;
  if (hadYolo || safeMode === 'bypassPermissions') {
    safeMode = 'acceptEdits';
  }
  if (safeMode) {
    out.push('--permission-mode', safeMode);
  }
} else {
  if (hadYolo) out.push('--dangerously-skip-permissions');
  if (modeValue) out.push('--permission-mode', modeValue);
}

out.push(...passthrough);

const child = spawn(real, out, { stdio: 'inherit' });
child.on('error', (err) => {
  console.error(`[agent-hub] failed to spawn Claude: ${err.message}`);
  process.exit(127);
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
