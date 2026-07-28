/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveDirectorySelectionMode } from '@/renderer/utils/file/directorySelectionMode';

describe('Guid workspace openDirectory mode', () => {
  it('resolves openDirectory-only properties to directory mode', () => {
    expect(resolveDirectorySelectionMode(['openDirectory', 'createDirectory'])).toBe('directory');
  });
});
