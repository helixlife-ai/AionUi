/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** True while assistants.list SWR has not produced data yet. */
export function isAssistantsCatalogLoading(params: {
  hasData: boolean;
  isValidating: boolean;
}): boolean {
  return !params.hasData && params.isValidating;
}

/** True until the sidebar conversation store finishes its first IPC fetch. */
export function shouldShowConversationListSkeleton(params: {
  isListHydrated: boolean;
}): boolean {
  return !params.isListHydrated;
}

/**
 * True while sider chrome (logo / top nav / footer) should stay skeletoned.
 * Covers both the first history IPC fetch and the lazy history module mount.
 */
export function shouldShowSiderChromeSkeleton(params: {
  isListHydrated: boolean;
  isHistoryViewMounted: boolean;
}): boolean {
  return !params.isListHydrated || !params.isHistoryViewMounted;
}
