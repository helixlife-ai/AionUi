/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Message } from '@arco-design/web-react';
import {
  FILE_TOO_LARGE_ERROR,
  FILE_UNSUPPORTED_ERROR,
  isUploadFileTooLarge,
  MAX_UPLOAD_FILE_SIZE_MB,
} from '@/renderer/services/FileService';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/** Keep the toast long enough that users can read it (default Message is easy to miss). */
export const FILE_ATTACH_ERROR_TOAST_DURATION_MS = 5000;

/** Map upload failures to the correct toast copy (size / type / generic). */
export function getFileAttachErrorMessage(t: TranslateFn, error: unknown): string {
  if (error instanceof Error && error.message === FILE_TOO_LARGE_ERROR) {
    return t('common.fileAttach.tooLarge', {
      maxSizeMb: MAX_UPLOAD_FILE_SIZE_MB,
      defaultValue: `上传的文件超过${MAX_UPLOAD_FILE_SIZE_MB}MB`,
    });
  }
  if (error instanceof Error && error.message === FILE_UNSUPPORTED_ERROR) {
    return t('common.fileAttach.unsupported', { defaultValue: '不支持的文件格式' });
  }
  return t('common.fileAttach.failed', { defaultValue: '上传失败' });
}

/** Show a stable error toast for attach/upload failures. */
export function showFileAttachError(t: TranslateFn, error: unknown): void {
  Message.error({
    content: getFileAttachErrorMessage(t, error),
    duration: FILE_ATTACH_ERROR_TOAST_DURATION_MS,
  });
}

/**
 * Drop host-selected paths that exceed the upload size limit and toast once.
 * Used by WebUI/Electron "Add files" dialogs that return on-disk paths (no File.size).
 */
export async function filterPathsWithinUploadLimit(paths: string[], t: TranslateFn): Promise<string[]> {
  if (paths.length === 0) return [];

  let sawTooLarge = false;
  const decisions = await Promise.all(
    paths.map(async (path) => {
      try {
        const metadata = await ipcBridge.fs.getFileMetadata.invoke({ path });
        if (metadata && typeof metadata.size === 'number' && isUploadFileTooLarge(metadata.size)) {
          sawTooLarge = true;
          return null;
        }
        return path;
      } catch {
        // If metadata is unavailable, keep prior attach behavior (do not block).
        return path;
      }
    })
  );

  if (sawTooLarge) {
    showFileAttachError(t, new Error(FILE_TOO_LARGE_ERROR));
  }

  return decisions.filter((path): path is string => path !== null);
}
