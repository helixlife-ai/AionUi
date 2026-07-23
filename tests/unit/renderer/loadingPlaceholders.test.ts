/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isAssistantsCatalogLoading,
  shouldShowConversationListSkeleton,
  shouldShowSiderChromeSkeleton,
} from '@/renderer/utils/ui/loadingPlaceholders';
import { describe, expect, it } from 'vitest';

describe('loadingPlaceholders', () => {
  it('treats assistants as loading only before the first catalog payload', () => {
    expect(isAssistantsCatalogLoading({ hasData: false, isValidating: true })).toBe(true);
    expect(isAssistantsCatalogLoading({ hasData: true, isValidating: true })).toBe(false);
    expect(isAssistantsCatalogLoading({ hasData: false, isValidating: false })).toBe(false);
  });

  it('shows the conversation-list skeleton until the store is hydrated', () => {
    expect(shouldShowConversationListSkeleton({ isListHydrated: false })).toBe(true);
    expect(shouldShowConversationListSkeleton({ isListHydrated: true })).toBe(false);
  });

  it('keeps sider chrome skeletoned until history view is mounted and hydrated', () => {
    expect(shouldShowSiderChromeSkeleton({ isListHydrated: false, isHistoryViewMounted: false })).toBe(true);
    expect(shouldShowSiderChromeSkeleton({ isListHydrated: true, isHistoryViewMounted: false })).toBe(true);
    expect(shouldShowSiderChromeSkeleton({ isListHydrated: false, isHistoryViewMounted: true })).toBe(true);
    expect(shouldShowSiderChromeSkeleton({ isListHydrated: true, isHistoryViewMounted: true })).toBe(false);
  });
});
