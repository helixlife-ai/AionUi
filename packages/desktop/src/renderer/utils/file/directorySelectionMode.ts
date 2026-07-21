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

/**
 * Build `/api/fs/browse` URL.
 * AionCore reads snake_case `show_files` (camelCase `showFiles` is ignored).
 */
export function buildBrowseDirectoryUrl(baseUrl: string, dirPath: string, showFiles: boolean): string {
  const params = new URLSearchParams();
  params.set('path', dirPath);
  if (showFiles) {
    params.set('show_files', 'true');
    // Keep camelCase for older proxies/backends that may still read it.
    params.set('showFiles', 'true');
  }
  return `${baseUrl}/api/fs/browse?${params.toString()}`;
}
