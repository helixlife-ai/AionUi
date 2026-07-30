/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Flutter appliance webview injects JS bridges so the Hub can ask the native
 * client to open URLs in the system browser (instead of navigating inside the
 * embedded webview).
 *
 * Confirmed on the Helix appliance client (Web Inspector):
 *   window.DeviceClientLaunch.postMessage("https://example.com")
 *   // DeviceClientLaunch is a UserMessageHandler, NOT a bare function
 *
 * Also supported:
 *   window.FLUTTER_LAUNCH.postMessage("https://example.com")
 *   window.webkit.messageHandlers.FLUTTER_LAUNCH.postMessage(...)
 */

export type FlutterLaunchChannel = {
  postMessage: (message: string) => void;
};

type FlutterLaunchWindow = Window & {
  FLUTTER_LAUNCH?: FlutterLaunchChannel | null;
  FLUTTER_LAUNCH_userMessageHandler?: unknown;
  DeviceClientLaunch?: FlutterLaunchChannel | ((url: string, ...rest: unknown[]) => void) | null;
  DeviceClientLaunchEx?: FlutterLaunchChannel | ((url: string, ...rest: unknown[]) => void) | null;
  webkit?: {
    messageHandlers?: {
      FLUTTER_LAUNCH?: { postMessage: (message: string) => void };
      DeviceClientLaunch?: { postMessage: (message: string) => void };
    };
  };
};

function getFlutterWindow(): FlutterLaunchWindow | null {
  if (typeof window === 'undefined') return null;
  return window as FlutterLaunchWindow;
}

function hasPostMessageChannel(channel: unknown): channel is FlutterLaunchChannel {
  return (
    (typeof channel === 'object' || typeof channel === 'function') &&
    channel !== null &&
    typeof (channel as FlutterLaunchChannel).postMessage === 'function'
  );
}

function tryPostMessage(channel: unknown, url: string): boolean {
  if (!hasPostMessageChannel(channel)) return false;
  channel.postMessage(url);
  return true;
}

/** True when the Hub is hosted inside the Flutter appliance webview. */
export function isApplianceWebView(): boolean {
  const win = getFlutterWindow();
  if (!win) return false;
  if (hasPostMessageChannel(win.DeviceClientLaunch)) return true;
  if (hasPostMessageChannel(win.DeviceClientLaunchEx)) return true;
  if (hasPostMessageChannel(win.FLUTTER_LAUNCH)) return true;
  if (hasPostMessageChannel(win.webkit?.messageHandlers?.FLUTTER_LAUNCH)) return true;
  if (hasPostMessageChannel(win.webkit?.messageHandlers?.DeviceClientLaunch)) return true;
  if (typeof win.DeviceClientLaunch === 'function') return true;
  if (typeof win.DeviceClientLaunchEx === 'function') return true;
  if (win.FLUTTER_LAUNCH_userMessageHandler != null) return true;
  return false;
}

/** @deprecated Prefer isApplianceWebView — kept for existing call sites/tests. */
export function hasFlutterLaunchBridge(): boolean {
  return isApplianceWebView();
}

/**
 * Ask the Flutter client to open `url` in the external browser.
 * @returns true when a native bridge handled the request
 */
export function tryOpenUrlViaFlutterClient(url: string): boolean {
  if (!url) return false;
  const win = getFlutterWindow();
  if (!win) return false;

  // Appliance client exposes DeviceClientLaunch as UserMessageHandler.postMessage
  // (verified in Web Inspector). Prefer it over FLUTTER_LAUNCH when both exist.
  if (tryPostMessage(win.DeviceClientLaunch, url)) return true;
  if (tryPostMessage(win.DeviceClientLaunchEx, url)) return true;
  if (tryPostMessage(win.FLUTTER_LAUNCH, url)) return true;
  if (tryPostMessage(win.webkit?.messageHandlers?.DeviceClientLaunch, url)) return true;
  if (tryPostMessage(win.webkit?.messageHandlers?.FLUTTER_LAUNCH, url)) return true;

  // Legacy: some builds may expose a bare callable.
  if (typeof win.DeviceClientLaunch === 'function' && !hasPostMessageChannel(win.DeviceClientLaunch)) {
    win.DeviceClientLaunch(url);
    return true;
  }

  if (typeof win.DeviceClientLaunchEx === 'function' && !hasPostMessageChannel(win.DeviceClientLaunchEx)) {
    win.DeviceClientLaunchEx(url);
    return true;
  }

  return false;
}
