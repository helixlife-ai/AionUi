/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import type { TChatConversation } from '@/common/config/storage';
import { mutate } from 'swr';

/** Warm the lazy conversation route chunk (idle / hover / click). */
export function prefetchConversationRouteChunk(): void {
  void import('@renderer/pages/conversation');
}

/**
 * Seed SWR with a known conversation (e.g. from the sidebar list) so
 * `/conversation/:id` can paint ChatLayout immediately instead of a blank Spin.
 */
export function seedConversationCache(conversation: TChatConversation): void {
  void mutate(`conversation/${conversation.id}`, conversation, false);
}

/** Prefetch chunk + optionally refresh authoritative conversation metadata. */
export function prefetchConversationRoute(conversation_id?: string): void {
  prefetchConversationRouteChunk();
  if (conversation_id) {
    void refreshConversationCache(conversation_id);
  }
}
