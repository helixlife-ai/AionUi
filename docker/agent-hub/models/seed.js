#!/usr/bin/env node
// Run only at container startup. A conversation switch must never rewrite these shared files.
const fs = require('node:fs');
const path = require('node:path');
const { claudeModelPicker, codexModelCatalog } = require('./catalog');

const claudePath = process.argv[2] || path.join(process.env.CLAUDE_CONFIG_DIR || '/root/.claude', 'settings.json');
const codexPath = process.argv[3] || '/root/.codex/model-catalog.json';
const templatePath = process.argv[4] || '/etc/agent-hub/codex-model-catalog.json';

// Parse every input first: malformed user settings must fail startup, not be silently replaced.
const claude = fs.existsSync(claudePath) ? JSON.parse(fs.readFileSync(claudePath, 'utf8')) : {};
if (!claude || typeof claude !== 'object' || Array.isArray(claude)) throw new Error('Invalid Claude settings');
const catalog = codexModelCatalog(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
claude.modelPicker = claudeModelPicker();
for (const [target, content] of [
  [claudePath, claude],
  [codexPath, catalog],
]) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600 });
}
console.log('[agent-hub] Studio model catalogs configured');
