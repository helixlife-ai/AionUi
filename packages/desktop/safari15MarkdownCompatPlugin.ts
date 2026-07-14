/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Strip lookbehind email autolink regex that Safari 15 (macOS 12 WebKit) cannot
 * parse. Without this, vendor-markdown throws at parse time:
 *   SyntaxError: Invalid regular expression: invalid group specifier name
 * and the WebUI white-screens.
 *
 * mdast-util-gfm-autolink-literal already validates the previous character in
 * `previous()`, so the lookbehind is redundant and safe to remove.
 */

import type { Plugin } from 'vite';

// Exact regex literal from mdast-util-gfm-autolink-literal@2.0.1 lib/index.js
const SOURCE_LOOKBEHIND_EMAIL = '/(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/gu';
const SAFE_EMAIL = '/([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/g';

/** Rewrite a source string that contains the lookbehind email autolink regex. */
export function rewriteLookbehindEmailAutolink(code: string): string {
  if (!code.includes('(?<=')) {
    return code;
  }
  if (code.includes(SOURCE_LOOKBEHIND_EMAIL)) {
    return code.replaceAll(SOURCE_LOOKBEHIND_EMAIL, SAFE_EMAIL);
  }
  // Minified RegExp("(?<=...") form seen in production bundles.
  return code.replace(
    /new RegExp\("\(\?<=\^\|\\\\s\|\\\\p\{P\}\|\\\\p\{S\}\)(\(\[-\.\\\\w\+\]\+\)@\(\[-\\\\w\]\+\(\?:\\\\\.\[-\\\\w\]\+\)\+\))","gu?"\)/g,
    'new RegExp("$1","g")'
  );
}

export function safari15MarkdownCompatPlugin(): Plugin {
  return {
    name: 'safari15-markdown-compat',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('mdast-util-gfm-autolink-literal')) {
        return null;
      }
      const next = rewriteLookbehindEmailAutolink(code);
      if (next === code) {
        return null;
      }
      return { code: next, map: null };
    },
  };
}
