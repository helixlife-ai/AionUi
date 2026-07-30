/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Normalize Office preview file paths for Agent Hub / WebUI.
 *
 * Safety rules (must not break paths that already work):
 * - Absolute POSIX (`/…`) → unchanged
 * - Absolute Windows (`C:/…`, `//…`) → unchanged
 * - Only rewrite clearly relative Hub paths that forgot the leading slash
 *   (`agent_hub/…` → `/agent_hub/…`)
 * - Bare relative names are joined to an absolute `workspace` when provided
 * - If unsure, return the original path
 */
export function resolveOfficePreviewFilePath(filePath: string | null | undefined, workspace?: string | null): string {
  if (!filePath) return '';
  const original = filePath.trim();
  if (!original) return '';

  const raw = original.replaceAll('\\', '/');

  // Already absolute POSIX — keep slash-normalized form only.
  if (raw.startsWith('/')) {
    return raw;
  }

  // Absolute Windows / UNC
  if (/^[A-Za-z]:\//.test(raw) || raw.startsWith('//')) {
    return raw;
  }

  // Appliance Hub path missing the leading slash (seen in word-preview 400s).
  if (raw.startsWith('agent_hub/') || raw === 'agent_hub') {
    return `/${raw}`;
  }

  const ws = (workspace || '').trim().replaceAll('\\', '/');
  if (ws.startsWith('/')) {
    const wsNoSlash = ws.replace(/^\//, '');
    // Relative form of the absolute workspace path (or a file under it).
    if (raw === wsNoSlash || raw.startsWith(`${wsNoSlash}/`)) {
      return `/${raw}`;
    }
    const base = ws.replace(/\/$/, '');
    const rel = raw.replace(/^\.\//, '');
    return `${base}/${rel}`;
  }

  // Unknown relative layout — leave unchanged rather than guess wrong.
  return original;
}
