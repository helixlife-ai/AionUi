import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { handlePdfToTextRequest, isPdfToTextRoute, resolvePdfPathForExtraction } from './pdfToText.js';

describe('isPdfToTextRoute', () => {
  it('matches POST /api/hub/pdf-to-text', () => {
    expect(isPdfToTextRoute('POST', '/api/hub/pdf-to-text')).toBe(true);
    expect(isPdfToTextRoute('POST', '/api/hub/pdf-to-text/')).toBe(true);
    expect(isPdfToTextRoute('POST', '/api/hub/pdf-to-text?x=1')).toBe(true);
  });

  it('rejects other methods and paths', () => {
    expect(isPdfToTextRoute('GET', '/api/hub/pdf-to-text')).toBe(false);
    expect(isPdfToTextRoute('POST', '/api/identity')).toBe(false);
  });
});

describe('resolvePdfPathForExtraction', () => {
  let dir = '';
  let pdfPath = '';

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-to-text-'));
    pdfPath = path.join(dir, 'paper.pdf');
    await fs.writeFile(pdfPath, '%PDF-1.4 fake');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('accepts a PDF under the fs root', async () => {
    const resolved = await resolvePdfPathForExtraction(pdfPath, dir);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.txtPath).toBe(`${pdfPath}.txt`);
    }
  });

  it('rejects paths outside the fs root', async () => {
    const resolved = await resolvePdfPathForExtraction(pdfPath, path.join(dir, 'nested'));
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.code).toBe('PATH_OUTSIDE_ROOT');
    }
  });

  it('rejects non-pdf paths', async () => {
    const resolved = await resolvePdfPathForExtraction(path.join(dir, 'notes.txt'), dir);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.code).toBe('NOT_PDF');
    }
  });
});

describe('handlePdfToTextRequest', () => {
  let dir = '';
  let pdfPath = '';

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-to-text-http-'));
    pdfPath = path.join(dir, 'paper.pdf');
    await fs.writeFile(pdfPath, '%PDF-1.4 fake');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function post(
    body: unknown,
    runPdfToText: (pdf: string, txt: string) => Promise<void>
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const server = http.createServer((req, res) => {
      void handlePdfToTextRequest(req, res, {
        runPdfToText,
        resolveFsRoot: () => dir,
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/hub/pdf-to-text`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: response.status, json: (await response.json()) as Record<string, unknown> };
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('writes txt and returns txtPath on success', async () => {
    const result = await post({ path: pdfPath }, async (_pdf, txt) => {
      await fs.writeFile(txt, 'extracted text');
    });
    expect(result.status).toBe(200);
    expect(result.json.success).toBe(true);
    expect(result.json.txtPath).toBe(`${pdfPath}.txt`);
    expect(await fs.readFile(`${pdfPath}.txt`, 'utf8')).toBe('extracted text');
  });

  it('returns 400 when path is outside root', async () => {
    const outside = path.join(os.tmpdir(), `outside-${Date.now()}.pdf`);
    await fs.writeFile(outside, '%PDF');
    try {
      const result = await post({ path: outside }, async () => undefined);
      expect(result.status).toBe(400);
      expect(result.json.code).toBe('PATH_OUTSIDE_ROOT');
    } finally {
      await fs.rm(outside, { force: true });
    }
  });

  it('returns 500 when pdftotext fails', async () => {
    const result = await post({ path: pdfPath }, async () => {
      throw new Error('spawn pdftotext ENOENT');
    });
    expect(result.status).toBe(500);
    expect(result.json.success).toBe(false);
    expect(result.json.code).toBe('PDFTOTEXT_UNAVAILABLE');
  });
});
