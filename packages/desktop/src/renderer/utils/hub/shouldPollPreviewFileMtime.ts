/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PreviewContentType } from '@/common/types/office/preview';

/**
 * Whether PreviewContext should poll `/api/fs/metadata` for external mtime
 * changes on this preview type.
 *
 * Office / PDF previews are rendered by officecli (or a dedicated viewer) from
 * `file_path` — text `readFile` refresh is useless and, when metadata hangs,
 * piles up pending requests that freeze the UI.
 */
export function shouldPollPreviewFileMtime(contentType: PreviewContentType | undefined | null): boolean {
  if (!contentType) return false;
  switch (contentType) {
    case 'word':
    case 'excel':
    case 'ppt':
    case 'pdf':
    case 'url':
      return false;
    default:
      return true;
  }
}
