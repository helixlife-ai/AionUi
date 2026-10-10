import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const compose = fs.readFileSync(path.resolve('aio_deploy/docker-compose.yaml'), 'utf8');
const dockerfile = fs.readFileSync(path.resolve('Dockerfile'), 'utf8');
const deploymentConfig = JSON.parse(fs.readFileSync(path.resolve('aio_deploy/config.json'), 'utf8')) as {
  version: string;
  desc: string;
};

describe('Agent Hub deployment defaults', () => {
  it('uses distinct Flash defaults for Claude and Codex', () => {
    for (const tier of ['OPUS', 'SONNET', 'HAIKU']) {
      expect(compose).toContain(`ANTHROPIC_DEFAULT_${tier}_MODEL=agenthub-claude-deepseek-v4-1-flash`);
    }
    expect(compose).toContain('CODEX_MODEL=${CODEX_MODEL:-agenthub-codex-deepseek-v4-1-flash}');
    expect(compose).not.toContain('agenthub-deepseek-v4-1-flash');
  });
  it('uses development endpoints when no environment override is provided', () => {
    expect(compose).toContain('ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-https://paas-model.jova.bio/api/v1/helix}');
    expect(compose).toContain('CODEX_BASE_URL=${CODEX_BASE_URL:-https://paas-model.jova.bio/api/v1/helix/v1}');
    expect(compose).toContain('HAPPY_SERVER_URL=${HAPPY_SERVER_URL:-https://studio-server.jova.bio}');
  });

  it('does not default to production domains', () => {
    expect(compose).not.toContain('aio-model.newidea.pro');
    expect(compose).not.toContain('studio-server.newidea.pro');
  });

  it('uses the v0.2.24 release consistently', () => {
    expect(deploymentConfig.version).toBe('v0.2.24');
    expect(deploymentConfig.desc.trim()).not.toBe('');
    expect(deploymentConfig.desc).not.toMatch(/&#|<[^>]+>/);
    expect(compose).toContain('application/agent-hub:v0.2.24');
    expect(`${compose}\n${JSON.stringify(deploymentConfig)}`).not.toContain('v0.2.16');
  });

  it('does not invoke the removed runtime skill assembler while building the image', () => {
    expect(dockerfile).not.toContain('build-builtin-skills-hub.js');
    expect(dockerfile).toContain(
      'COPY --from=official-skills /opt/agent-hub/builtin-skills-hub/ /etc/agent-hub/builtin-skills-hub/'
    );
  });

  it('enables trace export to the appliance Collector by default', () => {
    expect(compose).toContain('OTEL_TRACES_EXPORTER=${OTEL_TRACES_EXPORTER:-otlp}');
    expect(compose).toContain('OTEL_EXPORTER_OTLP_ENDPOINT=${OTEL_EXPORTER_OTLP_ENDPOINT:-http://otel-collector:4318}');
    expect(compose).toContain('OTEL_EXPORTER_OTLP_PROTOCOL=${OTEL_EXPORTER_OTLP_PROTOCOL:-http/protobuf}');
    expect(compose).not.toContain('OTEL_RESOURCE_ATTRIBUTES=');
  });

  it('joins the appliance Collector network', () => {
    expect(compose).toContain('networks:\n      - web');
    expect(compose).toContain('name: web-net');
    expect(compose).toContain('external: true');
  });
});

describe('AionCore v0.2.2 deployment compatibility', () => {
  it('pins official stable CLI releases and checks the binaries', () => {
    expect(dockerfile).toContain('ARG CLAUDE_CODE_VERSION=2.1.287');
    expect(dockerfile).toContain('ARG CODEX_VERSION=0.162.1');
    expect(dockerfile).toContain('codex --version');
    expect(dockerfile).not.toContain('RUN node /etc/agent-hub/models/pinClaude.js');
  });
  it('preserves native resume anchors across startup and idle periods', () => {
    expect(compose).not.toContain('SET session_id=NULL');
    expect(compose).not.toContain('clear-idle-acp-sessions.js');
    expect(compose).toContain('AgentHub/claude-home:/root/.claude');
    expect(compose).toContain('AgentHub/codex-home:/root/.codex');
  });
  it('ships the release-matched cross-session command skills', () => {
    for (const name of ['conversation-create', 'session-message']) {
      expect(fs.existsSync(path.resolve('docker/agent-hub/auto-inject', name, 'SKILL.md'))).toBe(true);
    }
  });
});

describe('Docker nested sandbox policy', () => {
  it('keeps unlisted system calls denied instead of disabling seccomp', () => {
    const profile = JSON.parse(fs.readFileSync(path.resolve('docker/agent-hub/deployment/codex-seccomp.json'), 'utf8'));
    expect(profile.defaultAction).toBe('SCMP_ACT_ERRNO');
    expect(profile.defaultErrnoRet).toBe(1);
  });

  it('does not grant privileged or SYS_ADMIN access for Codex sandbox support', () => {
    const override = fs.readFileSync(path.resolve('docker/agent-hub/deployment/docker-compose-sandbox.yaml'), 'utf8');
    expect(override).toContain('no-new-privileges:true');
    expect(override).not.toMatch(/privileged:\s*true|SYS_ADMIN|seccomp[=:]unconfined/);
  });
});
