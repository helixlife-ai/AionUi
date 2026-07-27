/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fromBackendFileMetadata } from '@/common/adapter/fileMetadataMapper';
import { describe, expect, it } from 'vitest';

describe('fromBackendFileMetadata', () => {
  it('maps snake_case is_directory / last_modified from AionCore', () => {
    const meta = fromBackendFileMetadata({
      name: 'builtin-skills',
      path: '/data/builtin-skills',
      size: 4096,
      type: 'inode/directory',
      last_modified: 1785141279017,
      is_directory: true,
    });

    expect(meta).toEqual({
      name: 'builtin-skills',
      path: '/data/builtin-skills',
      size: 4096,
      type: 'inode/directory',
      lastModified: 1785141279017,
      isDirectory: true,
    });
  });

  it('keeps camelCase when already normalized', () => {
    const meta = fromBackendFileMetadata({
      name: 'notes.md',
      path: '/tmp/notes.md',
      size: 12,
      type: 'text/plain',
      lastModified: 100,
      isDirectory: false,
    });

    expect(meta?.isDirectory).toBe(false);
    expect(meta?.lastModified).toBe(100);
  });

  it('infers directory from type when flags are missing', () => {
    const meta = fromBackendFileMetadata({
      name: 'logs',
      path: '/data/logs',
      type: 'inode/directory',
    });
    expect(meta?.isDirectory).toBe(true);
  });

  it('returns null for empty payloads', () => {
    expect(fromBackendFileMetadata(null)).toBeNull();
    expect(fromBackendFileMetadata(undefined)).toBeNull();
  });
});
