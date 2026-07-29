#!/usr/bin/env node
/**
 * Seed Claude Code settings so common unattended tools do not block appliance
 * cron / conversation runs under acceptEdits.
 *
 * On the 一体机 the container runs as root. Claude refuses
 * `--dangerously-skip-permissions`, so wrap-claude-for-root.js rewrites YOLO
 * to `--permission-mode acceptEdits`. That mode auto-accepts file edits but
 * still prompts for network tools and Bash — cron then hangs on Allow /
 * Allow Always.
 *
 * Merge allow rules (+ PreToolUse / PermissionRequest auto-allow hooks) into
 * ~/.claude/settings.json without wiping unrelated user settings.
 *
 * Hook JSON must match current Claude Code schemas:
 * - PreToolUse → hookSpecificOutput.permissionDecision = allow
 * - PermissionRequest → hookSpecificOutput.decision.behavior = allow
 *   (needed to override ask rules / stubborn WebSearch prompts)
 *
 * Usage: node seed-claude-web-permissions.js [/root/.claude/settings.json]
 */
const fs = require('fs');
const path = require('path');

const settingsPath =
  process.argv[2] ||
  (process.env.CLAUDE_CONFIG_DIR
    ? path.join(process.env.CLAUDE_CONFIG_DIR, 'settings.json')
    : '/root/.claude/settings.json');

/** Tools that still prompt under acceptEdits but are required for Hub cron. */
const UNATTENDED_ALLOW = ['WebSearch', 'WebFetch', 'Bash'];
const UNATTENDED_MATCHER = 'Bash|WebFetch|WebSearch';
const LEGACY_MATCHERS = new Set(['WebFetch|WebSearch', 'WebSearch|WebFetch', UNATTENDED_MATCHER]);

// Modern Claude Code hook payloads (legacy `{"decision":"allow"}` is unreliable).
const PRE_TOOL_ALLOW_HOOK = {
  type: 'command',
  command:
    "printf '%s\\n' '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\"}}'",
  timeout: 5,
};
const PERMISSION_REQUEST_ALLOW_HOOK = {
  type: 'command',
  command:
    "printf '%s\\n' '{\"hookSpecificOutput\":{\"hookEventName\":\"PermissionRequest\",\"decision\":{\"behavior\":\"allow\"}}}'",
  timeout: 5,
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[agent-hub] seed-claude-web-permissions: invalid JSON ${filePath}: ${err.message}`);
    return {};
  }
}

function hookCommand(entry) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) return '';
  const first = entry.hooks[0];
  return first && typeof first === 'object' ? String(first.command || '') : '';
}

function isLegacyOrPartialAllowHook(entry) {
  const cmd = hookCommand(entry);
  if (!cmd) return false;
  return (
    cmd.includes('"decision":"allow"') ||
    cmd.includes('permissionDecision') ||
    cmd.includes('"behavior":"allow"')
  );
}

function ensureUnattendedAllow(cfg) {
  const permissions = cfg.permissions && typeof cfg.permissions === 'object' ? { ...cfg.permissions } : {};
  const allow = Array.isArray(permissions.allow) ? [...permissions.allow] : [];
  let changed = false;
  for (const rule of UNATTENDED_ALLOW) {
    if (!allow.includes(rule)) {
      allow.push(rule);
      changed = true;
    }
  }
  permissions.allow = allow;
  cfg.permissions = permissions;
  return changed;
}

function ensureEventHooks(cfg, event, desiredHook) {
  const hooks = cfg.hooks && typeof cfg.hooks === 'object' ? { ...cfg.hooks } : {};
  const list = Array.isArray(hooks[event]) ? [...hooks[event]] : [];
  let changed = false;

  // Drop legacy / partial auto-allow entries for these tools so we replace with
  // the current schema instead of stacking duplicate matchers.
  const kept = [];
  for (const entry of list) {
    const matcher = String((entry && entry.matcher) || '');
    if (LEGACY_MATCHERS.has(matcher) && isLegacyOrPartialAllowHook(entry)) {
      changed = true;
      continue;
    }
    kept.push(entry);
  }

  const desiredCmd = String(desiredHook.command || '');
  const already = kept.some(
    (entry) =>
      String((entry && entry.matcher) || '') === UNATTENDED_MATCHER && hookCommand(entry) === desiredCmd
  );
  if (!already) {
    kept.push({ matcher: UNATTENDED_MATCHER, hooks: [desiredHook] });
    changed = true;
  }

  hooks[event] = kept;
  cfg.hooks = hooks;
  return changed;
}

try {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const cfg = readJson(settingsPath);
  const allowChanged = ensureUnattendedAllow(cfg);
  const preChanged = ensureEventHooks(cfg, 'PreToolUse', PRE_TOOL_ALLOW_HOOK);
  const permChanged = ensureEventHooks(cfg, 'PermissionRequest', PERMISSION_REQUEST_ALLOW_HOOK);
  if (allowChanged || preChanged || permChanged) {
    fs.writeFileSync(settingsPath, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o644 });
    console.log(`[agent-hub] seeded Claude unattended permissions (web+Bash): ${settingsPath}`);
  } else {
    console.log(`[agent-hub] Claude unattended permissions already present: ${settingsPath}`);
  }
} catch (err) {
  console.error(`[agent-hub] seed-claude-web-permissions failed: ${err.message}`);
  process.exit(0);
}
