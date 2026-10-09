/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** User-facing product wordmark shown in the sider / document title. */
export const PRODUCT_DISPLAY_NAME = 'Studio';

/** Adapt upstream translation resources before interpolation, preserving technical tokens. */
export function applyProductBrand<T>(resource: T, language: string): T {
  const transform = (value: unknown): unknown => {
    if (typeof value === 'string') {
      // Keep URLs, code examples and interpolation keys byte-for-byte intact.
      return value
        .split(/(https?:\/\/[^\s<>"']+|`[^`]*`|\{\{[^}]*\}\})/g)
        .map((part, index) => {
          if (index % 2 === 1) return part;
          const branded = part.replace(/\bAionUi\b/g, PRODUCT_DISPLAY_NAME);
          return language.startsWith('zh')
            ? branded.replace(/飞书\s*\/\s*Lark|Lark\s*\/\s*Feishu|Lark/g, '飞书')
            : branded;
        })
        .join('');
    }
    if (Array.isArray(value)) return value.map(transform);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, transform(child)]));
    }
    return value;
  };
  return transform(resource) as T;
}
