/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FILE_TOO_LARGE_ERROR,
  FILE_UNSUPPORTED_ERROR,
  isSupportedFile,
  isUploadFileTooLarge,
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILE_SIZE_MB,
} from '@/renderer/services/FileService';
import {
  FILE_ATTACH_ERROR_TOAST_DURATION_MS,
  getFileAttachErrorMessage,
} from '@/renderer/utils/file/fileAttachErrors';
import { describe, expect, it } from 'vitest';

describe('file attach size/type helpers', () => {
  const t = (key: string, options?: Record<string, unknown>) => {
    if (key === 'common.fileAttach.tooLarge') {
      return `too-large:${options?.maxSizeMb}`;
    }
    if (key === 'common.fileAttach.unsupported') {
      return 'unsupported';
    }
    if (key === 'common.fileAttach.failed') {
      return 'failed';
    }
    return key;
  };

  it('treats files at or above 30MB as too large', () => {
    expect(isUploadFileTooLarge(MAX_UPLOAD_FILE_SIZE_BYTES - 1)).toBe(false);
    expect(isUploadFileTooLarge(MAX_UPLOAD_FILE_SIZE_BYTES)).toBe(true);
  });

  it('accepts allow-listed extensions and rejects others', () => {
    expect(isSupportedFile('a.pdf', ['.pdf', '.png'])).toBe(true);
    expect(isSupportedFile('a.PNG', ['.png'])).toBe(true);
    expect(isSupportedFile('a.exe', ['.pdf', '.png'])).toBe(false);
    expect(isSupportedFile('noext', ['.pdf'])).toBe(false);
    expect(isSupportedFile('a.exe', [])).toBe(true);
  });

  it('maps size and unsupported errors to distinct copy', () => {
    expect(getFileAttachErrorMessage(t, new Error(FILE_TOO_LARGE_ERROR))).toBe(
      `too-large:${MAX_UPLOAD_FILE_SIZE_MB}`
    );
    expect(getFileAttachErrorMessage(t, new Error(FILE_UNSUPPORTED_ERROR))).toBe('unsupported');
    expect(getFileAttachErrorMessage(t, new Error('Upload failed: 502 Bad Gateway'))).toBe('failed');
  });

  it('keeps toast duration long enough to read', () => {
    expect(FILE_ATTACH_ERROR_TOAST_DURATION_MS).toBeGreaterThanOrEqual(4000);
  });
});
