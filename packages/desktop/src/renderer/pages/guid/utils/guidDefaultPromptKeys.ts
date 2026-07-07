/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type GuidPromptCategory = {
  title?: string;
  prompts: string[];
};

export const GUID_DEFAULT_PROMPT_CATEGORY_DEFS = [
  {
    titleKey: 'guid.defaultPromptCategories.literature.title',
    promptKeys: [
      'guid.defaultPromptCategories.literature.items.prompt1',
      'guid.defaultPromptCategories.literature.items.prompt2',
      'guid.defaultPromptCategories.literature.items.prompt3',
      'guid.defaultPromptCategories.literature.items.prompt4',
    ],
  },
  {
    titleKey: 'guid.defaultPromptCategories.scripting.title',
    promptKeys: [
      'guid.defaultPromptCategories.scripting.items.prompt5',
      'guid.defaultPromptCategories.scripting.items.prompt6',
      'guid.defaultPromptCategories.scripting.items.prompt7',
    ],
  },
  {
    titleKey: 'guid.defaultPromptCategories.concepts.title',
    promptKeys: [
      'guid.defaultPromptCategories.concepts.items.prompt8',
      'guid.defaultPromptCategories.concepts.items.prompt9',
      'guid.defaultPromptCategories.concepts.items.prompt10',
    ],
  },
] as const;
