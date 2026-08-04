/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isElectronDesktop } from '@/renderer/utils/platform';

/**
 * Agent Hub WebUI: before Claude Code send, replace PDF attachments with
 * pdftotext output so Helix/LLM gateways (~6MB request body) are not exceeded.
 * Desktop Electron has no web-host `/api/hub/pdf-to-text` route — skip there.
 */
export function isAgentHubClaudePdfTextExtractionEnabled(): boolean {
  return true;
}

/** True when this ACP backend should extract PDF → text before send. */
export function shouldExtractPdfAttachmentsForSend(backend: string | null | undefined): boolean {
  if (!isAgentHubClaudePdfTextExtractionEnabled()) return false;
  if (isElectronDesktop()) return false;
  return (backend || '').trim().toLowerCase() === 'claude';
}

export function isPdfAttachmentPath(filePath: string): boolean {
  const normalized = filePath.trim().split(/[?#]/)[0] || '';
  return normalized.toLowerCase().endsWith('.pdf');
}
