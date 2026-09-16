import { describe, expect, it } from 'vitest';
import {
  getStudioModels,
  resolveStudioDraftModel,
  withStudioFallback,
} from '@/renderer/components/agent/StudioModelSelector/catalog';

describe('confirmed Studio routing contract', () => {
  it('offers five Messages models but excludes GLM from Responses', () => {
    expect(getStudioModels('claude')).toHaveLength(5);
    expect(getStudioModels('codex')).toHaveLength(4);
    expect(getStudioModels('codex').some((model) => model.id === 'agenthub-glm5-3')).toBe(false);
  });
  it.each(['claude', 'codex'] as const)('uses the stable %s fallback when the catalog is unavailable', (backend) => {
    expect(withStudioFallback(null, backend)).toEqual([{ id: `agenthub-${backend}`, label: 'DeepSeek-V4.1-Flash' }]);
  });
  it('retains a valid draft independently of runtime discovery', () => {
    expect(resolveStudioDraftModel('claude', 'agenthub-qwen3-7-plus')).toBe('agenthub-qwen3-7-plus');
  });
  it.each([null, 'sonnet', 'deepseek-v4-flash', 'agenthub-glm5-3'])(
    'uses Codex Flash for an incompatible or missing draft %s',
    (value) => {
      expect(resolveStudioDraftModel('codex', value)).toBe('agenthub-codex');
    }
  );
  it('never uses dotted names or unprefixed display names as request IDs', () => {
    expect(
      [...getStudioModels('claude'), ...getStudioModels('codex')].every(({ id }) => /^agenthub-[\w-]+$/.test(id))
    ).toBe(true);
  });
});
