import { describe, expect, it } from 'vitest';
import {
  getStudioModels,
  normalizeStudioModelId,
  resolveStudioConversationModel,
  resolveStudioDraftModel,
  withStudioFallback,
} from '@/renderer/components/agent/StudioModelSelector/catalog';

describe('confirmed Studio routing contract', () => {
  it.each(['claude', 'codex'] as const)('offers five agent-specific IDs for %s', (backend) => {
    expect(getStudioModels(backend).map(({ id }) => id)).toEqual([
      `agenthub-${backend}-qwen3-5-plus`,
      `agenthub-${backend}-qwen3-7-plus`,
      `agenthub-${backend}-deepseek-v4-1-flash`,
      `agenthub-${backend}-glm-5-3`,
      `agenthub-${backend}-kimi-k3`,
    ]);
  });
  it.each(['claude', 'codex'] as const)('uses the stable %s fallback when the catalog is unavailable', (backend) => {
    expect(withStudioFallback(null, backend)).toEqual([
      { id: `agenthub-${backend}-deepseek-v4-1-flash`, label: 'DeepSeek-V4.1-Flash' },
    ]);
  });
  it('retains a valid draft independently of runtime discovery', () => {
    expect(resolveStudioDraftModel('claude', 'agenthub-qwen3-5-plus')).toBe('agenthub-claude-qwen3-5-plus');
    expect(resolveStudioDraftModel('codex', 'agenthub-qwen3-7-plus')).toBe('agenthub-codex-qwen3-7-plus');
  });
  it.each([
    ['agenthub-claude', 'agenthub-deepseek-v4-1-flash'],
    ['agenthub-codex', 'agenthub-deepseek-v4-1-flash'],
    ['default', 'agenthub-deepseek-v4-1-flash'],
    ['agenthub-glm5-3', 'agenthub-glm-5-3'],
  ])('normalizes the legacy %s alias for display and drafts', (legacy, current) => {
    expect(normalizeStudioModelId(legacy)).toBe(current);
  });
  it('prefers a persisted conversation model over the Claude default sentinel', () => {
    expect(resolveStudioConversationModel('claude', 'default', 'agenthub-kimi-k3')).toBe('agenthub-claude-kimi-k3');
  });
  it('uses Flash when the runtime default sentinel has no persisted model', () => {
    expect(resolveStudioConversationModel('codex', 'default')).toBe('agenthub-codex-deepseek-v4-1-flash');
  });
  it.each([null, 'sonnet', 'deepseek-v4-flash', 'agenthub-claude', 'agenthub-codex'])(
    'uses Codex Flash for an incompatible or missing draft %s',
    (value) => {
      expect(resolveStudioDraftModel('codex', value)).toBe('agenthub-codex-deepseek-v4-1-flash');
    }
  );
  it('never uses dotted names or unprefixed display names as request IDs', () => {
    expect(
      [...getStudioModels('claude'), ...getStudioModels('codex')].every(({ id }) => /^agenthub-[\w-]+$/.test(id))
    ).toBe(true);
  });
  it.each(['claude', 'codex'] as const)('maps all shared legacy IDs to %s for new drafts', (backend) => {
    for (const suffix of ['qwen3-5-plus', 'qwen3-7-plus', 'deepseek-v4-1-flash', 'glm-5-3', 'kimi-k3']) {
      expect(resolveStudioDraftModel(backend, `agenthub-${suffix}`)).toBe(`agenthub-${backend}-${suffix}`);
    }
  });
  it('remaps the draft when switching agents instead of using the other agent request ID', () => {
    expect(resolveStudioDraftModel('codex', 'agenthub-claude-kimi-k3')).toBe('agenthub-codex-kimi-k3');
    expect(resolveStudioDraftModel('claude', 'agenthub-codex-glm-5-3')).toBe('agenthub-claude-glm-5-3');
  });
  it.each(['agenthub-claude', 'agenthub-codex', 'agenthub-qwen3-5-plus'])(
    'does not rewrite the historical runtime ID %s',
    (id) => {
      expect(resolveStudioConversationModel('claude', id)).toBe(id);
    }
  );
});
