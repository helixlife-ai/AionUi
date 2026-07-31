/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_INITIALIZE_FETCH_TIMEOUT_MS, configService } from '@/common/config/configService';

describe('configService.initialize timeout', () => {
  beforeEach(() => {
    configService.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    configService.reset();
  });

  it('rejects a hung initialize fetch so a later bootstrap can retry', async () => {
    const fetchSpy = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        signal.addEventListener(
          'abort',
          () => {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          },
          { once: true }
        );
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const first = configService.initialize();
    const expectation = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(CONFIG_INITIALIZE_FETCH_TIMEOUT_MS + 10);
    await expectation;
    expect(configService.isInitialized()).toBe(false);

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { 'theme.activeId': 'light' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.useRealTimers();
    await expect(configService.initialize()).resolves.toBeUndefined();
    expect(configService.isInitialized()).toBe(true);
    expect(configService.get('theme.activeId' as never)).toBe('light');
  });
});
