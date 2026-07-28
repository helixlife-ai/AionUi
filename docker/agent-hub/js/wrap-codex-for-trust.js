#!/usr/bin/env node
/**
 * Install a trust-marking wrapper over the Codex CLI.
 *
 * aioncore detects Codex via PATH lookup (`command -v codex`) and spawns it
 * directly (see Dockerfile: "codex is a JS entry point ... aioncore detects
 * the CLIs on PATH"). Replace that PATH entry with a wrapper that runs
 * codex-trust-exec.js first, so the exact conversation cwd is trusted
 * before Codex reads config.toml — see codex-trust-exec.js for why the
 * periodic sweep in trust-codex-projects.js alone is not enough.
 */
const fs = require('fs');
const { execSync } = require('child_process');

const EXEC_SRC = '/etc/agent-hub/js/codex-trust-exec.js';
const MARKER = 'codex-trust-exec.js';

function alreadyWrapped(filePath) {
  try {
    const head = fs.readFileSync(filePath, { encoding: 'utf8' }).slice(0, 400);
    return head.includes(MARKER);
  } catch {
    return false;
  }
}

function writeWrapper(launchPath, realBin) {
  const script = `#!/bin/sh
# Agent Hub Codex trust wrapper (see ${MARKER})
exec node "${EXEC_SRC}" "${realBin}" "$@"
`;
  fs.writeFileSync(launchPath, script, { mode: 0o755 });
  try {
    fs.chmodSync(launchPath, 0o755);
  } catch {
    // ignore
  }
}

if (!fs.existsSync(EXEC_SRC)) {
  console.error(`[agent-hub] missing ${EXEC_SRC}; skip Codex trust wrap`);
  process.exit(0);
}

let which = '';
try {
  which = execSync('command -v codex', { encoding: 'utf8' }).trim();
} catch {
  // not on PATH
}

if (!which) {
  console.log('[agent-hub] codex not on PATH; skip Codex trust wrap');
  process.exit(0);
}

if (alreadyWrapped(which)) {
  console.log(`[agent-hub] Codex trust wrap: ${which}: already`);
  process.exit(0);
}

// `which` must itself be a symlink (the normal npm -g global-bin shim
// layout: /usr/.../bin/codex -> ../lib/node_modules/@openai/codex/bin/*).
// realpathSync() also resolves symlinked *parent directories* (e.g. macOS
// /var -> /private/var), so comparing resolved-path strings is not a
// reliable way to detect "not a symlink" — use lstat instead. If `which`
// is a plain file, overwriting it in place would leave no distinct real
// binary to exec, so the wrapper would call itself forever — refuse.
if (!fs.lstatSync(which).isSymbolicLink()) {
  console.error(`[agent-hub] Codex trust wrap: ${which} is not a symlink to a distinct binary; skip to avoid self-exec`);
  process.exit(0);
}

let realBin = which;
try {
  realBin = fs.realpathSync(which);
} catch {
  // keep which
}

try {
  fs.unlinkSync(which);
} catch {
  // may be a regular file we can overwrite in place
}
writeWrapper(which, realBin);
console.log(`[agent-hub] Codex trust wrap: ${which}: wrapped-path (real=${realBin})`);
