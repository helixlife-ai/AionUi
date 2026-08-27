import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildClaudeLaunch, configureClaudeTelemetry } = require(
  path.resolve(process.cwd(), 'docker/agent-hub/js/claude-root-safe-exec.js')
) as {
  buildClaudeLaunch: (
    incoming: string[],
    opts?: { isRoot?: boolean; env?: NodeJS.ProcessEnv }
  ) => { argv: string[]; env: NodeJS.ProcessEnv };
  configureClaudeTelemetry: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
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

describe('Claude Code native telemetry launch environment', () => {
  it('stays disabled without an explicit opt-in', () => {
    const env = configureClaudeTelemetry({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' });
    expect(env.CLAUDE_CODE_ENABLE_TELEMETRY).toBeUndefined();
    expect(env.OTEL_TRACES_EXPORTER).toBeUndefined();
  });

  it('stays disabled when the traces endpoint is missing', () => {
    const env = configureClaudeTelemetry({ OTEL_TRACES_EXPORTER: 'otlp' });
    expect(env.CLAUDE_CODE_ENABLE_TELEMETRY).toBeUndefined();
  });

  it('adds Claude-specific tracing attributes without losing existing attributes', () => {
    const env = configureClaudeTelemetry({
      OTEL_TRACES_EXPORTER: 'console,otlp',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
      OTEL_RESOURCE_ATTRIBUTES: 'region=cn,service.name=stale',
    });

    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://collector:4318');
    expect(env.OTEL_SERVICE_NAME).toBe('Studio');
    expect(env.OTEL_RESOURCE_ATTRIBUTES).toContain('region=cn');
    expect(env.OTEL_RESOURCE_ATTRIBUTES).toContain('app_server_name=claude-code');
    expect(env.OTEL_RESOURCE_ATTRIBUTES).not.toContain('service.name=stale');
  });
});
