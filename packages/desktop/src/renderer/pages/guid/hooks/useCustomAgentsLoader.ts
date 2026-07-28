/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { getAgentHubConversationAssistantCatalog } from '@/renderer/utils/hub/agentHubAssistantCatalog';
import { isAssistantsCatalogLoading } from '@/renderer/utils/ui/loadingPlaceholders';
import { useEffect } from 'react';
import useSWR, { mutate as swrMutate } from 'swr';

type UseCustomAgentsLoaderResult = {
  /**
   * Preset assistant catalog returned by the backend — merged builtin + user +
   * extension, already sorted. This is the list the Guid pill bar and the
   * Settings list render.
   */
  assistants: Assistant[];
  /** True until the first assistants.list response arrives. */
  isLoading: boolean;
};

/**
 * Loads the assistant catalog consumed by Guid. Phase 2 removes `/api/agents`
 * as a user-facing candidate source, so this hook intentionally exposes only
 * the assistant list shared with settings/conversation flows.
 */
export const useCustomAgentsLoader = (): UseCustomAgentsLoaderResult => {
  // Preset assistants share their own cache so settings / guid / conversation
  // all see the same list without duplicate HTTP calls.
  const { data: assistantList, isLoading, isValidating } = useSWR('assistants.list', async () => {
    try {
      return await ipcBridge.assistants.list.invoke();
    } catch (error) {
      console.error('Failed to load assistants:', error);
      return [] as Assistant[];
    }
  });
  // Agent Hub: hide the built-in Aion CLI entry from the assistant catalog.
  const assistants = getAgentHubConversationAssistantCatalog(assistantList ?? []);

  useEffect(() => {
    void swrMutate('assistants.list');
  }, []);

  return {
    assistants,
    isLoading: isAssistantsCatalogLoading({
      hasData: assistantList !== undefined,
      // Prefer SWR isLoading; fall back to isValidating for older SWR semantics.
      isValidating: isLoading || isValidating,
    }),
  };
};
