/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { applyAgentHubAssistantDisplayNameOverride } from '@/renderer/utils/hub/assistantDisplayNameOverride';

type AssistantNameSource = Pick<Assistant, 'id' | 'name' | 'name_i18n'>;

export function resolveAssistantName(
  assistant: AssistantNameSource | null | undefined,
  localeKey: string,
  fallback = 'Assistant'
): string {
  if (!assistant) {
    return fallback;
  }

  const localizedName = assistant.name_i18n?.[localeKey] || assistant.name_i18n?.['en-US'];
  const rawName = localizedName?.trim() || assistant.name?.trim() || assistant.id || fallback;
  return applyAgentHubAssistantDisplayNameOverride(rawName);
}
