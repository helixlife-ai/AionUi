/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import type { TChatConversation } from '@/common/config/storage';
import { setHttpRequestSignalProvider } from '@/common/adapter/httpBridge';
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

/**
 * Conversation-scoped HTTP abort.
 *
 * Switching conversations used to leave workspace / office / lease / messages
 * fetches pending, which saturates the browser's ~6 HTTP/1.1 slots per host so
 * the next conversation stays on skeleton until a full refresh aborts them.
 */
let activeConversationId: string | null = null;
let conversationRequestController = new AbortController();

export function getConversationRequestSignal(): AbortSignal {
  return conversationRequestController.signal;
}

/**
 * Abort in-flight conversation HTTP when navigating to a different conversation
 * (or leaving conversation routes). Safe to call during `useLayoutEffect`.
 */
export function adoptConversationRequestScope(conversationId: string | null): AbortSignal {
  if (conversationId === activeConversationId && !conversationRequestController.signal.aborted) {
    return conversationRequestController.signal;
  }
  conversationRequestController.abort();
  conversationRequestController = new AbortController();
  activeConversationId = conversationId;
  return conversationRequestController.signal;
}

/** Wire httpBridge default signal to the active conversation scope (once at app boot). */
export function installConversationHttpAbort(): void {
  setHttpRequestSignalProvider(() => conversationRequestController.signal);
}
