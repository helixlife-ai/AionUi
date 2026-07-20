/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getAgentHubDefaultSettingsPath,
  isAgentHubAgentsSettingsHidden,
  isAgentHubChannelTypeHidden,
  isAgentHubModelSelectorHidden,
  isAgentHubPermissionSelectorHidden,
} from '@/renderer/utils/hub/agentHubUiPolicy';
import { describe, expect, it } from 'vitest';

describe('agentHubUiPolicy', () => {
  it('hides model selectors in Agent Hub builds', () => {
    expect(isAgentHubModelSelectorHidden()).toBe(true);
  });

  it('keeps permission selectors visible by default in Agent Hub builds', () => {
    expect(isAgentHubPermissionSelectorHidden()).toBe(false);
  });

  it('hides Agents settings tab in phase-1 and defaults settings landing to capabilities', () => {
    expect(isAgentHubAgentsSettingsHidden()).toBe(true);
    expect(getAgentHubDefaultSettingsPath()).toBe('/settings/capabilities');
  });

  it('hides Telegram and DingTalk channel configs in Agent Hub builds', () => {
    expect(isAgentHubChannelTypeHidden('telegram')).toBe(true);
    expect(isAgentHubChannelTypeHidden('dingtalk')).toBe(true);
    expect(isAgentHubChannelTypeHidden('lark')).toBe(false);
    expect(isAgentHubChannelTypeHidden('weixin')).toBe(false);
  });
});
