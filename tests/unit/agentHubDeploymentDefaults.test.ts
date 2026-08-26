import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const compose = fs.readFileSync(path.resolve('aio_deploy/docker-compose.yaml'), 'utf8');
const deploymentConfig = JSON.parse(fs.readFileSync(path.resolve('aio_deploy/config.json'), 'utf8')) as {
  version: string;
  desc: string;
};

describe('Agent Hub deployment defaults', () => {
  it('uses development endpoints when no environment override is provided', () => {
    expect(compose).toContain('ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-https://paas-model.jova.bio/api/v1/helix}');
    expect(compose).toContain('CODEX_BASE_URL=${CODEX_BASE_URL:-https://paas-model.jova.bio/api/v1/helix/v1}');
    expect(compose).toContain('HAPPY_SERVER_URL=${HAPPY_SERVER_URL:-https://studio-server.jova.bio}');
  });

  it('does not default to production domains', () => {
    expect(compose).not.toContain('aio-model.newidea.pro');
    expect(compose).not.toContain('studio-server.newidea.pro');
  });

  it('uses the v0.2.11 release consistently', () => {
    expect(deploymentConfig.version).toBe('v0.2.11');
    expect(deploymentConfig.desc).toBe('修复 Skill 搜索功能偶发闪退的问题\n优化旧版 Studio 历史数据的迁移逻辑');
    expect(compose).toContain('application/agent-hub:v0.2.11');
    expect(`${compose}\n${JSON.stringify(deploymentConfig)}`).not.toContain('v0.2.9');
  });
});
