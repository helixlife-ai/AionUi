/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from './types';
import { DARK_THEME_ID, LIGHT_THEME_ID } from './constants';

type OldCssTheme = {
  id: string;
  name: string;
  cover?: string;
  css: string;
  is_preset?: boolean;
  created_at: number;
  updated_at: number;
};

export type OldThemeConfig = {
  theme?: string;
  'css.activeThemeId'?: string;
  'css.themes'?: OldCssTheme[];
  customCss?: string;
};

export type NewThemeConfig = {
  'theme.activeId': string;
  'theme.userThemes': Theme[];
};

const OLD_DEFAULT_ID = 'default-theme';

export function migrateThemeConfig(old: OldThemeConfig): NewThemeConfig {
  const appearance = old.theme === 'dark' ? 'dark' : 'light';

  const oldActive = old['css.activeThemeId'] || '';
  const activeId =
    oldActive && oldActive !== OLD_DEFAULT_ID
      ? oldActive
      : appearance === 'dark'
        ? DARK_THEME_ID
        : LIGHT_THEME_ID;

  const userThemes: Theme[] = (old['css.themes'] || [])
    .filter((theme) => !theme.is_preset)
    .map((theme) => ({
      id: theme.id,
      name: theme.name,
      cover: theme.cover,
      appearance,
      css: theme.css,
      builtin: false,
      created_at: theme.created_at,
      updated_at: theme.updated_at,
    }));

  return { 'theme.activeId': activeId, 'theme.userThemes': userThemes };
}
