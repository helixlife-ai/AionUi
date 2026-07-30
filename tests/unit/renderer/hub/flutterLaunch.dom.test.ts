/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasFlutterLaunchBridge,
  isApplianceWebView,
  tryOpenUrlViaFlutterClient,
} from '@/renderer/utils/hub/flutterLaunch';

describe('flutterLaunch', () => {
  afterEach(() => {
    delete (window as { FLUTTER_LAUNCH?: unknown }).FLUTTER_LAUNCH;
    delete (window as { FLUTTER_LAUNCH_userMessageHandler?: unknown }).FLUTTER_LAUNCH_userMessageHandler;
    delete (window as { DeviceClientLaunch?: unknown }).DeviceClientLaunch;
    delete (window as { DeviceClientLaunchEx?: unknown }).DeviceClientLaunchEx;
    delete (window as { webkit?: unknown }).webkit;
  });

  it('detects FLUTTER_LAUNCH.postMessage bridge', () => {
    expect(hasFlutterLaunchBridge()).toBe(false);
    (window as { FLUTTER_LAUNCH?: { postMessage: (msg: string) => void } }).FLUTTER_LAUNCH = {
      postMessage: vi.fn(),
    };
    expect(hasFlutterLaunchBridge()).toBe(true);
    expect(isApplianceWebView()).toBe(true);
  });

  it('detects appliance via FLUTTER_LAUNCH_userMessageHandler marker', () => {
    (window as { FLUTTER_LAUNCH_userMessageHandler?: unknown }).FLUTTER_LAUNCH_userMessageHandler = {};
    expect(isApplianceWebView()).toBe(true);
  });

  it('opens urls via FLUTTER_LAUNCH.postMessage', () => {
    const postMessage = vi.fn();
    (window as { FLUTTER_LAUNCH?: { postMessage: (msg: string) => void } }).FLUTTER_LAUNCH = {
      postMessage,
    };
    expect(tryOpenUrlViaFlutterClient('https://www.baidu.com')).toBe(true);
    expect(postMessage).toHaveBeenCalledWith('https://www.baidu.com');
  });

  it('opens urls via DeviceClientLaunch.postMessage (appliance UserMessageHandler)', () => {
    const postMessage = vi.fn();
    (window as { DeviceClientLaunch?: { postMessage: (msg: string) => void } }).DeviceClientLaunch = {
      postMessage,
    };
    expect(isApplianceWebView()).toBe(true);
    expect(tryOpenUrlViaFlutterClient('https://clinicaltrials.ucsf.edu/triple-negative-breast-cancer')).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      'https://clinicaltrials.ucsf.edu/triple-negative-breast-cancer'
    );
  });

  it('falls back to DeviceClientLaunch function when FLUTTER_LAUNCH is absent', () => {
    const launch = vi.fn();
    (window as { DeviceClientLaunch?: (url: string) => void }).DeviceClientLaunch = launch;
    expect(tryOpenUrlViaFlutterClient('https://example.com')).toBe(true);
    expect(launch).toHaveBeenCalledWith('https://example.com');
  });

  it('falls back to webkit.messageHandlers.FLUTTER_LAUNCH', () => {
    const postMessage = vi.fn();
    (window as { webkit?: { messageHandlers: { FLUTTER_LAUNCH: { postMessage: (m: string) => void } } } }).webkit = {
      messageHandlers: { FLUTTER_LAUNCH: { postMessage } },
    };
    expect(tryOpenUrlViaFlutterClient('https://example.com')).toBe(true);
    expect(postMessage).toHaveBeenCalledWith('https://example.com');
  });

  it('returns false when no bridge is available', () => {
    expect(tryOpenUrlViaFlutterClient('https://example.com')).toBe(false);
  });
});
