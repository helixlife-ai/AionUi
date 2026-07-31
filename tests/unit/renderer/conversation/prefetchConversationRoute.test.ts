/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateMock = vi.fn();
const refreshConversationCacheMock = vi.fn();
const setHttpRequestSignalProviderMock = vi.fn();

vi.mock('swr', () => ({
  mutate: (...args: unknown[]) => mutateMock(...args),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: (...args: unknown[]) => refreshConversationCacheMock(...args),
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  setHttpRequestSignalProvider: (...args: unknown[]) => setHttpRequestSignalProviderMock(...args),
}));

describe('prefetchConversationRoute', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    refreshConversationCacheMock.mockReset();
    setHttpRequestSignalProviderMock.mockReset();
    vi.resetModules();
  });

  it('seeds SWR conversation cache without revalidation', async () => {
    const { seedConversationCache } = await import('@/renderer/pages/conversation/utils/prefetchConversationRoute');
    const conversation = { id: 'c1', name: 'demo' } as TChatConversation;
    seedConversationCache(conversation);
    expect(mutateMock).toHaveBeenCalledWith('conversation/c1', conversation, false);
  });

  it('refreshes cache when prefetching a concrete conversation id', async () => {
    refreshConversationCacheMock.mockResolvedValue(undefined);
    const { prefetchConversationRoute } = await import('@/renderer/pages/conversation/utils/prefetchConversationRoute');
    prefetchConversationRoute('c2');
    expect(refreshConversationCacheMock).toHaveBeenCalledWith('c2');
  });

  it('aborts the previous conversation HTTP scope when adopting a new id', async () => {
    const { adoptConversationRequestScope, getConversationRequestSignal, installConversationHttpAbort } =
      await import('@/renderer/pages/conversation/utils/prefetchConversationRoute');

    const first = adoptConversationRequestScope('a');
    expect(getConversationRequestSignal()).toBe(first);
    expect(first.aborted).toBe(false);

    const second = adoptConversationRequestScope('b');
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
    expect(getConversationRequestSignal()).toBe(second);

    installConversationHttpAbort();
    expect(setHttpRequestSignalProviderMock).toHaveBeenCalledTimes(1);
    const provider = setHttpRequestSignalProviderMock.mock.calls[0][0] as () => AbortSignal;
    expect(provider()).toBe(second);
  });
});
