/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent Hub display-name overrides for built-in assistants.
 * Keeps backend `agent.type` / ACP ids unchanged; only rewrites UI labels.
 */
const DISPLAY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  'Codex CLI': 'Codex',
};

/** Rewrite known seed display names for Hub UI (e.g. Codex CLI → Codex). */
export function applyAgentHubAssistantDisplayNameOverride(name: string): string {
  return DISPLAY_NAME_OVERRIDES[name] ?? name;
}
