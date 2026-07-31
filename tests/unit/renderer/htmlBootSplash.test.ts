/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INDEX_HTML = resolve(process.cwd(), 'packages/desktop/src/renderer/index.html');

describe('html boot splash (pre-JS first paint)', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');

  it('embeds a boot splash inside #root so cold start is not a blank page', () => {
    expect(html).toContain('data-testid="html-boot-splash"');
    expect(html).toMatch(/id="root"[\s\S]*data-testid="html-boot-splash"/);
  });

  it('uses skeleton-only splash without a starting modal overlay', () => {
    expect(html).not.toContain('html-boot-splash__status');
    expect(html).not.toContain('data-testid="html-boot-splash-title"');
    expect(html).not.toContain('正在启动');
  });

  it('keeps splash styles self-contained (no CSS-variable dependency for first paint)', () => {
    expect(html).toContain('.html-boot-splash');
    expect(html).toContain('--boot-bg');
    expect(html).toContain('html-boot-pulse');
  });
});
