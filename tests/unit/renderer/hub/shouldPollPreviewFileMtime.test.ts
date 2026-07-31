/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { shouldPollPreviewFileMtime } from '@/renderer/utils/hub/shouldPollPreviewFileMtime';
import { describe, expect, it } from 'vitest';

describe('shouldPollPreviewFileMtime', () => {
  it('skips office and pdf previews that are rendered from file_path', () => {
    expect(shouldPollPreviewFileMtime('word')).toBe(false);
    expect(shouldPollPreviewFileMtime('excel')).toBe(false);
    expect(shouldPollPreviewFileMtime('ppt')).toBe(false);
    expect(shouldPollPreviewFileMtime('pdf')).toBe(false);
    expect(shouldPollPreviewFileMtime('url')).toBe(false);
  });

  it('keeps polling text-like and image previews', () => {
    expect(shouldPollPreviewFileMtime('markdown')).toBe(true);
    expect(shouldPollPreviewFileMtime('code')).toBe(true);
    expect(shouldPollPreviewFileMtime('diff')).toBe(true);
    expect(shouldPollPreviewFileMtime('html')).toBe(true);
    expect(shouldPollPreviewFileMtime('image')).toBe(true);
  });

  it('returns false for missing content type', () => {
    expect(shouldPollPreviewFileMtime(undefined)).toBe(false);
    expect(shouldPollPreviewFileMtime(null)).toBe(false);
  });
});
