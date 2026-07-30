/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isApplianceWebView } from '@/renderer/utils/hub/flutterLaunch';
import { openExternalUrl } from '@/renderer/utils/platform';

const GUARD_FLAG = '__aionApplianceExternalLinkGuardInstalled';

type GuardWindow = Window & {
  [GUARD_FLAG]?: boolean;
};

/**
 * True for absolute http(s) URLs that leave the Hub origin.
 * Same-origin SPA routes must keep normal in-app navigation.
 */
export function isExternalHttpUrl(href: string, base: string = window.location.href): boolean {
  if (!href) return false;
  try {
    const url = new URL(href, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.origin !== new URL(base).origin;
  } catch {
    return false;
  }
}

function findAnchorFromEvent(event: Event): HTMLAnchorElement | null {
  // composedPath crosses open Shadow DOM (MarkdownView uses ShadowView).
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    if (node instanceof HTMLAnchorElement) return node;
  }
  const target = event.target;
  if (target instanceof Element) {
    return target.closest('a');
  }
  return null;
}

function interceptExternalAnchorEvent(event: MouseEvent): void {
  if (!isApplianceWebView()) return;
  // Only primary-button / unmodified clicks; leave modified clicks alone.
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const anchor = findAnchorFromEvent(event);
  if (!anchor) return;

  const href = anchor.href;
  if (!isExternalHttpUrl(href)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void openExternalUrl(href).catch((error: unknown) => {
    console.error('[externalLinkGuard] failed to open external link', error);
  });
}

/**
 * Capture-phase guard for the appliance Flutter webview.
 *
 * WebView often navigates on link activation even when React onClick calls
 * preventDefault; target=_blank / window.open also stay inside the client.
 * Intercept with composedPath so Shadow DOM markdown links are covered.
 */
export function installApplianceExternalLinkGuard(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const win = window as GuardWindow;
  if (win[GUARD_FLAG]) return;
  win[GUARD_FLAG] = true;

  document.addEventListener('click', interceptExternalAnchorEvent, true);
  // Some WebKit embeds commit navigation on mousedown before click handlers run.
  document.addEventListener(
    'mousedown',
    (event: MouseEvent) => {
      if (!isApplianceWebView()) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = findAnchorFromEvent(event);
      if (!anchor || !isExternalHttpUrl(anchor.href)) return;
      event.preventDefault();
    },
    true
  );
}
