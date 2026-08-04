/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { preparePdfAttachmentsForSend } from '@/renderer/utils/hub/pdfAttachments/preparePdfAttachmentsForSend';
import {
  isPdfAttachmentPath,
  shouldExtractPdfAttachmentsForSend,
} from '@/renderer/utils/hub/pdfAttachments/pdfTextExtractionPolicy';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: vi.fn(() => false),
}));

import { isElectronDesktop } from '@/renderer/utils/platform';

describe('pdfTextExtractionPolicy', () => {
  afterEach(() => {
    vi.mocked(isElectronDesktop).mockReturnValue(false);
  });

  it('extracts only for Claude on WebUI', () => {
    expect(shouldExtractPdfAttachmentsForSend('claude')).toBe(true);
    expect(shouldExtractPdfAttachmentsForSend('Claude')).toBe(true);
    expect(shouldExtractPdfAttachmentsForSend('codex')).toBe(false);
    expect(shouldExtractPdfAttachmentsForSend('gemini')).toBe(false);
  });

  it('skips extraction on Electron desktop', () => {
    vi.mocked(isElectronDesktop).mockReturnValue(true);
    expect(shouldExtractPdfAttachmentsForSend('claude')).toBe(false);
  });

  it('detects pdf paths', () => {
    expect(isPdfAttachmentPath('/data/paper.pdf')).toBe(true);
    expect(isPdfAttachmentPath('/data/paper.PDF')).toBe(true);
    expect(isPdfAttachmentPath('/data/paper.txt')).toBe(false);
  });
});

describe('preparePdfAttachmentsForSend', () => {
  afterEach(() => {
    vi.mocked(isElectronDesktop).mockReturnValue(false);
  });

  it('replaces Claude PDF paths with extracted txt paths', async () => {
    const extractPdfToText = vi.fn(async (pdf: string) => `${pdf}.txt`);
    const result = await preparePdfAttachmentsForSend(['/data/a.pdf', '/data/notes.md'], {
      backend: 'claude',
      extractPdfToText,
    });
    expect(result).toEqual(['/data/a.pdf.txt', '/data/notes.md']);
    expect(extractPdfToText).toHaveBeenCalledOnce();
    expect(extractPdfToText).toHaveBeenCalledWith('/data/a.pdf');
  });

  it('keeps original PDF when extraction fails', async () => {
    const result = await preparePdfAttachmentsForSend(['/data/a.pdf'], {
      backend: 'claude',
      extractPdfToText: async () => null,
    });
    expect(result).toEqual(['/data/a.pdf']);
  });

  it('does not call extract for Codex', async () => {
    const extractPdfToText = vi.fn(async (pdf: string) => `${pdf}.txt`);
    const result = await preparePdfAttachmentsForSend(['/data/a.pdf'], {
      backend: 'codex',
      extractPdfToText,
    });
    expect(result).toEqual(['/data/a.pdf']);
    expect(extractPdfToText).not.toHaveBeenCalled();
  });

  it('passes through when there are no PDFs', async () => {
    const extractPdfToText = vi.fn();
    const files = ['/data/a.md'];
    const result = await preparePdfAttachmentsForSend(files, {
      backend: 'claude',
      extractPdfToText,
    });
    expect(result).toBe(files);
    expect(extractPdfToText).not.toHaveBeenCalled();
  });
});
