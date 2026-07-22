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

type RawBrowseItem = {
  name?: string;
  path?: string;
  isDirectory?: boolean;
  is_directory?: boolean;
  isFile?: boolean;
  is_file?: boolean;
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
 * Normalize browse API entries (camelCase preferred; snake_case tolerated).
 */
export function mapBrowseDirectoryItem(
  item: RawBrowseItem,
  stripPath: (path: string) => string = (path) => path
): DirectorySelectionItem | null {
  const name = typeof item.name === 'string' ? item.name : '';
  const rawPath = typeof item.path === 'string' ? item.path : '';
  if (!name || !rawPath) {
    return null;
  }

  const isDirectory = Boolean(item.isDirectory ?? item.is_directory);
  const isFile = Boolean(item.isFile ?? item.is_file ?? !isDirectory);

  return {
    name,
    path: stripPath(rawPath),
    isDirectory,
    isFile,
  };
}

/**
 * Directory-only pickers still request files from the API, then hide them here.
 * This avoids intermittent empty lists when a folders-only browse response is
 * served/cached for a file-picker navigation.
 */
export function filterBrowseItemsForMode(
  items: DirectorySelectionItem[],
  mode: DirectorySelectionMode
): DirectorySelectionItem[] {
  if (mode === 'directory') {
    return items.filter((item) => item.isDirectory);
  }
  return items;
}

/**
 * Build `/api/fs/browse` URL.
 * Always send snake_case `show_files=true` so AionCore returns files; directory
 * mode filters client-side. Also keep camelCase for older proxies.
 */
export function buildBrowseDirectoryUrl(baseUrl: string, dirPath: string): string {
  const params = new URLSearchParams();
  params.set('path', dirPath);
  params.set('show_files', 'true');
  params.set('showFiles', 'true');
  return `${baseUrl}/api/fs/browse?${params.toString()}`;
}
