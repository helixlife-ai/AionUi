import { describe, expect, it } from 'vitest';
import {
  formatStudioModelRate,
  getStudioModelDescriptionKey,
  withStudioFallback,
} from '@/renderer/components/agent/StudioModelSelector/catalog';

describe('Studio model metadata', () => {
  it.each([undefined, null, [], [{ id: 'other', label: 'Other' }]])(
    'retains fallback for absent or incomplete catalog %j',
    (models) => {
      expect(withStudioFallback(models).filter((model) => model.label === 'DeepSeek-V4.1-Flash')).toHaveLength(1);
    }
  );
  it('deduplicates fallback and retains the exact backend ID', () => {
    const models = withStudioFallback([
      { id: 'DeepSeek-V4-Flash', label: 'Renamed' },
      { id: 'deepseek-v4-flash', label: 'duplicate' },
    ]);
    expect(models).toEqual([{ id: 'DeepSeek-V4-Flash', label: 'DeepSeek-V4.1-Flash' }]);
  });
  it.each([
    [1.9, '1.9×'],
    [0, '0×'],
    [{ min: 0.44, max: 0.89 }, '0.44～0.89×'],
    [{ min: 2, max: 2 }, '2×'],
  ] as const)('formats %j', (rate, expected) => {
    expect(formatStudioModelRate(rate)).toBe(expected);
  });
  it.each([undefined, null, NaN, Infinity, -1, { min: 2, max: 1 }])(
    'renders invalid or absent rate %j as unknown',
    (rate) => {
      expect(formatStudioModelRate(rate)).toBe('--');
    }
  );
  it('does not infer a business model from a CLI alias', () => {
    expect(getStudioModelDescriptionKey('opus')).toBeUndefined();
  });
});
