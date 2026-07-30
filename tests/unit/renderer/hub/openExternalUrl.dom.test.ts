/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tryOpenUrlViaFlutterClient = vi.fn();
const isApplianceWebView = vi.fn();
const openExternalInvoke = vi.fn();

vi.mock('@/renderer/utils/hub/flutterLaunch', () => ({
  tryOpenUrlViaFlutterClient: (...args: unknown[]) => tryOpenUrlViaFlutterClient(...args),
  isApplianceWebView: (...args: unknown[]) => isApplianceWebView(...args),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      openExternal: {
        invoke: (...args: unknown[]) => openExternalInvoke(...args),
      },
    },
  },
}));

describe('openExternalUrl', () => {
  const originalOpen = window.open;

  beforeEach(() => {
    tryOpenUrlViaFlutterClient.mockReset();
    isApplianceWebView.mockReset();
    isApplianceWebView.mockReturnValue(false);
    openExternalInvoke.mockReset();
    window.open = vi.fn();
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  afterEach(() => {
    window.open = originalOpen;
    delete (window as { electronAPI?: unknown }).electronAPI;
    vi.resetModules();
  });

  it('prefers the Flutter appliance bridge when available', async () => {
    tryOpenUrlViaFlutterClient.mockReturnValue(true);
    const { openExternalUrl } = await import('@/renderer/utils/platform');
    await openExternalUrl('https://www.baidu.com');
    expect(tryOpenUrlViaFlutterClient).toHaveBeenCalledWith('https://www.baidu.com');
    expect(window.open).not.toHaveBeenCalled();
    expect(openExternalInvoke).not.toHaveBeenCalled();
  });

  it('uses window.open for ordinary WebUI when bridge is absent', async () => {
    tryOpenUrlViaFlutterClient.mockReturnValue(false);
    const { openExternalUrl } = await import('@/renderer/utils/platform');
    await openExternalUrl('https://example.com');
    expect(window.open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  it('does not window.open inside appliance webview when bridge fails', async () => {
    tryOpenUrlViaFlutterClient.mockReturnValue(false);
    isApplianceWebView.mockReturnValue(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { openExternalUrl } = await import('@/renderer/utils/platform');
    await openExternalUrl('https://www.nature.com/articles/x');
    expect(window.open).not.toHaveBeenCalled();
    expect(openExternalInvoke).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
