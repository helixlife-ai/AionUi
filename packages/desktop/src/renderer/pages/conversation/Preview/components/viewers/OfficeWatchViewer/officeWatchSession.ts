/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest, isHttpAbortError } from '@/common/adapter/httpBridge';

export type OfficeDocType = 'ppt' | 'word' | 'excel';

export type OfficeWatchStartResult = {
  url: string;
  error?: string;
};

/** Bound hung `officecli watch` starts so the UI does not spin forever. */
export const OFFICE_PREVIEW_START_TIMEOUT_MS = 45_000;

/** Cap stop latency so a hung stop cannot block the next start forever. */
export const OFFICE_PREVIEW_STOP_TIMEOUT_MS = 8_000;

const START_PATH: Record<OfficeDocType, string> = {
  ppt: '/api/ppt-preview/start',
  word: '/api/word-preview/start',
  excel: '/api/excel-preview/start',
};

const STOP_PATH: Record<OfficeDocType, string> = {
  ppt: '/api/ppt-preview/stop',
  word: '/api/word-preview/stop',
  excel: '/api/excel-preview/stop',
};

let exclusiveTail: Promise<unknown> = Promise.resolve();

/**
 * Serialize officecli start/stop across all Office viewers.
 *
 * Rapid file switches otherwise overlap watch processes and leave proxy
 * SSE/ping connections occupying the browser's per-host HTTP/1.1 pool.
 */
export function runExclusiveOfficeWatch<T>(task: () => Promise<T>): Promise<T> {
  const run = exclusiveTail.then(task, task);
  exclusiveTail = run.then(
    (): undefined => undefined,
    (): undefined => undefined
  );
  return run;
}

/** Test helper: reset the exclusive queue between cases. */
export function resetOfficeWatchExclusiveQueueForTests(): void {
  exclusiveTail = Promise.resolve();
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  const active = signals.filter((signal) => signal);
  if (active.length === 0) {
    return new AbortController().signal;
  }
  if (active.length === 1) {
    return active[0];
  }
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(active);
  }
  // Older runtimes: abort the synthetic controller when any input aborts.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

/**
 * Start officecli watch. On timeout the in-flight fetch is aborted so the
 * connection slot is released (Promise.race alone leaves the request pending).
 */
export async function startOfficeWatchRequest(
  docType: OfficeDocType,
  params: { file_path: string; workspace?: string },
  options: { signal: AbortSignal; timeoutMs?: number }
): Promise<OfficeWatchStartResult> {
  const timeoutMs = options.timeoutMs ?? OFFICE_PREVIEW_START_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const combined = combineSignals([options.signal, timeoutController.signal]);

  try {
    // Opt out of conversation-scoped abort: same-workspace chat switches keep
    // the preview mounted, and killing start mid-flight left the UI spinning.
    // File switches still abort via `options.signal`; unmount cleanup stops.
    return await httpRequest<OfficeWatchStartResult>('POST', START_PATH[docType], params, {
      signal: combined,
      useDefaultSignal: false,
    });
  } catch (error) {
    if (timeoutController.signal.aborted && !options.signal.aborted) {
      throw Object.assign(new Error('OFFICECLI_PORT_TIMEOUT'), { code: 'OFFICECLI_PORT_TIMEOUT' });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stop officecli watch without using the conversation-scoped default signal,
 * so cleanup can finish even while conversation HTTP is being aborted.
 */
export async function stopOfficeWatchRequest(
  docType: OfficeDocType,
  params: { file_path: string },
  options?: { timeoutMs?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? OFFICE_PREVIEW_STOP_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await httpRequest<void>('POST', STOP_PATH[docType], params, {
      signal: controller.signal,
      useDefaultSignal: false,
    });
  } catch (error) {
    if (isHttpAbortError(error)) return;
    // Best-effort cleanup — next start still proceeds.
  } finally {
    clearTimeout(timer);
  }
}
