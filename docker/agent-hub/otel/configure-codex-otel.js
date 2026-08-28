#!/usr/bin/env node
const fs = require('fs');

function tomlString(value) {
  return JSON.stringify(String(value));
}

function resolveTracesEndpoint(value) {
  const endpoint = String(value || '')
    .trim()
    .replace(/\/+$/, '');
  if (!endpoint || endpoint.endsWith('/v1/traces')) return endpoint;
  return `${endpoint}/v1/traces`;
}

/** @param {NodeJS.ProcessEnv} env */
function buildCodexOtelConfig(env) {
  const enabled = String(env.OTEL_TRACES_EXPORTER || '')
    .toLowerCase()
    .split(',')
    .map((value) => value.trim())
    .includes('otlp');
  const endpoint = resolveTracesEndpoint(env.OTEL_EXPORTER_OTLP_ENDPOINT);
  if (!enabled || !endpoint) return '';

  const attributes = {
    'service.name': 'Studio',
    app_server_name: 'codex',
  };

  return `
[otel]
log_user_prompt = true
trace_exporter = { "otlp-http" = { endpoint = ${tomlString(endpoint)}, protocol = "binary" } }

[otel.span_attributes]
${Object.entries(attributes)
  .map(([key, value]) => `${tomlString(key)} = ${tomlString(value)}`)
  .join('\n')}
`;
}

function main() {
  const configPath = process.argv[2] || '/root/.codex/config.toml';
  const fragment = buildCodexOtelConfig(process.env);
  if (!fragment) {
    console.log('[agent-hub] native agent telemetry disabled for Codex');
    return;
  }
  fs.appendFileSync(configPath, fragment);
  console.log('[agent-hub] configured Codex native OpenTelemetry tracing');
}

module.exports = { buildCodexOtelConfig, resolveTracesEndpoint };

if (require.main === module) main();
