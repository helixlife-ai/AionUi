/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type DirectorySelectionMode = 'directory' | 'file' | 'hybrid';

export type DirectorySelectionItem = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile?: boolean;
};

export function resolveDirectorySelectionMode(properties?: string[]): DirectorySelectionMode {
  const hasFile = properties?.includes('openFile') ?? false;
  const hasDirectory = properties?.includes('openDirectory') ?? false;

  if (hasFile && hasDirectory) {
    return 'hybrid';
  }

  if (hasFile) {
    return 'file';
  }

  return 'directory';
}

export function canSelectDirectoryItem(
  item: { isDirectory: boolean; isFile?: boolean },
  mode: DirectorySelectionMode
): boolean {
  if (mode === 'file') {
    return Boolean(item.isFile);
  }

  if (mode === 'hybrid') {
    return item.isDirectory || Boolean(item.isFile);
  }

  return item.isDirectory;
}

/** Browse historically returns folders only; merge in file entries from `/api/fs/dir`. */
export function mergeDirectorySelectionItems(
  browseItems: DirectorySelectionItem[],
  fileItems: DirectorySelectionItem[]
): DirectorySelectionItem[] {
  const byPath = new Map<string, DirectorySelectionItem>();

  for (const item of browseItems) {
    byPath.set(item.path, item);
  }

  for (const item of fileItems) {
    if (!item.isFile || item.isDirectory) {
      continue;
    }
    byPath.set(item.path, item);
  }

  return Array.from(byPath.values()).sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) {
      return left.isDirectory ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}
