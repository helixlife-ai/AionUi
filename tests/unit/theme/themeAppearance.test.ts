/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getDocumentThemeAppearance, oppositeAppearance } from '@/renderer/utils/theme/themeAppearance';

function mockDoc(dataTheme: string | null) {
  return {
    documentElement: {
      getAttribute: (name: string) => (name === 'data-theme' ? dataTheme : null),
    },
  };
}

describe('getDocumentThemeAppearance', () => {
  it('returns dark when data-theme is dark', () => {
    expect(getDocumentThemeAppearance(mockDoc('dark') as Document)).toBe('dark');
  });

  it('returns light when data-theme is light or missing', () => {
    expect(getDocumentThemeAppearance(mockDoc('light') as Document)).toBe('light');
    expect(getDocumentThemeAppearance(mockDoc(null) as Document)).toBe('light');
  });
});

describe('oppositeAppearance', () => {
  it('flips light and dark', () => {
    expect(oppositeAppearance('light')).toBe('dark');
    expect(oppositeAppearance('dark')).toBe('light');
  });
});
