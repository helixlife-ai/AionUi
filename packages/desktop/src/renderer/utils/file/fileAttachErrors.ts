/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from '@arco-design/web-react';
import { FILE_TOO_LARGE_ERROR, MAX_UPLOAD_FILE_SIZE_MB } from '@/renderer/services/FileService';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/** Keep the toast long enough that users can read it (default Message is easy to miss). */
export const FILE_ATTACH_ERROR_TOAST_DURATION_MS = 5000;

/** Map upload failures to the correct toast copy (size limit vs generic failure). */
export function getFileAttachErrorMessage(t: TranslateFn, error: unknown): string {
  if (error instanceof Error && error.message === FILE_TOO_LARGE_ERROR) {
    return t('common.fileAttach.tooLarge', { maxSizeMb: MAX_UPLOAD_FILE_SIZE_MB });
  }
  return t('common.fileAttach.failed');
}

/** Show a stable error toast for attach/upload failures. */
export function showFileAttachError(t: TranslateFn, error: unknown): void {
  Message.error({
    content: getFileAttachErrorMessage(t, error),
    duration: FILE_ATTACH_ERROR_TOAST_DURATION_MS,
  });
}
