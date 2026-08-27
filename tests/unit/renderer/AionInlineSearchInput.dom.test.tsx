/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import AionInlineSearchInput from '@/renderer/components/base/AionInlineSearchInput';

vi.mock('@icon-park/react', () => ({
  Search: () => <span aria-hidden='true' />,
}));

describe('AionInlineSearchInput keyboard isolation', () => {
  it('keeps letters and digits in the field and does not bubble keydown/keypress', () => {
    const onChange = vi.fn();
    const onParentKeyDown = vi.fn();
    const onParentKeyPress = vi.fn();

    render(
      <div onKeyDown={onParentKeyDown} onKeyPress={onParentKeyPress}>
        <AionInlineSearchInput value='a' onChange={onChange} data-testid='inline-search' />
      </div>
    );

    const input = screen.getByTestId('inline-search');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'b' });
    fireEvent.keyDown(input, { key: '2' });
    fireEvent.keyPress(input, { key: '2' });
    fireEvent.change(input, { target: { value: 'ab2' } });

    expect(onParentKeyDown).not.toHaveBeenCalled();
    expect(onParentKeyPress).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('ab2');
  });

  it('stops native key events from reaching a parent menu listener', () => {
    const onParentKeyDown = vi.fn();
    const onParentKeyPress = vi.fn();

    render(
      <div onKeyDown={onParentKeyDown} onKeyPress={onParentKeyPress}>
        <AionInlineSearchInput value='' onChange={() => undefined} data-testid='inline-search' />
      </div>
    );

    const input = screen.getByTestId('inline-search');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: '3', bubbles: true, cancelable: true }));

    expect(onParentKeyDown).not.toHaveBeenCalled();
    expect(onParentKeyPress).not.toHaveBeenCalled();
  });
});
