/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildBrowseDirectoryUrl,
  canSelectDirectoryItem,
  filterBrowseItemsForMode,
  mapBrowseDirectoryItem,
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

  it('always builds browse URL with show_files for AionCore', () => {
    const url = buildBrowseDirectoryUrl('http://example.test', '/agent_hub');
    expect(url).toBe(
      'http://example.test/api/fs/browse?path=%2Fagent_hub&show_files=true&showFiles=true'
    );
  });

  it('maps camelCase and snake_case browse entries', () => {
    expect(
      mapBrowseDirectoryItem({
        name: 'a.pdf',
        path: '/ws/a.pdf',
        isDirectory: false,
        isFile: true,
      })
    ).toEqual({ name: 'a.pdf', path: '/ws/a.pdf', isDirectory: false, isFile: true });

    expect(
      mapBrowseDirectoryItem({
        name: 'docs',
        path: '/ws/docs',
        is_directory: true,
        is_file: false,
      })
    ).toEqual({ name: 'docs', path: '/ws/docs', isDirectory: true, isFile: false });
  });

  it('filters files out only in directory selection mode', () => {
    const items = [
      { name: 'docs', path: '/ws/docs', isDirectory: true, isFile: false },
      { name: 'a.pdf', path: '/ws/a.pdf', isDirectory: false, isFile: true },
    ];
    expect(filterBrowseItemsForMode(items, 'directory').map((item) => item.name)).toEqual(['docs']);
    expect(filterBrowseItemsForMode(items, 'file').map((item) => item.name)).toEqual(['docs', 'a.pdf']);
    expect(filterBrowseItemsForMode(items, 'hybrid').map((item) => item.name)).toEqual(['docs', 'a.pdf']);
  });
});
