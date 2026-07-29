/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isAgentHubCodexTrustTip } from '@/renderer/utils/hub/isAgentHubCodexTrustTip';
import { describe, expect, it } from 'vitest';

describe('isAgentHubCodexTrustTip', () => {
  it('matches Codex untrusted-project Notices', () => {
    const tip = `⚠️ Project-local config, hooks, and exec policies are disabled in the following folders until the project is trusted, but skills still load.
1. /data/conversations/2026/07/29/codex-temp-8d33c603/.codex

To load project-local config, hooks, and exec policies, add /data/conversations/2026/07/29/codex-temp-8d33c603 as a trusted project in /root/.codex/config.toml.`;
    expect(isAgentHubCodexTrustTip(tip)).toBe(true);
  });

  it('rejects unrelated warnings and errors', () => {
    expect(isAgentHubCodexTrustTip('ACP empty turn')).toBe(false);
    expect(isAgentHubCodexTrustTip('No space left on device')).toBe(false);
    expect(isAgentHubCodexTrustTip('')).toBe(false);
    expect(isAgentHubCodexTrustTip(undefined)).toBe(false);
  });
});
