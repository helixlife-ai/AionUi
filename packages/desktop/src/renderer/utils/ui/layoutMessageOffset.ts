/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** CSS custom property consumed by `.arco-message-wrapper` in layout.css. */
export const LAYOUT_MESSAGE_OFFSET_CSS_VAR = '--layout-message-offset-left';

/**
 * Historical gap baked into the fixed 266px message offset
 * (default sider 260px + 6px gutter).
 */
export const LAYOUT_MESSAGE_SIDER_GAP_PX = 6;

/**
 * Horizontal offset so Arco Message stays centered in the main content area
 * (viewport minus the left sider), not the full window.
 */
export function resolveLayoutMessageOffsetLeft(params: {
  isMobile: boolean;
  siderCollapsed: boolean;
  siderWidth: number;
}): number {
  if (params.isMobile || params.siderCollapsed) {
    return 0;
  }
  return Math.max(0, params.siderWidth) + LAYOUT_MESSAGE_SIDER_GAP_PX;
}
