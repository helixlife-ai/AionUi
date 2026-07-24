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
  filterPathsWithinUploadLimit,
  getFileAttachErrorMessage,
} from '@/renderer/utils/file/fileAttachErrors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFileMetadataInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFileMetadata: {
        invoke: (...args: unknown[]) => getFileMetadataInvoke(...args),
      },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    error: vi.fn(),
  },
}));

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

describe('filterPathsWithinUploadLimit', () => {
  beforeEach(() => {
    getFileMetadataInvoke.mockReset();
  });

  it('drops oversized host paths and keeps the rest', async () => {
    getFileMetadataInvoke
      .mockResolvedValueOnce({
        name: 'ok.pdf',
        path: '/tmp/ok.pdf',
        size: MAX_UPLOAD_FILE_SIZE_BYTES - 1,
        type: 'application/pdf',
        lastModified: 0,
      })
      .mockResolvedValueOnce({
        name: 'big.pdf',
        path: '/tmp/big.pdf',
        size: MAX_UPLOAD_FILE_SIZE_BYTES,
        type: 'application/pdf',
        lastModified: 0,
      });

    const t = (key: string) => key;
    const accepted = await filterPathsWithinUploadLimit(['/tmp/ok.pdf', '/tmp/big.pdf'], t);
    expect(accepted).toEqual(['/tmp/ok.pdf']);
  });
});
