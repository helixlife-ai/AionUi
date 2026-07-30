/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isExternalHttpUrl, installApplianceExternalLinkGuard } from '@/renderer/utils/hub/externalLinkGuard';

const openExternalUrl = vi.fn().mockResolvedValue(undefined);
const isApplianceWebView = vi.fn();

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
}));

vi.mock('@/renderer/utils/hub/flutterLaunch', () => ({
  isApplianceWebView: (...args: unknown[]) => isApplianceWebView(...args),
}));

describe('isExternalHttpUrl', () => {
  it('accepts cross-origin https links', () => {
    expect(isExternalHttpUrl('https://www.nature.com/articles/x', 'http://10.0.0.1:25808/')).toBe(true);
  });

  it('rejects same-origin routes', () => {
    expect(isExternalHttpUrl('http://10.0.0.1:25808/settings', 'http://10.0.0.1:25808/')).toBe(false);
  });
});

describe('installApplianceExternalLinkGuard', () => {
  beforeEach(() => {
    openExternalUrl.mockClear();
    isApplianceWebView.mockReset();
    delete (window as { __aionApplianceExternalLinkGuardInstalled?: boolean })
      .__aionApplianceExternalLinkGuardInstalled;
  });

  afterEach(() => {
    // Fresh document listeners cannot be easily removed; keep flag for idempotency tests only.
  });

  it('intercepts external anchor clicks inside appliance webview via composedPath', () => {
    isApplianceWebView.mockReturnValue(true);
    installApplianceExternalLinkGuard();

    const anchor = document.createElement('a');
    anchor.href = 'https://www.baidu.com/';
    document.body.appendChild(anchor);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, 'composedPath', {
      value: () => [anchor, document.body, document.documentElement, document, window],
    });

    const prevented = !anchor.dispatchEvent(event);
    // dispatchEvent returns false when preventDefault was called
    expect(prevented || event.defaultPrevented).toBe(true);
    expect(openExternalUrl).toHaveBeenCalledWith(anchor.href);

    anchor.remove();
  });

  it('does not intercept when not in appliance webview', () => {
    isApplianceWebView.mockReturnValue(false);
    installApplianceExternalLinkGuard();

    const anchor = document.createElement('a');
    anchor.href = 'https://www.baidu.com/';
    document.body.appendChild(anchor);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, 'composedPath', {
      value: () => [anchor, document.body, document.documentElement, document, window],
    });
    anchor.dispatchEvent(event);
    expect(openExternalUrl).not.toHaveBeenCalled();
    anchor.remove();
  });
});
