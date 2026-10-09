/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import GuidPromptCarousel from '@/renderer/pages/guid/components/GuidPromptCarousel';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { createInstance } from 'i18next';
import { GUID_DEFAULT_PROMPT_CATEGORY_DEFS } from '@/renderer/pages/guid/utils/guidDefaultPromptKeys';
import guid from '@/renderer/services/i18n/locales/zh-CN/guid.json';
import { describe, expect, it, vi } from 'vitest';

const categories = [
  {
    title: 'Category A',
    prompts: ['Prompt A1', 'Prompt A2'],
  },
  {
    title: 'Category B',
    prompts: ['Prompt B1', 'Prompt B2', 'Prompt B3'],
  },
  {
    title: 'Category C',
    prompts: ['Prompt C1'],
  },
];

describe('GuidPromptCarousel', () => {
  it('hides category title and indicators by default', () => {
    render(<GuidPromptCarousel categories={categories} onSelect={vi.fn()} />);

    expect(screen.queryByTestId('guid-prompt-carousel-category-title')).toBeNull();
    expect(screen.queryByTestId('guid-prompt-carousel-indicators')).toBeNull();
    screen.getByRole('button', { name: 'Prompt A1' });
    screen.getByRole('button', { name: 'Prompt A2' });
  });

  it('renders the first category title and prompts with indicator dots when enabled', () => {
    render(<GuidPromptCarousel categories={categories} onSelect={vi.fn()} showTitle showIndicators />);

    expect(screen.getByTestId('guid-prompt-carousel-category-title').textContent).toBe('Category A');
    screen.getByRole('button', { name: 'Prompt A1' });
    screen.getByRole('button', { name: 'Prompt A2' });
    expect(screen.queryByRole('button', { name: 'Prompt B1' })).toBeNull();
    expect(screen.getByTestId('guid-prompt-carousel-indicators').children).toHaveLength(3);
  });

  it('switches categories when an indicator is clicked', () => {
    render(<GuidPromptCarousel categories={categories} onSelect={vi.fn()} showTitle showIndicators />);

    fireEvent.click(screen.getByRole('button', { name: 'Category 2' }));

    expect(screen.getByTestId('guid-prompt-carousel-category-title').textContent).toBe('Category B');
    screen.getByRole('button', { name: 'Prompt B1' });
    expect(screen.queryByRole('button', { name: 'Prompt A1' })).toBeNull();
  });

  it('fills the input when a prompt is clicked', () => {
    const onSelect = vi.fn();

    render(<GuidPromptCarousel categories={[{ prompts: ['Prompt A'] }]} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Prompt A' }));
    expect(onSelect).toHaveBeenCalledWith('Prompt A');
  });
});

it('exposes all sixteen configured Chinese prompts and selects their complete text', async () => {
  const i18n = createInstance();
  await i18n.init({ lng: 'zh-CN', resources: { 'zh-CN': { translation: { guid } } } });
  const configured = GUID_DEFAULT_PROMPT_CATEGORY_DEFS.map((category) => ({
    title: i18n.t(category.titleKey),
    prompts: category.promptKeys.map((key) => i18n.t(key)),
  }));
  const onSelect = vi.fn();
  render(<GuidPromptCarousel categories={configured} onSelect={onSelect} showIndicators />);
  expect(new Set(configured.flatMap((category) => category.prompts)).size).toBe(16);
  configured.forEach((category, index) => {
    expect(category.prompts).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: `Category ${index + 1}` }));
    category.prompts.forEach((prompt) => {
      expect(prompt).not.toMatch(/^guid\./);
      fireEvent.click(screen.getByRole('button', { name: prompt }));
      expect(onSelect).toHaveBeenLastCalledWith(prompt);
    });
  });
});

it('waits six seconds between slides and pauses while hovered', () => {
  vi.useFakeTimers();
  const view = render(<GuidPromptCarousel categories={categories} onSelect={vi.fn()} />);
  try {
    act(() => vi.advanceTimersByTime(5999));
    expect(screen.getByRole('button', { name: 'Prompt A1' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('button', { name: 'Prompt B1' })).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('guid-prompt-carousel'));
    act(() => vi.advanceTimersByTime(12000));
    expect(screen.getByRole('button', { name: 'Prompt B1' })).toBeInTheDocument();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});
