/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  normalizeCodexSessionMode,
  normalizeCodexSessionModeOptional,
} from '@/renderer/utils/hub/normalizeCodexSessionMode';
import { describe, expect, it } from 'vitest';

describe('normalizeCodexSessionMode', () => {
  it('maps drifted agent-full-access to catalog full-access', () => {
    expect(normalizeCodexSessionMode('agent-full-access')).toBe('full-access');
    expect(normalizeCodexSessionMode('  agent-full-access  ')).toBe('full-access');
  });

  it('leaves catalog and other modes unchanged', () => {
    expect(normalizeCodexSessionMode('full-access')).toBe('full-access');
    expect(normalizeCodexSessionMode('read-only')).toBe('read-only');
    expect(normalizeCodexSessionMode('yolo')).toBe('yolo');
  });

  it('optional helper preserves empty values', () => {
    expect(normalizeCodexSessionModeOptional(undefined)).toBeUndefined();
    expect(normalizeCodexSessionModeOptional(null)).toBeUndefined();
    expect(normalizeCodexSessionModeOptional('')).toBeUndefined();
    expect(normalizeCodexSessionModeOptional('agent-full-access')).toBe('full-access');
  });
});
