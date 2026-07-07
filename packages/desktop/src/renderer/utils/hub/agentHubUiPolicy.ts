/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Agent Hub: hide end-user model pickers on guid and conversation surfaces. */
export function isAgentHubModelSelectorHidden(): boolean {
  return true;
}

/** Agent Hub: hide permission-mode pickers (e.g. 默认 / plan / yolo) on guid and conversation surfaces. */
export function isAgentHubPermissionSelectorHidden(): boolean {
  return false;
}
