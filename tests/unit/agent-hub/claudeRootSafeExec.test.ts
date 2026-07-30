import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildClaudeLaunch } = require(path.resolve(process.cwd(), 'docker/agent-hub/js/claude-root-safe-exec.js')) as {
  buildClaudeLaunch: (
    incoming: string[],
    opts?: { isRoot?: boolean; env?: NodeJS.ProcessEnv }
  ) => { argv: string[]; env: NodeJS.ProcessEnv };
};

describe('claude-root-safe-exec buildClaudeLaunch', () => {
  it('keeps full-auto as root by setting IS_SANDBOX and YOLO flags', () => {
    const { argv, env } = buildClaudeLaunch(['--dangerously-skip-permissions', '--print', 'hi'], {
      isRoot: true,
      env: { PATH: '/usr/bin' },
    });
    expect(env.IS_SANDBOX).toBe('1');
    expect(argv).toEqual(['--dangerously-skip-permissions', '--permission-mode', 'bypassPermissions', '--print', 'hi']);
  });

  it('passes bypassPermissions mode through as root with IS_SANDBOX', () => {
    const { argv, env } = buildClaudeLaunch(['--permission-mode', 'bypassPermissions', 'acp'], {
      isRoot: true,
      env: {},
    });
    expect(env.IS_SANDBOX).toBe('1');
    expect(argv).toEqual(['--permission-mode', 'bypassPermissions', 'acp']);
  });

  it('does not force IS_SANDBOX for non-yolo modes as root', () => {
    const { argv, env } = buildClaudeLaunch(['--permission-mode', 'acceptEdits'], {
      isRoot: true,
      env: { PATH: '/bin' },
    });
    expect(env.IS_SANDBOX).toBeUndefined();
    expect(argv).toEqual(['--permission-mode', 'acceptEdits']);
  });

  it('passes YOLO through unchanged when not root', () => {
    const { argv, env } = buildClaudeLaunch(['--dangerously-skip-permissions', 'x'], {
      isRoot: false,
      env: {},
    });
    expect(env.IS_SANDBOX).toBeUndefined();
    expect(argv).toEqual(['--dangerously-skip-permissions', 'x']);
  });
});
