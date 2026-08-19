#!/usr/bin/env node
/**
 * Clean up stale builtin-skill state when AIONUI_BUILTIN_SKILLS_PATH redirects
 * the builtin corpus (Agent Hub points it at {dataDir}/builtin-skills-hub).
 *
 * Two kinds of leftovers on devices that ran other configurations:
 *   1. the official corpus tree materialized at {dataDir}/builtin-skills/
 *      (materialization is skipped under the redirect, so it never refreshes)
 *   2. skills-table rows with source='builtin' whose skill no longer exists
 *      in the current hub — the startup catalog sync only upserts, never
 *      deletes (covers both the replaced official 21 and skills dropped
 *      from the OpenClaw bundle)
 *
 * Idempotent: no-op when the redirect is unset or nothing is stale.
 *
 * Env:
 *   AIONUI_DATA_DIR             DB dir (default /data)
 *   AIONUI_BUILTIN_SKILLS_PATH  override/hub dir (unset → no-op)
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.AIONUI_DATA_DIR || '/data';
const hubDir = (process.env.AIONUI_BUILTIN_SKILLS_PATH || '').trim();
const legacyTree = path.join(dataDir, 'builtin-skills');

if (!hubDir || hubDir === legacyTree) {
  process.exit(0);
}

// 1. Drop the stale official tree (aioncore-managed; nothing reads it under
//    the redirect).
if (fs.existsSync(legacyTree)) {
  try {
    fs.rmSync(legacyTree, { recursive: true, force: true });
    console.log(`[agent-hub] removed stale builtin-skills tree: ${legacyTree}`);
  } catch (err) {
    console.log(`[agent-hub] warn: failed to remove ${legacyTree}: ${err.message}`);
  }
}

// 2. Delete builtin rows whose name is absent from the current hub scan.
const dbPath = path.join(dataDir, 'aionui-backend.db');
if (!fs.existsSync(dbPath) || !fs.existsSync(hubDir)) {
  process.exit(0);
}

// Frontmatter `name` is what lands in the skills table; it may differ from
// the directory name (e.g. dir `excel` vs name `spreadsheet-ops`). Fall back
// to the dir name when the frontmatter has no name.
function skillName(dirEntry) {
  try {
    const head = fs.readFileSync(path.join(hubDir, dirEntry, 'SKILL.md'), 'utf8').slice(0, 4096);
    const match = head.match(/^name:\s*"?([^"\r\n]+)"?\s*$/m);
    if (match && match[1].trim()) return match[1].trim();
  } catch {
    // unreadable SKILL.md — fall back to dir name
  }
  return dirEntry;
}

const currentNames = new Set();
for (const entry of fs.readdirSync(hubDir, { withFileTypes: true })) {
  if (entry.name === 'auto-inject') {
    const autoDir = path.join(hubDir, 'auto-inject');
    for (const sub of fs.readdirSync(autoDir)) {
      currentNames.add(skillName(path.join('auto-inject', sub)));
    }
    continue;
  }
  currentNames.add(skillName(entry.name));
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000');

try {
  const table = db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='skills'`).get();
  if (table) {
    const rows = db.prepare(`SELECT id, name FROM skills WHERE source = 'builtin'`).all();
    const stale = rows.filter((r) => !currentNames.has(r.name));
    const del = db.prepare(`DELETE FROM skills WHERE id = ?`);
    for (const row of stale) {
      del.run(row.id);
    }
    console.log(`[agent-hub] cleaned stale builtin skill rows: ${stale.length}`);
  }
} finally {
  db.close();
}
