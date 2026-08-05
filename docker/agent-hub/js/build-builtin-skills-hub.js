#!/usr/bin/env node
/**
 * Build the composite builtin-skills hub consumed via AIONUI_BUILTIN_SKILLS_PATH.
 *
 * Layout produced at {dataDir}/builtin-skills-hub/:
 *   auto-inject/   -> /etc/agent-hub/auto-inject/   (baked into the image;
 *                 system skills: cron/officecli/skill-creator/aionui-config)
 *   <skill>/       -> /opt/openclaw-ws/helixlife-skills/<skill>/  (133 dirs,
 *                 reused from the OpenClaw app's skill bundle, read-only mount)
 *
 * Why symlinks instead of copies: zero data duplication, and OpenClaw skill
 * bundle updates propagate through the links. Note the OpenClaw init container
 * replaces helixlife-skills via rmtree+copytree, so the compose mount targets
 * its PARENT dir; links resolve through the stable parent and stay valid.
 *
 * Only manages symlinks it owns (auto-inject link + links into the source
 * package); any real entry in the hub is left untouched. Links whose source
 * skill vanished from the package are pruned.
 *
 * Idempotent; runs at every container start (before aionui-web) and in the
 * periodic loop. New/removed skills appear in the Skills tab after a backend
 * restart (the builtin catalog syncs at startup); content edits are live.
 *
 * Env:
 *   AIONUI_DATA_DIR        data dir (default /data)
 *   HELIXLIFE_SKILLS_SRC   source skills dir (default /opt/openclaw-ws/helixlife-skills)
 *   AUTO_INJECT_SRC        auto-inject dir baked in image (default /etc/agent-hub/auto-inject)
 */
const fs = require('fs');
const path = require('path');

const dataDir = process.env.AIONUI_DATA_DIR || '/data';
const srcDir = process.env.HELIXLIFE_SKILLS_SRC || '/opt/openclaw-ws/helixlife-skills';
const autoInjectSrc = process.env.AUTO_INJECT_SRC || '/etc/agent-hub/auto-inject';
const hubDir = path.join(dataDir, 'builtin-skills-hub');

function ensureLink(name, target) {
  const dst = path.join(hubDir, name);
  try {
    if (fs.readlinkSync(dst) === target) return false; // already correct
    fs.rmSync(dst, { force: true, recursive: true });
  } catch {
    // not a symlink / missing
    if (fs.existsSync(dst)) return false; // real entry — not ours, leave it
  }
  fs.symlinkSync(target, dst);
  return true;
}

function main() {
  fs.mkdirSync(hubDir, { recursive: true });
  let linked = 0;
  let pruned = 0;

  // 1. auto-inject system skills (must exist or cron/officecli degrade).
  if (fs.existsSync(autoInjectSrc)) {
    if (ensureLink('auto-inject', autoInjectSrc)) linked += 1;
  } else {
    console.log(`[agent-hub] warn: auto-inject source missing: ${autoInjectSrc}`);
  }

  // 2. Skill links from the OpenClaw bundle (skip silently when absent).
  const srcNames = fs.existsSync(srcDir)
    ? new Set(
        fs
          .readdirSync(srcDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && fs.existsSync(path.join(srcDir, e.name, 'SKILL.md')))
          .map((e) => e.name)
      )
    : new Set();

  for (const name of srcNames) {
    if (ensureLink(name, path.join(srcDir, name))) linked += 1;
  }

  // 3. Prune our links whose source skill disappeared from the package.
  for (const entry of fs.readdirSync(hubDir, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;
    const dst = path.join(hubDir, entry.name);
    let target;
    try {
      target = fs.readlinkSync(dst);
    } catch {
      continue;
    }
    if (entry.name === 'auto-inject') continue;
    if (!target.startsWith(srcDir)) continue; // not ours
    if (!srcNames.has(entry.name) || !fs.existsSync(target)) {
      fs.rmSync(dst, { force: true });
      pruned += 1;
    }
  }

  console.log(
    `[agent-hub] builtin-skills hub: ${srcNames.size} skills from openclaw bundle, ` +
      `${linked} linked, ${pruned} pruned`
  );
}

main();
