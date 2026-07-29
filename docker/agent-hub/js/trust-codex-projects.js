// Mark Agent Hub conversation workspaces as Codex-trusted.
// Without this, Codex prints stderr that the WebUI surfaces as orange tips
// about untrusted projects, and old chats under /data/conversations/.../codex-temp-<id>
// can hang on resume.
const fs = require('fs');
const path = require('path');
const { ensureTrustedProjects } = require('./codex-trust-shared.js');

const configPath = process.argv[2] || '/root/.codex/config.toml';
const roots = ['/data', '/data/conversations', '/agent_hub'];

function walk(dir, acc, depth) {
  if (depth > 6) return acc;
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of ents) {
    if (!ent.isDirectory()) continue;
    const full = path.join(dir, ent.name);
    if (/^(codex|claude)-temp-/.test(ent.name)) {
      acc.push(full);
    }
    walk(full, acc, depth + 1);
  }
  return acc;
}

if (!fs.existsSync(configPath)) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, '');
}

const extras = walk('/data/conversations', [], 0);
const all = [...roots, ...extras];
const added = ensureTrustedProjects(configPath, all);
console.log(`[agent-hub] trusted codex projects: total=${all.length} added=${added}`);
