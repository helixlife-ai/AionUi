/**
 * On-the-fly gzip for SPA static responses.
 *
 * Appliance cold start transfers ~9MB of JS/CSS with Size===Transferred because
 * serve-handler streams files uncompressed. Buffer each static response, then
 * gzip when the client accepts it — headers are deferred until `end` so
 * Content-Length / Content-Encoding stay consistent.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';

/** Skip tiny payloads where gzip overhead is not worth it. */
export const STATIC_GZIP_MIN_BYTES = 256;

const COMPRESSIBLE_TYPE =
  /^(?:text\/|application\/(?:javascript|ecmascript|json|xml|wasm|manifest\+json)|image\/svg\+xml)/i;

export function acceptsGzip(req: IncomingMessage): boolean {
  const raw = req.headers['accept-encoding'];
  if (!raw) return false;
  const value = Array.isArray(raw) ? raw.join(',') : raw;
  return /(^|,)\s*gzip(\s|;|,|$)/i.test(value);
}

export function isCompressibleContentType(contentType: unknown): boolean {
  if (typeof contentType !== 'string' || !contentType) return false;
  return COMPRESSIBLE_TYPE.test(contentType.split(';', 1)[0]!.trim());
}

function headerNameIs(name: string, expected: string): boolean {
  return name.toLowerCase() === expected;
}

function mergeVaryAcceptEncoding(existing: unknown): string {
  if (existing == null || existing === '') return 'Accept-Encoding';
  const value = Array.isArray(existing) ? existing.join(', ') : String(existing);
  if (/(^|,\s*)accept-encoding(\s*,|$)/i.test(value)) return value;
  return `${value}, Accept-Encoding`;
}

function toBuffer(chunk: unknown, encoding?: BufferEncoding): Buffer {
  if (chunk == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  return Buffer.from(String(chunk), encoding);
}

function headerValueToString(value: number | string | ReadonlyArray<string>): string | string[] {
  if (Array.isArray(value)) return value.map(String);
  return String(value);
}

/**
 * Intercept write/end on `res` so compressible static bodies are gzipped when
 * the client sends `Accept-Encoding: gzip`. Must be called before serve-handler.
 */
export function enableStaticGzip(req: IncomingMessage, res: ServerResponse): void {
  if (!acceptsGzip(req)) return;

  const chunks: Buffer[] = [];
  const pendingHeaders = new Map<string, string | string[]>();
  let ended = false;
  let statusCode = 200;
  let writeHeadCalled = false;

  const rawEnd = res.end.bind(res);
  const rawSetHeader = res.setHeader.bind(res);
  const rawGetHeader = res.getHeader.bind(res);
  const rawRemoveHeader = res.removeHeader.bind(res);
  const rawWriteHead = res.writeHead.bind(res);

  const storeHeader = (name: string, value: number | string | ReadonlyArray<string>): void => {
    pendingHeaders.set(name.toLowerCase(), headerValueToString(value));
  };

  res.setHeader = ((name: string, value: number | string | ReadonlyArray<string>) => {
    storeHeader(name, value);
    return res;
  }) as typeof res.setHeader;

  res.getHeader = ((name: string) => {
    const key = name.toLowerCase();
    if (pendingHeaders.has(key)) return pendingHeaders.get(key);
    return rawGetHeader(name);
  }) as typeof res.getHeader;

  res.removeHeader = ((name: string) => {
    pendingHeaders.delete(name.toLowerCase());
    if (!writeHeadCalled) return;
    return rawRemoveHeader(name);
  }) as typeof res.removeHeader;

  res.writeHead = ((code: number, phraseOrHeaders?: unknown, maybeHeaders?: unknown) => {
    statusCode = code;
    writeHeadCalled = true;
    res.statusCode = code;

    const applyObject = (headers: Record<string, unknown>): void => {
      for (const [key, value] of Object.entries(headers)) {
        if (value == null) continue;
        storeHeader(key, value as number | string | ReadonlyArray<string>);
      }
    };

    if (phraseOrHeaders && typeof phraseOrHeaders === 'object' && !Array.isArray(phraseOrHeaders)) {
      applyObject(phraseOrHeaders as Record<string, unknown>);
    } else if (maybeHeaders && typeof maybeHeaders === 'object' && !Array.isArray(maybeHeaders)) {
      applyObject(maybeHeaders as Record<string, unknown>);
    }

    // Defer the real writeHead until end() so we can still change encoding/length.
    return res;
  }) as typeof res.writeHead;

  res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
    const callback = typeof encoding === 'function' ? encoding : typeof cb === 'function' ? cb : undefined;
    const enc = typeof encoding === 'string' ? (encoding as BufferEncoding) : undefined;
    if (chunk != null && typeof chunk !== 'function') {
      chunks.push(toBuffer(chunk, enc));
    }
    if (typeof callback === 'function') (callback as () => void)();
    return true;
  }) as typeof res.write;

  res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown) => {
    if (ended) return res;
    ended = true;

    const callback = typeof encoding === 'function' ? encoding : typeof cb === 'function' ? cb : undefined;
    const enc = typeof encoding === 'string' ? (encoding as BufferEncoding) : undefined;
    const endCb = typeof chunk === 'function' ? chunk : callback;
    if (chunk !== undefined && typeof chunk !== 'function') {
      chunks.push(toBuffer(chunk, enc));
    }

    const body = chunks.length <= 1 ? (chunks[0] ?? Buffer.alloc(0)) : Buffer.concat(chunks);
    const contentType = pendingHeaders.get('content-type') ?? rawGetHeader('content-type');
    const alreadyEncoded = pendingHeaders.has('content-encoding') || rawGetHeader('content-encoding') != null;
    const shouldCompress =
      !alreadyEncoded &&
      statusCode === 200 &&
      isCompressibleContentType(contentType) &&
      body.length >= STATIC_GZIP_MIN_BYTES;

    let out = body;
    if (shouldCompress) {
      out = gzipSync(body, { level: 6 });
      pendingHeaders.delete('content-length');
      pendingHeaders.set('content-encoding', 'gzip');
      pendingHeaders.set('vary', mergeVaryAcceptEncoding(pendingHeaders.get('vary')));
    }

    pendingHeaders.set('content-length', String(out.length));

    const headersObject: Record<string, string | string[]> = {};
    for (const [key, value] of pendingHeaders) {
      headersObject[key] = value;
    }

    rawWriteHead(statusCode, headersObject);
    return rawEnd(out, () => {
      if (typeof endCb === 'function') (endCb as () => void)();
    });
  }) as typeof res.end;
}
