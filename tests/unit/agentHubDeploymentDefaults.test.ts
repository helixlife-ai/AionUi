import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const compose = fs.readFileSync(path.resolve('aio_deploy/docker-compose.yaml'), 'utf8');

describe('Agent Hub production deployment defaults', () => {
  it('uses production endpoints when no environment override is provided', () => {
    expect(compose).toContain('ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-https://aio-model.newidea.pro/api/v1/helix}');
    expect(compose).toContain('CODEX_BASE_URL=${CODEX_BASE_URL:-https://aio-model.newidea.pro/api/v1/helix/v1}');
    expect(compose).toContain('HAPPY_SERVER_URL=${HAPPY_SERVER_URL:-https://studio-server.newidea.pro}');
  });

  it('does not fall back to retired development domains', () => {
    expect(compose).not.toContain('paas-model.jova.bio');
    expect(compose).not.toContain('studio-server.jova.bio');
  });
});
