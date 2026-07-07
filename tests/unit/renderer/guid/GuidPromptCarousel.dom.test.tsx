/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import GuidPromptCarousel from '@/renderer/pages/guid/components/GuidPromptCarousel';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
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
  it('renders the first category title and prompts with indicator dots', () => {
    render(<GuidPromptCarousel categories={categories} onSelect={vi.fn()} />);

    expect(screen.getByTestId('guid-prompt-carousel-category-title').textContent).toBe('Category A');
    screen.getByRole('button', { name: 'Prompt A1' });
    screen.getByRole('button', { name: 'Prompt A2' });
    expect(screen.queryByRole('button', { name: 'Prompt B1' })).toBeNull();
    expect(screen.getByTestId('guid-prompt-carousel-indicators').children).toHaveLength(3);
  });

  it('switches categories when an indicator is clicked', () => {
    render(<GuidPromptCarousel categories={categories} onSelect={vi.fn()} />);

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
