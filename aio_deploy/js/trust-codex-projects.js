// Mark Agent Hub conversation workspaces as Codex-trusted.
// Without this, Codex prints stderr that the WebUI surfaces as orange tips
// about untrusted projects, and old chats under /data/conversations/.../codex-temp-<id>
// can hang on resume.
const fs = require('fs');
const path = require('path');

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

const extras = walk('/data/conversations', [], 0);
let cfg = fs.readFileSync(configPath, 'utf8');
let added = 0;
for (const projectPath of [...roots, ...extras]) {
  const key = `[projects."${projectPath}"]`;
  if (cfg.includes(key)) continue;
  cfg += `\n${key}\ntrust_level = "trusted"\n`;
  added += 1;
}
if (added > 0) {
  fs.writeFileSync(configPath, cfg);
}
console.log(`[agent-hub] trusted codex projects: total=${roots.length + extras.length} added=${added}`);
