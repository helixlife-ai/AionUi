/**
 * Agent Hub: extract PDF text via poppler `pdftotext` before Claude Code send.
 * Keeps LLM gateway request bodies under the ~6MB limit for ~2MB PDF attachments.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

const MAX_BODY_BYTES = 64_000;
const PDFTOTEXT_TIMEOUT_MS = 60_000;

export type PdfToTextSuccess = {
  success: true;
  txtPath: string;
};

export type PdfToTextFailure = {
  success: false;
  error: string;
  code: string;
};

export type PdfToTextResponse = PdfToTextSuccess | PdfToTextFailure;

function resolveFsRoot(): string | null {
  const raw = process.env.AIONUI_FS_ROOT?.trim();
  return raw ? path.resolve(raw) : null;
}

function isPathInsideRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Resolve and validate a PDF path for extraction. */
export async function resolvePdfPathForExtraction(
  rawPath: string,
  fsRoot: string | null = resolveFsRoot()
): Promise<{ ok: true; pdfPath: string; txtPath: string } | { ok: false; code: string; error: string }> {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return { ok: false, code: 'INVALID_PATH', error: 'path is required' };
  }

  const pdfPath = path.resolve(rawPath.trim());
  if (path.extname(pdfPath).toLowerCase() !== '.pdf') {
    return { ok: false, code: 'NOT_PDF', error: 'path must end with .pdf' };
  }

  if (fsRoot && !isPathInsideRoot(pdfPath, fsRoot)) {
    return { ok: false, code: 'PATH_OUTSIDE_ROOT', error: 'path is outside AIONUI_FS_ROOT' };
  }

  try {
    const stat = await fs.stat(pdfPath);
    if (!stat.isFile()) {
      return { ok: false, code: 'NOT_FILE', error: 'path is not a file' };
    }
  } catch {
    return { ok: false, code: 'NOT_FOUND', error: 'pdf file not found' };
  }

  return { ok: true, pdfPath, txtPath: `${pdfPath}.txt` };
}

type RunPdfToText = (pdfPath: string, txtPath: string) => Promise<void>;

/** Run poppler pdftotext; overwrites txtPath. */
export function createPdfToTextRunner(command = 'pdftotext'): RunPdfToText {
  return (pdfPath, txtPath) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, ['-layout', '-enc', 'UTF-8', pdfPath, txtPath], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`pdftotext timed out after ${PDFTOTEXT_TIMEOUT_MS}ms`));
      }, PDFTOTEXT_TIMEOUT_MS);

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `pdftotext exited with code ${code ?? 'unknown'}`));
      });
    });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error('request body too large'), { code: 'BODY_TOO_LARGE' });
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function sendJson(res: ServerResponse, status: number, body: PdfToTextResponse): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export type PdfToTextHandlerOptions = {
  runPdfToText?: RunPdfToText;
  resolveFsRoot?: () => string | null;
};

/** Handle POST /api/hub/pdf-to-text */
export async function handlePdfToTextRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: PdfToTextHandlerOptions = {}
): Promise<void> {
  const runPdfToText = options.runPdfToText ?? createPdfToTextRunner();
  const fsRoot = (options.resolveFsRoot ?? resolveFsRoot)();

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    const code = (err as { code?: string }).code === 'BODY_TOO_LARGE' ? 'BODY_TOO_LARGE' : 'INVALID_JSON';
    sendJson(res, 400, {
      success: false,
      code,
      error: code === 'BODY_TOO_LARGE' ? 'request body too large' : 'invalid JSON body',
    });
    return;
  }

  const pathValue = body && typeof body === 'object' && 'path' in body ? (body as { path: unknown }).path : undefined;
  const resolved = await resolvePdfPathForExtraction(typeof pathValue === 'string' ? pathValue : '', fsRoot);
  if (resolved.ok === false) {
    sendJson(res, 400, { success: false, code: resolved.code, error: resolved.error });
    return;
  }

  try {
    await runPdfToText(resolved.pdfPath, resolved.txtPath);
    await fs.access(resolved.txtPath);
    sendJson(res, 200, { success: true, txtPath: resolved.txtPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = /ENOENT|not found|spawn/i.test(message) ? 'PDFTOTEXT_UNAVAILABLE' : 'PDFTOTEXT_FAILED';
    sendJson(res, 500, { success: false, code, error: message });
  }
}

/** True when this request should be handled as the Hub PDF extraction route. */
export function isPdfToTextRoute(method: string, url: string): boolean {
  if (method !== 'POST') return false;
  const pathname = url.split('?')[0] ?? url;
  return pathname === '/api/hub/pdf-to-text' || pathname === '/api/hub/pdf-to-text/';
}
