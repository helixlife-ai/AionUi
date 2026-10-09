/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type GuidPromptCategory = {
  title?: string;
  prompts: string[];
};

const PROMPT_CATEGORIES = [
  {
    titleKey: 'guid.defaultPromptCategories.research.title',
    promptKeys: [
      'guid.defaultPromptCategories.research.items.prompt1',
      'guid.defaultPromptCategories.research.items.prompt2',
      'guid.defaultPromptCategories.research.items.prompt3',
      'guid.defaultPromptCategories.research.items.prompt4',
    ],
  },
  {
    titleKey: 'guid.defaultPromptCategories.idea.title',
    promptKeys: [
      'guid.defaultPromptCategories.idea.items.prompt5',
      'guid.defaultPromptCategories.idea.items.prompt6',
      'guid.defaultPromptCategories.idea.items.prompt7',
      'guid.defaultPromptCategories.idea.items.prompt8',
    ],
  },
  {
    titleKey: 'guid.defaultPromptCategories.analysis.title',
    promptKeys: [
      'guid.defaultPromptCategories.analysis.items.prompt9',
      'guid.defaultPromptCategories.analysis.items.prompt10',
      'guid.defaultPromptCategories.analysis.items.prompt11',
      'guid.defaultPromptCategories.analysis.items.prompt12',
    ],
  },
  {
    titleKey: 'guid.defaultPromptCategories.writing.title',
    promptKeys: [
      'guid.defaultPromptCategories.writing.items.prompt13',
      'guid.defaultPromptCategories.writing.items.prompt14',
      'guid.defaultPromptCategories.writing.items.prompt15',
      'guid.defaultPromptCategories.writing.items.prompt16',
    ],
  },
] as const;

// Keep three cards per slide while including every configured prompt.
const promptKeys = PROMPT_CATEGORIES.flatMap((category) => [...category.promptKeys]);
export const GUID_DEFAULT_PROMPT_CATEGORY_DEFS = Array.from(
  { length: Math.ceil(promptKeys.length / 3) },
  (_, slide) => ({
    titleKey: PROMPT_CATEGORIES[Math.floor((slide * 3) / 4)].titleKey,
    promptKeys: Array.from({ length: 3 }, (_, offset) => promptKeys[(slide * 3 + offset) % promptKeys.length]),
  })
);
