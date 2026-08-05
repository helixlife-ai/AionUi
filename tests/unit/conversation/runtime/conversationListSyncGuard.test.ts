/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  getSidebarStreamGuardDecision,
  shouldPreserveConversationListOnRefreshFailure,
  shouldRetryEmptyConversationListOnColdDetailRoute,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

describe('getSidebarStreamGuardDecision', () => {
  it('marks normal generating stream messages', () => {
    expect(getSidebarStreamGuardDecision({ type: 'content', completed: false })).toEqual({
      markGenerating: true,
      clearCompleted: false,
      lateIgnored: false,
    });
  });

  it('ignores late stream messages after turn completion', () => {
    expect(getSidebarStreamGuardDecision({ type: 'content', completed: true })).toEqual({
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: true,
    });
  });

  it('allows a new start event to clear the completion guard', () => {
    expect(getSidebarStreamGuardDecision({ type: 'start', completed: true })).toEqual({
      markGenerating: true,
      clearCompleted: true,
      lateIgnored: false,
    });
  });

  it('ignores non-generating messages', () => {
    expect(getSidebarStreamGuardDecision({ type: 'slash_commands_updated', completed: true })).toEqual({
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: false,
    });
  });
});

describe('shouldPreserveConversationListOnRefreshFailure', () => {
  it('preserves a hydrated list when a refresh fails transiently', () => {
    expect(shouldPreserveConversationListOnRefreshFailure(1)).toBe(true);
  });

  it('does not preserve an empty initial list', () => {
    expect(shouldPreserveConversationListOnRefreshFailure(0)).toBe(false);
  });
});


describe('shouldRetryEmptyConversationListOnColdDetailRoute', () => {
  it('retries an empty initial list while a detail route is active', () => {
    expect(
      shouldRetryEmptyConversationListOnColdDetailRoute({
        itemCount: 0,
        isListHydrated: false,
        activeConversationId: 'conversation-id',
        retryCount: 0,
      })
    ).toBe(true);
  });

  it('accepts empty lists after hydration', () => {
    expect(
      shouldRetryEmptyConversationListOnColdDetailRoute({
        itemCount: 0,
        isListHydrated: true,
        activeConversationId: 'conversation-id',
        retryCount: 0,
      })
    ).toBe(false);
  });

  it('accepts empty lists after retry limit', () => {
    expect(
      shouldRetryEmptyConversationListOnColdDetailRoute({
        itemCount: 0,
        isListHydrated: false,
        activeConversationId: 'conversation-id',
        retryCount: 3,
      })
    ).toBe(false);
  });
});
