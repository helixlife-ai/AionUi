/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildBrowseDirectoryUrl,
  canSelectDirectoryItem,
  resolveDirectorySelectionMode,
} from '@/renderer/utils/file/directorySelectionMode';
import { describe, expect, it } from 'vitest';

describe('directorySelectionMode', () => {
  it('resolves selection mode from dialog properties', () => {
    expect(resolveDirectorySelectionMode(['openDirectory'])).toBe('directory');
    expect(resolveDirectorySelectionMode(['openFile'])).toBe('file');
    expect(resolveDirectorySelectionMode(['openFile', 'openDirectory'])).toBe('hybrid');
  });

  it('allows selecting files and directories in hybrid mode', () => {
    expect(canSelectDirectoryItem({ isDirectory: true }, 'hybrid')).toBe(true);
    expect(canSelectDirectoryItem({ isDirectory: false, isFile: true }, 'hybrid')).toBe(true);
    expect(canSelectDirectoryItem({ isDirectory: false, isFile: false }, 'hybrid')).toBe(false);
  });

  it('keeps directory-only and file-only pickers selective', () => {
    expect(canSelectDirectoryItem({ isDirectory: true }, 'directory')).toBe(true);
    expect(canSelectDirectoryItem({ isDirectory: false, isFile: true }, 'directory')).toBe(false);
    expect(canSelectDirectoryItem({ isDirectory: false, isFile: true }, 'file')).toBe(true);
  });

  it('builds browse URL with snake_case show_files for AionCore', () => {
    // baseUrl is only a unit-test fixture; runtime uses getBaseUrl() from the current host.
    const url = buildBrowseDirectoryUrl('http://example.test', '/agent_hub', true);
    expect(url).toBe(
      'http://example.test/api/fs/browse?path=%2Fagent_hub&show_files=true&showFiles=true'
    );
  });

  it('omits show_files when listing directories only', () => {
    const url = buildBrowseDirectoryUrl('http://localhost', '/tmp', false);
    expect(url).toBe('http://localhost/api/fs/browse?path=%2Ftmp');
    expect(url).not.toContain('show_files');
  });
});
