/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Codex ACP catalogs expose `full-access`, while some aioncore / seed paths
 * persist or request `agent-full-access`. Sending the latter to
 * `session/set_mode` fails with:
 *   mode 'agent-full-access' is not one of the available modes
 *
 * Map the drifted id to the catalog id before cron writes or UI setMode.
 */
export function normalizeCodexSessionMode(mode: string): string {
  const key = mode.trim();
  return key === 'agent-full-access' ? 'full-access' : mode;
}

/** Normalize when present; leave undefined/empty untouched. */
export function normalizeCodexSessionModeOptional(mode: string | null | undefined): string | undefined {
  if (mode == null) return undefined;
  const trimmed = mode.trim();
  if (!trimmed) return undefined;
  return normalizeCodexSessionMode(trimmed);
}
