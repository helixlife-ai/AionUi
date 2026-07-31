/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Per-probe fetch timeout — keep short so the UI can show progress ticks. */
export const BACKEND_READINESS_PROBE_TIMEOUT_MS = 3_000;

/** Delay between failed probes while the appliance aioncore is still warming. */
export const BACKEND_READINESS_POLL_INTERVAL_MS = 1_500;

/**
 * Give up waiting and let the shell try to boot anyway.
 * Appliance cold start can take ~3 minutes; this leaves headroom without
 * trapping the user on the warming screen forever if the probe path is wrong.
 */
export const BACKEND_READINESS_MAX_WAIT_MS = 5 * 60_000;

/**
 * Endpoint that reaches aioncore via web-host proxy (not `/api/identity`, which
 * is answered by web-host even when the backend is still cold).
 */
export const BACKEND_READINESS_PROBE_PATH = '/api/settings/client';

export type ProbeBackendReadyOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  path?: string;
};

/**
 * One short attempt: true when the backend answers HTTP 2xx.
 * Abort / network / non-2xx → false (never throws for those cases).
 */
export async function probeBackendReady(options: ProbeBackendReadyOptions = {}): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? BACKEND_READINESS_PROBE_TIMEOUT_MS;
  const path = options.path ?? BACKEND_READINESS_PROBE_PATH;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onOuterAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    if (options.signal?.aborted) return false;
    const response = await fetchImpl(path, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

export type WaitForBackendReadyOptions = {
  signal?: AbortSignal;
  intervalMs?: number;
  timeoutMs?: number;
  maxWaitMs?: number;
  fetchImpl?: typeof fetch;
  path?: string;
  onAttempt?: (attempt: number) => void;
};

export type WaitForBackendReadyResult = {
  ready: boolean;
  /** True when we stopped because `maxWaitMs` elapsed without a successful probe. */
  timedOut: boolean;
};

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Poll until `probeBackendReady` succeeds, `maxWaitMs` elapses, or `signal` aborts.
 * Throws AbortError when cancelled. On max-wait timeout returns `{ ready: false, timedOut: true }`
 * so the shell can still attempt bootstrap instead of hanging forever.
 */
export async function waitForBackendReady(
  options: WaitForBackendReadyOptions = {}
): Promise<WaitForBackendReadyResult> {
  const intervalMs = options.intervalMs ?? BACKEND_READINESS_POLL_INTERVAL_MS;
  const maxWaitMs = options.maxWaitMs ?? BACKEND_READINESS_MAX_WAIT_MS;
  const startedAt = Date.now();
  let attempt = 0;

  while (true) {
    if (options.signal?.aborted) {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    }
    attempt += 1;
    options.onAttempt?.(attempt);
    const ok = await probeBackendReady({
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
      path: options.path,
    });
    if (ok) return { ready: true, timedOut: false };
    if (Date.now() - startedAt >= maxWaitMs) {
      return { ready: false, timedOut: true };
    }
    await delay(intervalMs, options.signal);
  }
}

/** True when heavy catalogs (assistants / agents management) may start fetching. */
export function shouldLoadHeavyCatalogs(isConversationListHydrated: boolean): boolean {
  return isConversationListHydrated;
}
