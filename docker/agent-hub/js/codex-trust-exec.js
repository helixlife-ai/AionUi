#!/usr/bin/env node
/**
 * Run Codex with its cwd pre-trusted in ~/.codex/config.toml.
 *
 * trust-codex-projects.js (see docker-compose.yaml) only sweeps
 * /data/conversations on an interval (container start + every
 * ACP_IDLE_ANCHOR_CLEAR_INTERVAL_SEC). A brand-new conversation's
 * codex-temp-<id> directory does not exist at container start and the CLI
 * may already be spawned before the next sweep tick, so the very first turn
 * shows Codex's "Project-local config, hooks, and exec policies are
 * disabled ... until the project is trusted" warning in the UI. Marking the
 * exact cwd trusted synchronously, right before exec, closes that race.
 *
 * Usage: node codex-trust-exec.js <real-codex-bin> [args...]
 */
const fs = require('fs');
const { spawn } = require('child_process');

const real = process.argv[2];
if (!real) {
  console.error('[agent-hub] codex-trust-exec: missing real binary path');
  process.exit(127);
}

const configPath = process.env.CODEX_HOME ? `${process.env.CODEX_HOME}/config.toml` : '/root/.codex/config.toml';

try {
  const projectPath = process.cwd();
  const key = `[projects."${projectPath}"]`;
  const cfg = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  if (!cfg.includes(key)) {
    fs.writeFileSync(configPath, `${cfg}\n${key}\ntrust_level = "trusted"\n`);
  }
} catch (err) {
  console.error(`[agent-hub] codex-trust-exec: failed to pre-trust cwd: ${err.message}`);
}

const child = spawn(real, process.argv.slice(3), { stdio: 'inherit' });
child.on('error', (err) => {
  console.error(`[agent-hub] failed to spawn Codex: ${err.message}`);
  process.exit(127);
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
