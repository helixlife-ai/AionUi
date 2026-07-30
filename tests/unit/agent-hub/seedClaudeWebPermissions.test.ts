import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(process.cwd(), 'docker/agent-hub/js/seed-claude-web-permissions.js');

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function runSeed(settingsPath: string): void {
  execFileSync(process.execPath, [SCRIPT, settingsPath], { encoding: 'utf8' });
}

describe('seed-claude-web-permissions', () => {
  it('adds Write and Edit to permissions.allow and PreToolUse matcher', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-claude-'));
    tempDirs.push(dir);
    const settingsPath = path.join(dir, 'settings.json');
    fs.writeFileSync(settingsPath, '{}\n');

    runSeed(settingsPath);

    const cfg = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      permissions?: { allow?: string[] };
      hooks?: { PreToolUse?: Array<{ matcher?: string }> };
    };
    expect(cfg.permissions?.allow).toEqual(expect.arrayContaining(['WebSearch', 'WebFetch', 'Bash', 'Write', 'Edit']));
    const matcher = cfg.hooks?.PreToolUse?.find((entry) => String(entry.matcher || '').includes('Write'))?.matcher;
    expect(matcher).toBe('Bash|WebFetch|WebSearch|Write|Edit');
  });

  it('replaces legacy Bash|WebFetch|WebSearch matcher instead of stacking', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-claude-'));
    tempDirs.push(dir);
    const settingsPath = path.join(dir, 'settings.json');
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify(
        {
          permissions: { allow: ['Bash', 'WebFetch', 'WebSearch'] },
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash|WebFetch|WebSearch',
                hooks: [
                  {
                    type: 'command',
                    command:
                      'printf \'%s\\n\' \'{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}\'',
                  },
                ],
              },
            ],
          },
        },
        null,
        2
      )}\n`
    );

    runSeed(settingsPath);

    const cfg = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      permissions?: { allow?: string[] };
      hooks?: { PreToolUse?: Array<{ matcher?: string }> };
    };
    expect(cfg.permissions?.allow).toEqual(expect.arrayContaining(['Write', 'Edit']));
    const matchers = (cfg.hooks?.PreToolUse || []).map((entry) => entry.matcher);
    expect(matchers).toContain('Bash|WebFetch|WebSearch|Write|Edit');
    expect(matchers).not.toContain('Bash|WebFetch|WebSearch');
  });
});
