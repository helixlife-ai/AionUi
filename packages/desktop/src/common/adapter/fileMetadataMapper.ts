/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Raw `/api/fs/metadata` payload (camelCase or snake_case). */
export type RawFileMetadata = {
  name?: string;
  path?: string;
  size?: number;
  type?: string;
  lastModified?: number;
  last_modified?: number;
  isDirectory?: boolean;
  is_directory?: boolean;
};

/** Normalized metadata for renderer callers (`IFileMetadata`-compatible). */
export type NormalizedFileMetadata = {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
  isDirectory?: boolean;
};

/**
 * Normalize backend file metadata to the renderer shape.
 * AionCore returns snake_case (`is_directory`, `last_modified`); reading only
 * camelCase mis-classified directories as files (Guid workspace picker).
 */
export function fromBackendFileMetadata(raw: RawFileMetadata | null | undefined): NormalizedFileMetadata | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const name = typeof raw.name === 'string' ? raw.name : '';
  const path = typeof raw.path === 'string' ? raw.path : '';
  const type = typeof raw.type === 'string' ? raw.type : '';
  const isDirectory = Boolean(raw.isDirectory ?? raw.is_directory ?? (type.includes('directory') ? true : undefined));

  return {
    name,
    path,
    size: typeof raw.size === 'number' ? raw.size : 0,
    type,
    lastModified:
      typeof raw.lastModified === 'number'
        ? raw.lastModified
        : typeof raw.last_modified === 'number'
          ? raw.last_modified
          : 0,
    isDirectory,
  };
}
