/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Agent Hub: hide end-user model pickers on guid and conversation surfaces. 隐藏模型选择器 */
export function isAgentHubModelSelectorHidden(): boolean {
  return true;
}

/** Agent Hub: hide permission-mode pickers (e.g. 默认 / plan / yolo) on guid and conversation surfaces. 隐藏权限选择器 */
export function isAgentHubPermissionSelectorHidden(): boolean {
  return false;
}

/**
 * Agent Hub phase-1: hide the Settings → Agents tab.
 * Set to `false` in phase-2 to restore the Agents settings entry.
 * 隐藏设置中的Agents设置入口
 */
export function isAgentHubAgentsSettingsHidden(): boolean {
  return true;
}

/**
 * Agent Hub: hide Settings → Desktop Pet (and deep-link `/settings/pet`).
 * Pet is desktop-only and not needed for Agent Hub / WebUI clients.桌面宠物
 */
export function isAgentHubPetSettingsHidden(): boolean {
  return true;
}

/**
 * Agent Hub: temporarily hide Settings → Tools (MCP / image generation).
 * Set to `false` to restore the Tools settings entry.
 * 暂时隐藏设置中的工具页
 */
export function isAgentHubToolsSettingsHidden(): boolean {
  return true;
}

/**
 * Agent Hub / WebUI appliance: hide the Scheduled Tasks awake banner + Keep Awake switch.
 * Keep-awake needs `systemd-inhibit` (missing in the container → PUT 500). The
 * "only runs while PC is awake" tip is for desktop sleep, not always-on appliances.
 * 隐藏定时任务唤醒横幅和保持唤醒开关
 */
export function isAgentHubKeepAwakeHidden(): boolean {
  return true;
}

/**
 * Agent Hub: hide the project-files toolbar "+" (Add file / Upload from device).
 * Upstream desktop AionUi does not expose this entry; WebUI-only upload belongs
 * elsewhere (e.g. sendbox attach), not on the workspace tree header.
 * 隐藏项目文件工具栏「+」（添加文件 / 从设备上传）
 */
export function isAgentHubWorkspaceFileAddHidden(): boolean {
  return true;
}

/**
 * Agent Hub: temporarily hide inline "反馈问题" / Report Issue chips.
 * Set to `false` to restore FeedbackButton on error surfaces.
 * 暂时隐藏错误旁的「反馈问题」入口
 */
export function isAgentHubFeedbackHidden(): boolean {
  return true;
}

/** Default settings landing path when opening Settings from the sider / `#/settings`. */
export function getAgentHubDefaultSettingsPath(): string {
  return isAgentHubAgentsSettingsHidden() ? '/settings/skills' : '/settings/agent';
}

/**
 * Agent Hub: channel types hidden from Settings → Channels.
 * Remove an id from the set (or return false) to restore Telegram / DingTalk.
 */
const HIDDEN_CHANNEL_TYPES = new Set(['telegram', 'dingtalk']);

export function isAgentHubChannelTypeHidden(channelType: string): boolean {
  return HIDDEN_CHANNEL_TYPES.has(channelType);
}

/**
 * Runtimes hidden from Agent Hub assistant / agent pickers.
 * - aionrs: built-in Aion CLI
 * - openclaw / openclaw-gateway: removed from Hub deploy; may still exist in
 *   persisted `/data` or a separate appliance OpenClaw stack.
 */
const HIDDEN_RUNTIME_KEYS = new Set(['aionrs', 'openclaw', 'openclaw-gateway']);

/** True when this runtime key should not appear in Hub agent selection UI. */
export function isAgentHubRuntimeHidden(runtimeKey: string | null | undefined): boolean {
  const key = (runtimeKey || '').trim().toLowerCase();
  return HIDDEN_RUNTIME_KEYS.has(key);
}
