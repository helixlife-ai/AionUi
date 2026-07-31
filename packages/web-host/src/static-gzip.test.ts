/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { acceptsGzip, isCompressibleContentType } from './static-gzip.js';

describe('static-gzip helpers', () => {
  it('accepts gzip from Accept-Encoding', () => {
    expect(acceptsGzip({ headers: { 'accept-encoding': 'gzip, deflate' } } as IncomingMessage)).toBe(true);
    expect(acceptsGzip({ headers: { 'accept-encoding': 'br, gzip;q=0.8' } } as IncomingMessage)).toBe(true);
    expect(acceptsGzip({ headers: { 'accept-encoding': 'identity' } } as IncomingMessage)).toBe(false);
    expect(acceptsGzip({ headers: {} } as IncomingMessage)).toBe(false);
  });

  it('detects compressible content types', () => {
    expect(isCompressibleContentType('application/javascript; charset=utf-8')).toBe(true);
    expect(isCompressibleContentType('text/css')).toBe(true);
    expect(isCompressibleContentType('text/html; charset=utf-8')).toBe(true);
    expect(isCompressibleContentType('image/png')).toBe(false);
    expect(isCompressibleContentType(undefined)).toBe(false);
  });
});
