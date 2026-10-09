/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getAgentHubDefaultSettingsPath,
  isAgentHubAgentsSettingsHidden,
  isAgentHubBackendWarmingScreenEnabled,
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
import { applyProductBrand } from '@/renderer/utils/hub/productBrand';
import zhCN from '@/renderer/services/i18n/locales/zh-CN';

describe('agentHubUiPolicy', () => {
  it('enables backend readiness gating for Agent Hub cold start', () => {
    expect(isAgentHubBackendWarmingScreenEnabled()).toBe(true);
  });

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

  it.each(['telegram', 'dingtalk', 'slack', 'discord', 'wecom', 'extension-channel', ''])(
    'hides unsupported channel %s',
    (channel) => {
      expect(isAgentHubChannelTypeHidden(channel)).toBe(true);
    }
  );

  it('keeps only Feishu and WeChat channel configs visible', () => {
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

describe('Studio translation resources', () => {
  it('brands nested copy without changing keys or mutating upstream resources', () => {
    const original = { AionUi: { copy: ['AionUi 官方内置的技能', '飞书/Lark'] }, empty: null };
    expect(applyProductBrand(original, 'zh-CN')).toEqual({
      AionUi: { copy: ['Studio 官方内置的技能', '飞书'] },
      empty: null,
    });
    expect(original.AionUi.copy[0]).toBe('AionUi 官方内置的技能');
  });
  it('preserves URLs, code and interpolation identifiers', () => {
    const text = 'AionUi https://github.com/iOfficeAI/AionUi `AionUi` {{AionUi}}';
    expect(applyProductBrand(text, 'zh-CN')).toBe('Studio https://github.com/iOfficeAI/AionUi `AionUi` {{AionUi}}');
  });
  it('adapts actual Chinese skill and channel translations', () => {
    const translated = applyProductBrand(zhCN, 'zh-CN');
    expect(JSON.stringify(translated.settings)).toContain('Studio 官方内置的技能');
    expect(translated.settings['channels.larkTitle']).toBe('飞书');
    expect(translated.settings['webui.featureChannelsDesc']).toContain('飞书、微信');
  });
});
