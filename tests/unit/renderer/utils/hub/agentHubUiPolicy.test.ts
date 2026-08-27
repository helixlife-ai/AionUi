/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { isAgentHubChannelTypeHidden } from '@/renderer/utils/hub/agentHubUiPolicy';

describe('Agent Hub channel visibility policy', () => {
  it('hides channels unavailable in the appliance UI', () => {
    const hiddenChannels = ['telegram', 'slack', 'discord', 'dingtalk'];

    expect(hiddenChannels.every(isAgentHubChannelTypeHidden)).toBe(true);
  });

  it('keeps supported and extension channels visible', () => {
    const visibleChannels = ['lark', 'weixin', 'custom-extension'];

    expect(visibleChannels.some(isAgentHubChannelTypeHidden)).toBe(false);
  });
});
