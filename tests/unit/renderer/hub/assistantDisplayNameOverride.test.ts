/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { applyAgentHubAssistantDisplayNameOverride } from '@/renderer/utils/hub/assistantDisplayNameOverride';
import { resolveAssistantName } from '@/renderer/utils/model/assistantDisplay';
import { describe, expect, it } from 'vitest';

describe('assistantDisplayNameOverride', () => {
  it('renames Codex CLI to Codex', () => {
    expect(applyAgentHubAssistantDisplayNameOverride('Codex CLI')).toBe('Codex');
  });

  it('leaves other assistant names unchanged', () => {
    expect(applyAgentHubAssistantDisplayNameOverride('Claude Code')).toBe('Claude Code');
    expect(applyAgentHubAssistantDisplayNameOverride('My Codex')).toBe('My Codex');
  });

  it('applies the override through resolveAssistantName', () => {
    expect(
      resolveAssistantName(
        {
          id: 'codex-1',
          name: 'Codex CLI',
          name_i18n: {},
        },
        'zh-CN'
      )
    ).toBe('Codex');
  });
});
