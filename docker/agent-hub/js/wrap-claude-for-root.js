#!/usr/bin/env node
/**
 * Install root-safe wrappers over Claude Code binaries.
 *
 * aioncore spawns the bundled managed CLI by absolute path; PATH `claude`
 * may also be used for detection. Both need the same argv rewrite when the
 * container runs as root (see docker-compose user: "0").
 *
 * For npm/global installs (symlinks into node_modules), do not rename the
 * package binary — replace the symlink with a wrapper that points at it.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXEC_SRC = '/etc/agent-hub/js/claude-root-safe-exec.js';
const MARKER = 'claude-root-safe-exec.js';

function listCandidates() {
  /** @type {{ launchPath: string, realBin: string, rename: boolean }[]} */
  const out = [];
  const seen = new Set();

  const add = (launchPath, realBin, rename) => {
    const key = `${launchPath}|${realBin}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ launchPath, realBin, rename });
  };

  try {
    const which = execSync('command -v claude', { encoding: 'utf8' }).trim();
    if (which) {
      let realBin = which;
      try {
        realBin = fs.realpathSync(which);
      } catch {
        // keep which
      }
      // If PATH is already our wrapper, parse the embedded real binary path.
      if (alreadyWrapped(which)) {
        try {
          const body = fs.readFileSync(which, 'utf8');
          const m = body.match(/claude-root-safe-exec\.js"\s+"([^"]+)"/);
          if (m && m[1]) realBin = m[1];
        } catch {
          // keep realBin
        }
      }
      // Replace the PATH entry (often a symlink); keep package binary intact.
      add(which, realBin, false);
      // aioncore may spawn the package binary by absolute path (claude.exe),
      // bypassing PATH — wrap that file in place too.
      const base = path.basename(realBin);
      if ((base === 'claude.exe' || base === 'claude') && realBin !== which) {
        add(realBin, `${realBin}.real`, true);
      }
    }
  } catch {
    // not on PATH
  }

  // Always probe the npm global binary — aioncore often uses this absolute path.
  const npmClaude = '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe';
  if (fs.existsSync(npmClaude) && !alreadyWrapped(npmClaude)) {
    add(npmClaude, `${npmClaude}.real`, true);
  }

  const roots = ['/app/aionui-web/bundled-aioncore', '/app/bundled-aioncore'];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const walk = (dir, depth) => {
      if (depth > 8) return;
      let ents;
      try {
        ents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of ents) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full, depth + 1);
          continue;
        }
        if (ent.isFile() && ent.name === 'claude') {
          // Bundled managed CLI: rename aside and wrap in place.
          add(full, `${full}.real`, true);
        }
      }
    };
    walk(root, 0);
  }
  return out;
}

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
# Agent Hub root-safe Claude launcher (see ${MARKER})
exec node "${EXEC_SRC}" "${realBin}" "$@"
`;
  fs.writeFileSync(launchPath, script, { mode: 0o755 });
  try {
    fs.chmodSync(launchPath, 0o755);
  } catch {
    // ignore
  }
}

function retargetPathWrapperIfNeeded(oldReal, newReal) {
  try {
    const which = execSync('command -v claude', { encoding: 'utf8' }).trim();
    if (!which || !alreadyWrapped(which)) return;
    const body = fs.readFileSync(which, 'utf8');
    if (!body.includes(`"${oldReal}"`)) return;
    writeWrapper(which, newReal);
  } catch {
    // ignore
  }
}

function wrapOne({ launchPath, realBin, rename }) {
  if (alreadyWrapped(launchPath)) return 'already';

  if (rename) {
    const managedBin = launchPath;
    const aside = realBin; // launchPath.real
    if (!fs.existsSync(aside)) {
      if (!fs.existsSync(managedBin)) return 'missing';
      fs.renameSync(managedBin, aside);
    } else if (fs.existsSync(managedBin) && !alreadyWrapped(managedBin)) {
      try {
        fs.unlinkSync(managedBin);
      } catch {
        // continue
      }
    }
    if (!fs.existsSync(aside)) return 'missing-real';
    writeWrapper(managedBin, aside);
    // PATH wrapper may still point at the pre-rename absolute path.
    retargetPathWrapperIfNeeded(managedBin, aside);
    return 'wrapped-managed';
  }

  // PATH / symlink case: replace launchPath with wrapper; realBin stays put.
  if (!fs.existsSync(realBin)) return 'missing-real';
  try {
    fs.unlinkSync(launchPath);
  } catch {
    // may be a regular file we can overwrite
  }
  writeWrapper(launchPath, realBin);
  return 'wrapped-path';
}

if (!fs.existsSync(EXEC_SRC)) {
  console.error(`[agent-hub] missing ${EXEC_SRC}; skip Claude root-safe wrap`);
  process.exit(0);
}

const targets = listCandidates();
if (targets.length === 0) {
  console.log('[agent-hub] no Claude binaries found to wrap');
  process.exit(0);
}

const summary = targets.map((t) => `${t.launchPath}: ${wrapOne(t)}`);
console.log(`[agent-hub] Claude root-safe wrap: ${summary.join('; ')}`);
