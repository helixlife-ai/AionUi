#!/usr/bin/env node
/**
 * Run Claude Code with root-safe argv / env.
 *
 * Claude refuses `--dangerously-skip-permissions` when uid=0 (exit 1) unless
 * the process is marked as a sandbox (`IS_SANDBOX=1` or
 * `CLAUDE_CODE_BUBBLEWRAP=1`). Agent Hub containers run as root by design
 * (shared /agent_hub mounts), and aioncore maps UI「全自动」/
 * bypassPermissions (and often acceptEdits) to that YOLO flag — so without
 * the sandbox env, Claude exits and the UI shows USER_AGENT_DISCONNECTED.
 *
 * Strategy: when root + YOLO/bypassPermissions, set IS_SANDBOX=1 and keep
 * true full-auto flags. Isolated appliance containers are the intended
 * escape hatch for this check.
 *
 * Usage: node claude-root-safe-exec.js <real-claude-bin> [args...]
 */
const { spawn } = require('child_process');

/**
 * @param {string[]} incoming
 * @param {{ isRoot?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{ argv: string[], env: NodeJS.ProcessEnv }}
 */
function buildClaudeLaunch(incoming, opts = {}) {
  const isRoot = opts.isRoot ?? (typeof process.getuid === 'function' && process.getuid() === 0);
  const baseEnv = opts.env ? { ...opts.env } : { ...process.env };

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

  const wantsFullAuto = hadYolo || modeValue === 'bypassPermissions';
  const out = [];
  const env = { ...baseEnv };

  if (isRoot && wantsFullAuto) {
    // Undocumented Claude Code escape hatch for root in containers / sandboxes.
    env.IS_SANDBOX = '1';
    if (hadYolo) out.push('--dangerously-skip-permissions');
    if (modeValue) out.push('--permission-mode', modeValue);
    else if (hadYolo) out.push('--permission-mode', 'bypassPermissions');
  } else if (isRoot) {
    // Non-YOLO modes: pass permission-mode through unchanged.
    if (modeValue) out.push('--permission-mode', modeValue);
  } else {
    if (hadYolo) out.push('--dangerously-skip-permissions');
    if (modeValue) out.push('--permission-mode', modeValue);
  }

  out.push(...passthrough);
  return { argv: out, env };
}

function main() {
  const real = process.argv[2];
  if (!real) {
    console.error('[agent-hub] claude-root-safe-exec: missing real binary path');
    process.exit(127);
  }

  const incoming = process.argv.slice(3);
  const { argv, env } = buildClaudeLaunch(incoming);
  const child = spawn(real, argv, { stdio: 'inherit', env });
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
}

module.exports = { buildClaudeLaunch };

if (require.main === module) {
  main();
}
