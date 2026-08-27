import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildCodexOtelConfig, resolveTracesEndpoint } = require(
  path.resolve(process.cwd(), 'docker/agent-hub/otel/configure-codex-otel.js')
) as {
  buildCodexOtelConfig: (env: NodeJS.ProcessEnv) => string;
  resolveTracesEndpoint: (value?: string) => string;
};

describe('Codex native telemetry config', () => {
  it('stays disabled without an explicit opt-in', () => {
    expect(buildCodexOtelConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' })).toBe('');
  });

  it('stays disabled without a traces endpoint', () => {
    expect(buildCodexOtelConfig({ OTEL_TRACES_EXPORTER: 'otlp' })).toBe('');
  });

  it('builds an agent-scoped trace exporter with prompt logging', () => {
    const config = buildCodexOtelConfig({
      OTEL_TRACES_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
    });

    expect(config).toContain('trace_exporter = { "otlp-http"');
    expect(config).toContain('endpoint = "http://collector:4318/v1/traces"');
    expect(config).toContain('"resourceAttributes.service.name" = "Studio"');
    expect(config).toContain('"resourceAttributes.app_server_name" = "codex"');
    expect(config).toContain('log_user_prompt = true');
  });

  it('does not duplicate a signal path supplied by the collector', () => {
    expect(resolveTracesEndpoint('http://collector:4318/v1/traces')).toBe('http://collector:4318/v1/traces');
  });
});
