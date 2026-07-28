/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LAYOUT_MESSAGE_SIDER_GAP_PX,
  resolveLayoutMessageOffsetLeft,
} from '@/renderer/utils/ui/layoutMessageOffset';
import { describe, expect, it } from 'vitest';

describe('resolveLayoutMessageOffsetLeft', () => {
  it('offsets by sider width plus gutter when the desktop sider is expanded', () => {
    expect(
      resolveLayoutMessageOffsetLeft({
        isMobile: false,
        siderCollapsed: false,
        siderWidth: 260,
      })
    ).toBe(260 + LAYOUT_MESSAGE_SIDER_GAP_PX);
  });

  it('removes the offset when the sider is collapsed so toasts recenter', () => {
    expect(
      resolveLayoutMessageOffsetLeft({
        isMobile: false,
        siderCollapsed: true,
        siderWidth: 260,
      })
    ).toBe(0);
  });

  it('removes the offset on mobile where the sider overlays the viewport', () => {
    expect(
      resolveLayoutMessageOffsetLeft({
        isMobile: true,
        siderCollapsed: false,
        siderWidth: 300,
      })
    ).toBe(0);
  });
});
