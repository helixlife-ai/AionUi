/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { getAgentHubConversationAssistantCatalog } from '@/renderer/utils/hub/agentHubAssistantCatalog';
import { describe, expect, it } from 'vitest';

describe('agentHubAssistantCatalog', () => {
  it('matches guid agentSelection: hide Aion CLI / OpenClaw and keep enabled assistants in selection order', () => {
    const catalog = [
      makeAssistant('bare-aionrs', 'generated', 'aionrs', 0, false),
      makeAssistant('bare-claude', 'generated', 'claude', 1, true),
      makeAssistant('bare-codex', 'generated', 'codex', 2, true),
      makeAssistant('bare-openclaw', 'generated', 'openclaw', 3, true),
      makeAssistant('user-writer', 'user', 'claude', 4, true),
      makeAssistant('disabled-user', 'user', 'claude', 5, false),
    ];

    expect(getAgentHubConversationAssistantCatalog(catalog).map((assistant) => assistant.id)).toEqual([
      'bare-claude',
      'bare-codex',
      'user-writer',
    ]);
  });
});

function makeAssistant(
  id: string,
  source: Assistant['source'],
  backend: string,
  sort_order: number,
  enabled: boolean
): Assistant {
  const isAionrs = backend === 'aionrs';

  return {
    id,
    source,
    name: id,
    name_i18n: {},
    description_i18n: {},
    enabled,
    sort_order,
    agent_id: `agent-${backend}`,
    agent: isAionrs
      ? { type: 'aionrs', source: 'internal' }
      : { type: 'acp', source: 'builtin', acp_backend: backend },
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    agent_status: 'online',
    team_selectable: true,
    deletable: false,
  };
}
