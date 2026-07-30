/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateMock = vi.fn();
const refreshConversationCacheMock = vi.fn();

vi.mock('swr', () => ({
  mutate: (...args: unknown[]) => mutateMock(...args),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: (...args: unknown[]) => refreshConversationCacheMock(...args),
}));

describe('prefetchConversationRoute', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    refreshConversationCacheMock.mockReset();
    vi.resetModules();
  });

  it('seeds SWR conversation cache without revalidation', async () => {
    const { seedConversationCache } = await import(
      '@/renderer/pages/conversation/utils/prefetchConversationRoute'
    );
    const conversation = { id: 'c1', name: 'demo' } as TChatConversation;
    seedConversationCache(conversation);
    expect(mutateMock).toHaveBeenCalledWith('conversation/c1', conversation, false);
  });

  it('refreshes cache when prefetching a concrete conversation id', async () => {
    refreshConversationCacheMock.mockResolvedValue(undefined);
    const { prefetchConversationRoute } = await import(
      '@/renderer/pages/conversation/utils/prefetchConversationRoute'
    );
    prefetchConversationRoute('c2');
    expect(refreshConversationCacheMock).toHaveBeenCalledWith('c2');
  });
});
