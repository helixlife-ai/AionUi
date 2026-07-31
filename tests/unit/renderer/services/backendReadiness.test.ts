/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  probeBackendReady,
  shouldLoadHeavyCatalogs,
  waitForBackendReady,
} from '@/renderer/services/backendReadiness';

describe('backendReadiness', () => {
  it('probeBackendReady returns true on HTTP 2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(probeBackendReady({ fetchImpl, timeoutMs: 500 })).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/settings/client',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('probeBackendReady returns false on HTTP errors and network failures', async () => {
    await expect(
      probeBackendReady({
        fetchImpl: vi.fn().mockResolvedValue(new Response('nope', { status: 502 })),
        timeoutMs: 500,
      })
    ).resolves.toBe(false);

    await expect(
      probeBackendReady({
        fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
        timeoutMs: 500,
      })
    ).resolves.toBe(false);
  });

  it('waitForBackendReady resolves after a successful probe', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 502 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const attempts: number[] = [];

    const result = await waitForBackendReady({
      fetchImpl,
      intervalMs: 5,
      timeoutMs: 200,
      onAttempt: (n) => attempts.push(n),
    });

    expect(result).toEqual({ ready: true, timedOut: false });
    expect(attempts).toEqual([1, 2]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('waitForBackendReady times out instead of hanging forever', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 502 }));
    const result = await waitForBackendReady({
      fetchImpl,
      intervalMs: 5,
      timeoutMs: 20,
      maxWaitMs: 40,
    });
    expect(result).toEqual({ ready: false, timedOut: true });
  });

  it('waitForBackendReady aborts when signal is aborted', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 502 }));
    const pending = waitForBackendReady({
      fetchImpl,
      signal: controller.signal,
      intervalMs: 50,
      timeoutMs: 100,
      maxWaitMs: 10_000,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('shouldLoadHeavyCatalogs waits for conversation list hydration', () => {
    expect(shouldLoadHeavyCatalogs(false)).toBe(false);
    expect(shouldLoadHeavyCatalogs(true)).toBe(true);
  });
});
