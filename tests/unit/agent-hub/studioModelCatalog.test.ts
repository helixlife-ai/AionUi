import { describe, expect, it } from 'vitest';
import {
  getStudioModels,
  normalizeStudioModelId,
  resolveStudioDraftModel,
  withStudioFallback,
} from '@/renderer/components/agent/StudioModelSelector/catalog';

describe('confirmed Studio routing contract', () => {
  it('offers the same five confirmed models for both protocols', () => {
    expect(getStudioModels('claude').map(({ id }) => id)).toEqual([
      'agenthub-qwen3-5-plus',
      'agenthub-qwen3-7-plus',
      'agenthub-deepseek-v4-1-flash',
      'agenthub-glm-5-3',
      'agenthub-kimi-k3',
    ]);
    expect(getStudioModels('codex')).toEqual(getStudioModels('claude'));
  });
  it.each(['claude', 'codex'] as const)('uses the stable %s fallback when the catalog is unavailable', (backend) => {
    expect(withStudioFallback(null, backend)).toEqual([
      { id: 'agenthub-deepseek-v4-1-flash', label: 'DeepSeek-V4.1-Flash' },
    ]);
  });
  it('retains a valid draft independently of runtime discovery', () => {
    expect(resolveStudioDraftModel('claude', 'agenthub-qwen3-5-plus')).toBe('agenthub-qwen3-5-plus');
    expect(resolveStudioDraftModel('codex', 'agenthub-qwen3-7-plus')).toBe('agenthub-qwen3-7-plus');
  });
  it.each([
    ['agenthub-claude', 'agenthub-deepseek-v4-1-flash'],
    ['agenthub-codex', 'agenthub-deepseek-v4-1-flash'],
    ['agenthub-glm5-3', 'agenthub-glm-5-3'],
  ])('normalizes the legacy %s alias for display and drafts', (legacy, current) => {
    expect(normalizeStudioModelId(legacy)).toBe(current);
  });
  it.each([null, 'sonnet', 'deepseek-v4-flash', 'agenthub-claude', 'agenthub-codex'])(
    'uses Codex Flash for an incompatible or missing draft %s',
    (value) => {
      expect(resolveStudioDraftModel('codex', value)).toBe('agenthub-deepseek-v4-1-flash');
    }
  );
  it('never uses dotted names or unprefixed display names as request IDs', () => {
    expect(
      [...getStudioModels('claude'), ...getStudioModels('codex')].every(({ id }) => /^agenthub-[\w-]+$/.test(id))
    ).toBe(true);
  });
});
