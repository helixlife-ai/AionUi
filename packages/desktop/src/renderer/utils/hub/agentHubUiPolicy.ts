/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Agent Hub: hide end-user model pickers on guid and conversation surfaces. */
export function isAgentHubModelSelectorHidden(): boolean {
  return true;
}

/** Agent Hub: hide permission-mode pickers (e.g. 默认 / plan / yolo) on guid and conversation surfaces. */
export function isAgentHubPermissionSelectorHidden(): boolean {
  return false;
}

/**
 * Agent Hub phase-1: hide the Settings → Agents tab.
 * Set to `false` in phase-2 to restore the Agents settings entry.
 */
export function isAgentHubAgentsSettingsHidden(): boolean {
  return true;
}

/** Default settings landing path when opening Settings from the sider / `#/settings`. */
export function getAgentHubDefaultSettingsPath(): string {
  return isAgentHubAgentsSettingsHidden() ? '/settings/capabilities' : '/settings/agent';
}

/**
 * Agent Hub: channel types hidden from Settings → Channels.
 * Remove an id from the set (or return false) to restore Telegram / DingTalk.
 */
const HIDDEN_CHANNEL_TYPES = new Set(['telegram', 'dingtalk']);

export function isAgentHubChannelTypeHidden(channelType: string): boolean {
  return HIDDEN_CHANNEL_TYPES.has(channelType);
}
