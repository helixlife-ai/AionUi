/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isPdfAttachmentPath, shouldExtractPdfAttachmentsForSend } from './pdfTextExtractionPolicy';

type PdfToTextApiResponse = { success: true; txtPath: string } | { success: false; error?: string; code?: string };

export type ExtractPdfToTextFn = (pdfPath: string) => Promise<string | null>;

async function extractPdfToTextViaHub(pdfPath: string): Promise<string | null> {
  const response = await fetch('/api/hub/pdf-to-text', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: pdfPath }),
  });

  let data: PdfToTextApiResponse | null = null;
  try {
    data = (await response.json()) as PdfToTextApiResponse;
  } catch {
    data = null;
  }

  if (!response.ok || !data || data.success !== true || typeof data.txtPath !== 'string' || !data.txtPath) {
    const detail = data && data.success === false ? data.error || data.code : `HTTP ${response.status}`;
    console.warn('[preparePdfAttachmentsForSend] pdftotext failed, keeping PDF:', pdfPath, detail);
    return null;
  }

  return data.txtPath;
}

/**
 * For Claude Code on Agent Hub WebUI, replace each PDF path with its extracted
 * `.pdf.txt` sibling. Failures keep the original PDF so send is not blocked.
 */
export async function preparePdfAttachmentsForSend(
  files: string[],
  options: { backend: string; extractPdfToText?: ExtractPdfToTextFn }
): Promise<string[]> {
  if (!shouldExtractPdfAttachmentsForSend(options.backend)) {
    return files;
  }
  if (!files.some(isPdfAttachmentPath)) {
    return files;
  }

  const extract = options.extractPdfToText ?? extractPdfToTextViaHub;

  return Promise.all(
    files.map(async (filePath) => {
      if (!isPdfAttachmentPath(filePath)) return filePath;
      try {
        const txtPath = await extract(filePath);
        return txtPath || filePath;
      } catch (error) {
        console.warn('[preparePdfAttachmentsForSend] extraction error, keeping PDF:', filePath, error);
        return filePath;
      }
    })
  );
}
