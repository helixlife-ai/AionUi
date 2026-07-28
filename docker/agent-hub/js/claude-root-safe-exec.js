#!/usr/bin/env node
/**
 * Run Claude Code with root-safe argv.
 *
 * Claude refuses `--dangerously-skip-permissions` when uid=0 (exit 1), which
 * Agent Hub surfaces as USER_AGENT_DISCONNECTED. aioncore maps acceptEdits to
 * that flag; as root we rewrite it to `--permission-mode acceptEdits`.
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
const out = [];
let stripped = false;
let hasMode = false;

for (let i = 0; i < incoming.length; i += 1) {
  const arg = incoming[i];
  if (arg === '--dangerously-skip-permissions' || arg === '--allow-dangerously-skip-permissions') {
    stripped = true;
    continue;
  }
  if (arg === '--permission-mode') {
    hasMode = true;
    out.push(arg);
    if (i + 1 < incoming.length) {
      i += 1;
      out.push(incoming[i]);
    }
    continue;
  }
  out.push(arg);
}

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
if (isRoot && stripped && !hasMode) {
  out.unshift('acceptEdits');
  out.unshift('--permission-mode');
}

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
