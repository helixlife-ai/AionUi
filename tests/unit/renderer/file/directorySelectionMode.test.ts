/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  canSelectDirectoryItem,
  mergeDirectorySelectionItems,
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

  it('merges browse folders with dir API files and sorts directories first', () => {
    const merged = mergeDirectorySelectionItems(
      [
        { name: 'pdf', path: '/ws/pdf', isDirectory: true, isFile: false },
        { name: 'notes', path: '/ws/notes', isDirectory: true, isFile: false },
      ],
      [
        { name: 'a.pdf', path: '/ws/a.pdf', isDirectory: false, isFile: true },
        { name: 'z.txt', path: '/ws/z.txt', isDirectory: false, isFile: true },
      ]
    );

    expect(merged.map((item) => item.name)).toEqual(['notes', 'pdf', 'a.pdf', 'z.txt']);
  });
});
