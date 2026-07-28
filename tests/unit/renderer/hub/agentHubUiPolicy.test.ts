/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getAgentHubDefaultSettingsPath,
  isAgentHubAgentsSettingsHidden,
  isAgentHubChannelTypeHidden,
  isAgentHubKeepAwakeHidden,
  isAgentHubModelSelectorHidden,
  isAgentHubPermissionSelectorHidden,
  isAgentHubPetSettingsHidden,
  isAgentHubRuntimeHidden,
  isAgentHubToolsSettingsHidden,
  isAgentHubWorkspaceFileAddHidden,
  isAgentHubFeedbackHidden,
} from '@/renderer/utils/hub/agentHubUiPolicy';
import { describe, expect, it } from 'vitest';

describe('agentHubUiPolicy', () => {
  it('hides model selectors in Agent Hub builds', () => {
    expect(isAgentHubModelSelectorHidden()).toBe(true);
  });

  it('keeps permission selectors visible by default in Agent Hub builds', () => {
    expect(isAgentHubPermissionSelectorHidden()).toBe(false);
  });

  it('hides Agents settings tab in phase-1 and defaults settings landing to skills', () => {
    expect(isAgentHubAgentsSettingsHidden()).toBe(true);
    expect(getAgentHubDefaultSettingsPath()).toBe('/settings/skills');
  });

  it('hides Tools settings tab temporarily in Agent Hub builds', () => {
    expect(isAgentHubToolsSettingsHidden()).toBe(true);
  });

  it('hides Desktop Pet settings tab in Agent Hub builds', () => {
    expect(isAgentHubPetSettingsHidden()).toBe(true);
  });

  it('hides Keep Awake banner on scheduled tasks in Agent Hub builds', () => {
    expect(isAgentHubKeepAwakeHidden()).toBe(true);
  });

  it('hides project-files toolbar add/upload entry in Agent Hub builds', () => {
    expect(isAgentHubWorkspaceFileAddHidden()).toBe(true);
  });

  it('hides inline feedback / report-issue chips in Agent Hub builds', () => {
    expect(isAgentHubFeedbackHidden()).toBe(true);
  });

  it('hides Telegram and DingTalk channel configs in Agent Hub builds', () => {
    expect(isAgentHubChannelTypeHidden('telegram')).toBe(true);
    expect(isAgentHubChannelTypeHidden('dingtalk')).toBe(true);
    expect(isAgentHubChannelTypeHidden('lark')).toBe(false);
    expect(isAgentHubChannelTypeHidden('weixin')).toBe(false);
  });

  it('hides Aion CLI and OpenClaw runtimes from Hub pickers', () => {
    expect(isAgentHubRuntimeHidden('aionrs')).toBe(true);
    expect(isAgentHubRuntimeHidden('openclaw')).toBe(true);
    expect(isAgentHubRuntimeHidden('openclaw-gateway')).toBe(true);
    expect(isAgentHubRuntimeHidden('claude')).toBe(false);
    expect(isAgentHubRuntimeHidden('codex')).toBe(false);
  });
});
