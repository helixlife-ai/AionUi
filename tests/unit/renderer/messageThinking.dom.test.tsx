/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageThinking } from '@/common/chat/chatLib';
import MessageThinking from '@/renderer/pages/conversation/Messages/components/MessageThinking';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

function createThinkingMessage(createdAt: number): IMessageThinking {
  return {
    id: 'thinking-1',
    type: 'thinking',
    msg_id: 'msg-1',
    conversation_id: 'conversation-1',
    position: 'left',
    created_at: createdAt,
    content: {
      content: 'analyzing',
      status: 'thinking',
    },
  };
}

describe('MessageThinking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves elapsed time when the component remounts for an active thinking message', () => {
    vi.setSystemTime(new Date('2026-05-26T09:00:10.000Z'));
    const createdAt = Date.now() - 5_000;

    const { unmount } = render(<MessageThinking message={createThinkingMessage(createdAt)} />);

    expect(screen.getByText('Thinking... · 5s')).toBeInTheDocument();

    unmount();

    vi.setSystemTime(new Date('2026-05-26T09:00:12.000Z'));
    render(<MessageThinking message={createThinkingMessage(createdAt)} />);

    expect(screen.getByText('Thinking... · 7s')).toBeInTheDocument();
  });
  it('paces thinking text while keeping completion and its full text immediate', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    const message = createThinkingMessage(Date.now() - 5000);
    const { container, rerender, unmount } = render(<MessageThinking message={message} />);
    const full = 'analyzing' + '思考'.repeat(100);
    rerender(<MessageThinking message={{ ...message, content: { content: full, status: 'thinking' } }} />);
    act(() => vi.advanceTimersByTime(48));
    expect(container.textContent).not.toContain(full);
    expect(container.textContent).toContain('analyzing思考');
    rerender(<MessageThinking message={{ ...message, content: { content: full, status: 'done' } }} />);
    expect(screen.getByText(/Thought complete/)).toBeInTheDocument();
    expect(container.textContent).toContain(full);
    unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('animates the first burst of a newly created thinking message', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    const message = createThinkingMessage(Date.now());
    message.content.content = '思考'.repeat(150);
    const { container, unmount } = render(<MessageThinking message={message} />);
    expect(container.textContent).not.toContain(message.content.content);
    act(() => vi.advanceTimersByTime(816));
    expect(container.textContent).toContain(message.content.content);
    unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
