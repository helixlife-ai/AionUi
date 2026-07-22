/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isAionrsAssistant, type Assistant } from '@/common/types/agent/assistantTypes';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';

/**
 * Assistant catalog shared by Guid agentSelection and channel assistant pickers.
 * Mirrors `useCustomAgentsLoader` + `AssistantSelectionArea` filtering/order.
 */
export function getAgentHubConversationAssistantCatalog(assistants: Assistant[]): Assistant[] {
  return selectableAssistants(assistants.filter((assistant) => !isAionrsAssistant(assistant)));
}
