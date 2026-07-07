/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isAgentHubModelSelectorHidden,
  isAgentHubPermissionSelectorHidden,
} from '@/renderer/utils/hub/agentHubUiPolicy';
import { describe, expect, it } from 'vitest';

describe('agentHubUiPolicy', () => {
  it('hides model selectors in Agent Hub builds', () => {
    expect(isAgentHubModelSelectorHidden()).toBe(true);
  });

  it('hides permission selectors in Agent Hub builds', () => {
    expect(isAgentHubPermissionSelectorHidden()).toBe(true);
  });
});
