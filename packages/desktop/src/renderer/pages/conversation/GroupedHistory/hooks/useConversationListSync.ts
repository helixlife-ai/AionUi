/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isHttpAbortError } from '@/common/adapter/httpBridge';
import type { TChatConversation } from '@/common/config/storage';
import { addEventListener } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Whitelist of message types that indicate content generation is in progress.
 * Only these types should trigger the sidebar loading spinner.
 * Using a whitelist (instead of a blacklist) prevents unknown/internal message
 * types (e.g. slash_commands_updated, acp_context_usage) from falsely
 * triggering the generating state.
 */
const isGeneratingStreamMessage = (type: string): boolean => {
  return (
    type === 'content' ||
    type === 'start' ||
    type === 'thought' ||
    type === 'thinking' ||
    type === 'tool_group' ||
    // Direct-CLI (non-ACP) sessions stream individual `tool_call` frames
    // instead of `tool_group` — measured live: 31 of 34 frames in a 55s tool
    // stretch were `tool_call`. Without this, long tool runs on direct-CLI
    // backends can leave the sidebar spinner dark for the whole stretch.
    type === 'tool_call' ||
    type === 'acp_tool_call' ||
    type === 'acp_permission' ||
    type === 'permission' ||
    type === 'plan'
  );
};

const isTerminalAgentStatus = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const { status } = data as { status?: string };
  return status === 'error' || status === 'disconnected';
};

const isTerminalStreamMessage = (message: { type: string; data: unknown }): boolean => {
  return (
    message.type === 'finish' ||
    message.type === 'error' ||
    (message.type === 'agent_status' && isTerminalAgentStatus(message.data))
  );
};

const isTerminalTurnState = (state: string): boolean => {
  return state === 'ai_waiting_input' || state === 'error' || state === 'stopped';
};

export type SidebarStreamGuardDecision = {
  markGenerating: boolean;
  clearCompleted: boolean;
  lateIgnored: boolean;
};

export const getSidebarStreamGuardDecision = ({
  type,
  completed,
  completedTurnId,
  streamTurnId,
}: {
  type: string;
  completed: boolean;
  /** Turn whose completion set the `completed` flag, when known. */
  completedTurnId?: string | null;
  /** Turn the incoming stream frame belongs to, when known. */
  streamTurnId?: string | null;
}): SidebarStreamGuardDecision => {
  if (!isGeneratingStreamMessage(type)) {
    return {
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: false,
    };
  }

  if (type === 'start') {
    return {
      markGenerating: true,
      clearCompleted: true,
      lateIgnored: false,
    };
  }

  if (completed) {
    // A frame from a DIFFERENT turn than the one that completed is not late —
    // it belongs to a newer turn. codex keeps streaming after ending its
    // prompt turn (unified exec runs the command in a background PTY), so the
    // old turn's completion used to swallow the next turn's whole stream and
    // the sidebar never lit up as generating.
    const isNewerTurn =
      typeof streamTurnId === 'string' &&
      streamTurnId.length > 0 &&
      typeof completedTurnId === 'string' &&
      completedTurnId.length > 0 &&
      streamTurnId !== completedTurnId;
    if (!isNewerTurn) {
      return {
        markGenerating: false,
        clearCompleted: false,
        lateIgnored: true,
      };
    }
    return {
      markGenerating: true,
      clearCompleted: true,
      lateIgnored: false,
    };
  }

  return {
    markGenerating: true,
    clearCompleted: false,
    lateIgnored: false,
  };
};

type ConversationListSyncSnapshot = {
  conversations: TChatConversation[];
  generatingConversationIds: Set<string>;
  completionUnreadConversationIds: Set<string>;
  isListHydrated: boolean;
  isHistoryViewMounted: boolean;
};

const listeners = new Set<() => void>();

let isStoreInitialized = false;
let isListHydratedState = false;
let isHistoryViewMountedState = false;
let conversationsState: TChatConversation[] = [];
let generatingConversationIdsState = new Set<string>();
let completionUnreadConversationIdsState = new Set<string>();
let manualUnreadConversationIdsState = readStoredManualUnread();
let completedConversationIdsState = new Set<string>();
let conversation_idsState = new Set<string>();
// Full id → owning project_id map over ALL loaded conversations (incl. the team
// member rows filtered out of `conversationsState`). Every row from
// GET /api/conversations carries project_id, so this lets the route publish the
// active project synchronously on switch — no waiting for the per-conversation
// `conversation.get` to resolve (that async lag painted the previous project's
// tree). `null` = known conversation with no project (or project_id not yet
// backfilled); a missing key = not loaded yet (caller placeholders).
let projectIdByIdState = new Map<string, string | null>();
let activeConversationIdState: string | null = null;
let emptyRefreshRetryTimer: number | null = null;
let emptyRefreshRetryCount = 0;
let snapshotState: ConversationListSyncSnapshot = {
  conversations: conversationsState,
  generatingConversationIds: generatingConversationIdsState,
  completionUnreadConversationIds: completionUnreadConversationIdsState,
  isListHydrated: isListHydratedState,
  isHistoryViewMounted: isHistoryViewMountedState,
};

const emitStoreChange = () => {
  snapshotState = {
    conversations: conversationsState,
    generatingConversationIds: generatingConversationIdsState,
    completionUnreadConversationIds: completionUnreadConversationIdsState,
    isListHydrated: isListHydratedState,
    isHistoryViewMounted: isHistoryViewMountedState,
  };
  listeners.forEach((listener) => listener());
};

const subscribeConversationListSync = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getConversationListSyncSnapshot = (): ConversationListSyncSnapshot => snapshotState;

export function shouldPreserveConversationListOnRefreshFailure(existingCount: number): boolean {
  return existingCount > 0;
}

const EMPTY_REFRESH_RETRY_LIMIT = 3;

export function shouldRetryEmptyConversationListOnColdDetailRoute({
  itemCount,
  isListHydrated,
  activeConversationId,
  retryCount,
}: {
  itemCount: number;
  isListHydrated: boolean;
  activeConversationId: string | null;
  retryCount: number;
}): boolean {
  return itemCount === 0 && !isListHydrated && Boolean(activeConversationId) && retryCount < EMPTY_REFRESH_RETRY_LIMIT;
}

export function shouldRetryConversationListRefreshFailure({
  error,
  retryCount,
}: {
  error: unknown;
  retryCount: number;
}): boolean {
  return isHttpAbortError(error) && retryCount < EMPTY_REFRESH_RETRY_LIMIT;
}

const getActiveConversationId = (): string | null => {
  if (activeConversationIdState) return activeConversationIdState;
  if (typeof window === 'undefined') return null;

  const match = window.location.pathname.match(/^\/conversation\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const scheduleConversationListRefreshRetry = () => {
  if (emptyRefreshRetryTimer !== null) return;
  emptyRefreshRetryCount += 1;
  emptyRefreshRetryTimer = window.setTimeout(() => {
    emptyRefreshRetryTimer = null;
    refreshConversations();
  }, 500);
};

const refreshConversations = () => {
  void ipcBridge.database.getUserConversations
    .invoke({ limit: 10000 })
    .then((result) => {
      const items = result?.items;
      if (items && Array.isArray(items)) {
        if (
          shouldRetryEmptyConversationListOnColdDetailRoute({
            itemCount: items.length,
            isListHydrated: isListHydratedState,
            activeConversationId: getActiveConversationId(),
            retryCount: emptyRefreshRetryCount,
          })
        ) {
          scheduleConversationListRefreshRetry();
          return;
        }

        emptyRefreshRetryCount = 0;
        const filteredData = items.filter((conv) => {
          // Legacy rows from the pre-provider-probe health check flow are hidden
          // from normal history. New health checks must not create conversations.
          const extra = conv.extra as { is_health_check?: boolean; team_id?: string; teamId?: string } | undefined;
          return extra?.is_health_check !== true && !extra?.team_id && !extra?.teamId;
        });
        conversationsState = filteredData;
        // Use ALL conversation IDs (including team/legacy health-check rows) so the
        // responseStream listener recognises them as known and doesn't
        // trigger an infinite refreshConversations loop.
        conversation_idsState = new Set(items.map((conversation) => conversation.id));
        isListHydratedState = true;
        emitStoreChange();
        return;
      }

      conversationsState = [];
      conversation_idsState = new Set();
      isListHydratedState = true;
      emitStoreChange();
    })
    .catch((error) => {
      if (shouldRetryConversationListRefreshFailure({ error, retryCount: emptyRefreshRetryCount })) {
        console.debug('[WorkspaceGroupedHistory] Conversation list refresh aborted, retrying:', error);
        scheduleConversationListRefreshRetry();
        return;
      }

      console.error('[WorkspaceGroupedHistory] Failed to load conversations:', error);
      if (!shouldPreserveConversationListOnRefreshFailure(conversationsState.length)) {
        conversationsState = [];
        conversation_idsState = new Set();
      }
      isListHydratedState = true;
      emitStoreChange();
    });
};

/** Source of a generating-state transition, logged for field diagnosis. */
type GeneratingTransitionSource = 'stream' | 'reconcile' | 'terminal' | 'turnCompleted' | 'deleted';

const logGeneratingTransition = (conversation_id: string, next: boolean, source: GeneratingTransitionSource) => {
  void ipcBridge.application.writeRendererLog
    .invoke({
      level: 'info',
      tag: 'conversationListSync',
      message: next ? 'sidebar_generating_on' : 'sidebar_generating_off',
      data: {
        conversation_id,
        source,
      },
    })
    .catch(() => {});
};

const markGenerating = (conversation_id: string, source: GeneratingTransitionSource = 'stream') => {
  if (generatingConversationIdsState.has(conversation_id)) {
    return;
  }

  generatingConversationIdsState = new Set(generatingConversationIdsState).add(conversation_id);
  logGeneratingTransition(conversation_id, true, source);
  emitStoreChange();
};

const clearGenerating = (conversation_id: string, source: GeneratingTransitionSource = 'terminal') => {
  if (!generatingConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(generatingConversationIdsState);
  next.delete(conversation_id);
  generatingConversationIdsState = next;
  logGeneratingTransition(conversation_id, false, source);
  emitStoreChange();
};

/**
 * Pure decision helper: whether a runtime summary's `is_processing` bit
 * should light the sidebar spinner. Clearing is intentionally NOT handled
 * here (and never by this reconcile path) — an idle-looking runtime summary
 * must not fight a live background stream that's still mid-flight; only
 * terminal stream frames / turn.completed are allowed to clear the flag.
 */
export const shouldReconcileMarkGenerating = (isProcessing: boolean): boolean => isProcessing === true;

/**
 * Reconciles the sidebar spinner with authoritative runtime state (e.g. a
 * per-conversation hydrate or send-accepted response). Call this whenever a
 * runtime summary's `is_processing` bit is in hand for a conversation — it
 * covers the case where a WS stream frame was missed (window reload/reconnect
 * race) and the store would otherwise never know the turn is still running.
 */
export const reconcileGeneratingFromRuntime = (conversation_id: string, isProcessing: boolean): void => {
  if (!conversation_id) {
    return;
  }
  if (shouldReconcileMarkGenerating(isProcessing)) {
    markGenerating(conversation_id, 'reconcile');
  }
};

const markCompletionUnread = (conversation_id: string) => {
  if (completionUnreadConversationIdsState.has(conversation_id)) {
    return;
  }

  completionUnreadConversationIdsState = new Set(completionUnreadConversationIdsState).add(conversation_id);
  emitStoreChange();
};

const clearCompletionUnreadState = (conversation_id: string) => {
  if (!completionUnreadConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(completionUnreadConversationIdsState);
  next.delete(conversation_id);
  completionUnreadConversationIdsState = next;
  emitStoreChange();
};

const markManualUnreadState = (conversation_id: string) => {
  if (manualUnreadConversationIdsState.has(conversation_id)) {
    return;
  }

  manualUnreadConversationIdsState = new Set(manualUnreadConversationIdsState).add(conversation_id);
  persistManualUnread();
  emitStoreChange();
};

const clearManualUnreadState = (conversation_id: string) => {
  if (!manualUnreadConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(manualUnreadConversationIdsState);
  next.delete(conversation_id);
  manualUnreadConversationIdsState = next;
  persistManualUnread();
  emitStoreChange();
};

/** Turn id that put a conversation into the `completed` set (for turn-aware
 *  late-frame detection). */
const completedTurnIdByConversation = new Map<string, string | null>();

const markCompleted = (conversation_id: string, turn_id?: string | null) => {
  completedConversationIdsState = new Set(completedConversationIdsState).add(conversation_id);
  completedTurnIdByConversation.set(conversation_id, turn_id ?? null);
};

const clearCompleted = (conversation_id: string) => {
  if (!completedConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(completedConversationIdsState);
  next.delete(conversation_id);
  completedConversationIdsState = next;
  completedTurnIdByConversation.delete(conversation_id);
};

const logLateStreamIgnored = (conversation_id: string, type: string) => {
  void ipcBridge.application.writeRendererLog
    .invoke({
      level: 'warn',
      tag: 'conversationRuntimeView',
      message: 'late_stream_ignored_for_runtime',
      data: {
        conversation_id,
        stream_type: type,
      },
    })
    .catch(() => {});
};

const setActiveConversationState = (conversation_id: string | null) => {
  activeConversationIdState = conversation_id;
};

const setHistoryViewMountedState = (mounted: boolean) => {
  if (isHistoryViewMountedState === mounted) {
    return;
  }
  isHistoryViewMountedState = mounted;
  emitStoreChange();
};

const initializeConversationListSyncStore = () => {
  if (isStoreInitialized) {
    return;
  }

  isStoreInitialized = true;
  refreshConversations();

  addEventListener('chat.history.refresh', refreshConversations);
  ipcBridge.conversation.listChanged.on((event) => {
    if (event.action === 'deleted') {
      clearGenerating(event.conversation_id, 'deleted');
      clearCompletionUnreadState(event.conversation_id);
      clearManualUnreadState(event.conversation_id);
      clearCompleted(event.conversation_id);
    }
    refreshConversations();
  });
  ipcBridge.conversation.responseStream.on((message) => {
    const conversation_id = message.conversation_id;
    if (!conversation_id) {
      return;
    }

    if (!conversation_idsState.has(conversation_id)) {
      refreshConversations();
    }

    if (isTerminalStreamMessage(message)) {
      const wasGenerating = generatingConversationIdsState.has(conversation_id);
      if (wasGenerating && activeConversationIdState !== conversation_id) {
        markCompletionUnread(conversation_id);
      }
      clearGenerating(conversation_id, 'terminal');
      return;
    }

    const decision = getSidebarStreamGuardDecision({
      type: message.type,
      completed: completedConversationIdsState.has(conversation_id),
      completedTurnId: completedTurnIdByConversation.get(conversation_id) ?? null,
      streamTurnId: message.turn_id ?? null,
    });
    if (decision.clearCompleted) {
      clearCompleted(conversation_id);
    }
    if (decision.lateIgnored) {
      logLateStreamIgnored(conversation_id, message.type);
      return;
    }
    if (decision.markGenerating) {
      markGenerating(conversation_id, 'stream');
    }
  });
  ipcBridge.conversation.turnCompleted.on((event) => {
    if (isTerminalTurnState(event.state) && activeConversationIdState !== event.session_id) {
      markCompletionUnread(event.session_id);
    }
    markCompleted(event.session_id, event.turn_id);
    clearGenerating(event.session_id, 'turnCompleted');
    refreshConversations();
  });
};

export const useConversationListSync = () => {
  useEffect(() => {
    initializeConversationListSyncStore();
  }, []);

  const {
    conversations,
    generatingConversationIds,
    completionUnreadConversationIds,
    isListHydrated,
    isHistoryViewMounted,
  } = useSyncExternalStore(
    subscribeConversationListSync,
    getConversationListSyncSnapshot,
    getConversationListSyncSnapshot
  );

  const clearCompletionUnread = useCallback((conversation_id: string) => {
    clearCompletionUnreadState(conversation_id);
  }, []);

  const markManualUnread = useCallback((conversation_id: string) => {
    markManualUnreadState(conversation_id);
  }, []);

  const clearManualUnread = useCallback((conversation_id: string) => {
    clearManualUnreadState(conversation_id);
  }, []);

  const setActiveConversation = useCallback((conversation_id: string | null) => {
    setActiveConversationState(conversation_id);
  }, []);

  const setHistoryViewMounted = useCallback((mounted: boolean) => {
    setHistoryViewMountedState(mounted);
  }, []);

  const isConversationGenerating = useCallback(
    (conversation_id: string) => {
      return generatingConversationIds.has(conversation_id);
    },
    [generatingConversationIds]
  );

  const hasCompletionUnread = useCallback(
    (conversation_id: string) => {
      return completionUnreadConversationIds.has(conversation_id);
    },
    [completionUnreadConversationIds]
  );

  const isManualUnread = useCallback(
    (conversation_id: string) => {
      return manualUnreadConversationIds.has(conversation_id);
    },
    [manualUnreadConversationIds]
  );

  return {
    conversations,
    isListHydrated,
    isHistoryViewMounted,
    isConversationGenerating,
    hasCompletionUnread,
    clearCompletionUnread,
    isManualUnread,
    markManualUnread,
    clearManualUnread,
    setActiveConversation,
    setHistoryViewMounted,
  };
};
