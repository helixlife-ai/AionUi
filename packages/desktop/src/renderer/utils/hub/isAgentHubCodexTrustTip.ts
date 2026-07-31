/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Detect Codex stderr about untrusted project-local config/hooks/exec policies.
 * Agent Hub auto-trusts conversation workspaces; the raw English Notice is noise.
 */
export function isAgentHubCodexTrustTip(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();
  const mentionsProjectLocal =
    normalized.includes('project-local config') || normalized.includes('project local config');
  const mentionsTrust =
    normalized.includes('until the project is trusted') ||
    normalized.includes('as a trusted project') ||
    normalized.includes('trusted project in');
  const mentionsExecPolicies = normalized.includes('exec policies are disabled');
  return (mentionsProjectLocal && mentionsTrust) || (mentionsExecPolicies && mentionsTrust);
}
