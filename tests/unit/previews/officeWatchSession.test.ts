/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetOfficeWatchExclusiveQueueForTests,
  runExclusiveOfficeWatch,
  startOfficeWatchRequest,
  stopOfficeWatchRequest,
} from '@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer/officeWatchSession';

describe('officeWatchSession', () => {
  beforeEach(() => {
    resetOfficeWatchExclusiveQueueForTests();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetOfficeWatchExclusiveQueueForTests();
  });

  it('runs exclusive tasks serially so the next start waits for the previous stop', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runExclusiveOfficeWatch(async () => {
      order.push('first-start');
      await firstGate;
      order.push('first-end');
    });

    const second = runExclusiveOfficeWatch(async () => {
      order.push('second');
    });

    await Promise.resolve();
    expect(order).toEqual(['first-start']);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  it('aborts the in-flight start fetch when the timeout fires', async () => {
    let fetchedSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        fetchedSignal = init?.signal as AbortSignal | undefined;
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          if (signal.aborted) {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            return;
          }
          signal.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
            { once: true }
          );
        });
      })
    );

    const controller = new AbortController();
    const startPromise = startOfficeWatchRequest(
      'excel',
      { file_path: '/agent_hub/a.xlsx' },
      { signal: controller.signal, timeoutMs: 20 }
    );

    await expect(startPromise).rejects.toMatchObject({ code: 'OFFICECLI_PORT_TIMEOUT' });
    expect(fetchedSignal?.aborted).toBe(true);
  });

  it('aborts start when the caller signal aborts and does not report a port timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        });
      })
    );

    const controller = new AbortController();
    const startPromise = startOfficeWatchRequest(
      'excel',
      { file_path: '/agent_hub/a.xlsx' },
      { signal: controller.signal, timeoutMs: 5_000 }
    );

    queueMicrotask(() => controller.abort());
    await expect(startPromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('posts stop without the conversation default signal so cleanup can finish', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { setHttpRequestSignalProvider } = await import('@/common/adapter/httpBridge');
    const conversation = new AbortController();
    conversation.abort();
    setHttpRequestSignalProvider(() => conversation.signal);

    await stopOfficeWatchRequest('excel', { file_path: '/agent_hub/a.xlsx' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('/api/excel-preview/stop');
    const used = fetchSpy.mock.calls[0][1]?.signal as AbortSignal;
    expect(used.aborted).toBe(false);
    setHttpRequestSignalProvider(null);
  });

  it('does not bind office start to the conversation default signal', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { url: '/api/office-watch-proxy/1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { setHttpRequestSignalProvider } = await import('@/common/adapter/httpBridge');
    const conversation = new AbortController();
    conversation.abort();
    setHttpRequestSignalProvider(() => conversation.signal);

    const local = new AbortController();
    await expect(
      startOfficeWatchRequest('word', { file_path: '/agent_hub/a.docx' }, { signal: local.signal, timeoutMs: 5_000 })
    ).resolves.toMatchObject({ url: '/api/office-watch-proxy/1' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('/api/word-preview/start');
    expect((fetchSpy.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(false);
    setHttpRequestSignalProvider(null);
  });
});
