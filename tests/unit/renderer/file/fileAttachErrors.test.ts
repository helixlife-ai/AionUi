/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FILE_TOO_LARGE_ERROR,
  isUploadFileTooLarge,
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILE_SIZE_MB,
} from '@/renderer/services/FileService';
import {
  FILE_ATTACH_ERROR_TOAST_DURATION_MS,
  getFileAttachErrorMessage,
} from '@/renderer/utils/file/fileAttachErrors';
import { describe, expect, it } from 'vitest';

describe('file attach size limit helpers', () => {
  const t = (key: string, options?: Record<string, unknown>) => {
    if (key === 'common.fileAttach.tooLarge') {
      return `too-large:${options?.maxSizeMb}`;
    }
    if (key === 'common.fileAttach.failed') {
      return 'failed';
    }
    return key;
  };

  it('treats files at or above 30MB as too large', () => {
    expect(isUploadFileTooLarge(MAX_UPLOAD_FILE_SIZE_BYTES - 1)).toBe(false);
    expect(isUploadFileTooLarge(MAX_UPLOAD_FILE_SIZE_BYTES)).toBe(true);
    expect(isUploadFileTooLarge(MAX_UPLOAD_FILE_SIZE_BYTES + 1)).toBe(true);
  });

  it('returns the size-limit message for FILE_TOO_LARGE errors', () => {
    expect(getFileAttachErrorMessage(t, new Error(FILE_TOO_LARGE_ERROR))).toBe(
      `too-large:${MAX_UPLOAD_FILE_SIZE_MB}`
    );
  });

  it('returns the generic upload failure message for other errors', () => {
    expect(getFileAttachErrorMessage(t, new Error('Upload failed: 502 Bad Gateway'))).toBe('failed');
    expect(getFileAttachErrorMessage(t, 'boom')).toBe('failed');
  });

  it('keeps toast duration long enough to read', () => {
    expect(FILE_ATTACH_ERROR_TOAST_DURATION_MS).toBeGreaterThanOrEqual(4000);
  });
});
