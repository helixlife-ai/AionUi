/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ThemeAppearance } from '@/common/theme/types';

type ThemeDocument = Pick<Document, 'documentElement'>;

/** Read the applied light/dark appearance from `data-theme` on `<html>`. */
export function getDocumentThemeAppearance(doc: ThemeDocument = document): ThemeAppearance {
  return doc.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function oppositeAppearance(appearance: ThemeAppearance): ThemeAppearance {
  return appearance === 'dark' ? 'light' : 'dark';
}
