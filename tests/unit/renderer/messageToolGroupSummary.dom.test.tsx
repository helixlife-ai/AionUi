import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import type { ToolMessage } from '@/common/chat/normalizeToolCall';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessage: {
        invoke: vi.fn(),
      },
    },
  },
}));

describe('MessageToolGroupSummary', () => {
  it('loads full tool content when expanding a compact history item', async () => {
    const invoke = vi.mocked(ipcBridge.database.getConversationMessage.invoke);
    invoke.mockResolvedValue({
      id: 'message-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          session_update: 'tool_call',
          tool_call_id: 'tool-1',
          status: 'completed',
          title: 'rg',
          kind: 'search',
          raw_input: { pattern: 'needle', path: '.' },
          content: [{ type: 'content', content: { type: 'text', text: 'full output' } }],
        },
      },
    } as unknown as TMessage);

    render(
      <MessageToolGroupSummary
        messages={[
          {
            id: 'message-1',
            conversation_id: 'conversation-1',
            type: 'acp_tool_call',
            content: {
              _compact: {
                truncated: true,
                original_size: 90000,
                preview_chars: 4096,
              },
              update: {
                session_update: 'tool_call',
                tool_call_id: 'tool-1',
                status: 'completed',
                title: 'rg',
                kind: 'search',
                raw_input: { pattern: 'needle', path: '.' },
                content: [{ type: 'content', content: { type: 'text', text: 'preview' } }],
              },
            },
          } as unknown as ToolMessage,
        ]}
      />
    );

    fireEvent.click(screen.getByText('View Steps · 1'));
    fireEvent.click(screen.getByText('rg'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith({
        conversation_id: 'conversation-1',
        message_id: 'message-1',
      });
    });
    expect(await screen.findByText('full output')).toBeInTheDocument();
  });
  it('smooths live output without delaying an error result', () => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    const message = (text: string, status = 'in_progress') =>
      ({
        id: 'stream-message',
        conversation_id: 'stream-conversation',
        type: 'acp_tool_call',
        content: {
          update: {
            session_update: 'tool_call',
            tool_call_id: 'stream-tool',
            title: 'Stream probe',
            kind: 'execute',
            status,
            content: [{ type: 'content', content: { type: 'text', text } }],
          },
        },
      }) as unknown as ToolMessage;
    const { container, rerender, unmount } = render(<MessageToolGroupSummary messages={[message('start')]} />);
    fireEvent.click(screen.getByText('Stream probe'));
    const full = 'start' + 'output'.repeat(80);
    rerender(<MessageToolGroupSummary messages={[message(full)]} />);
    act(() => vi.advanceTimersByTime(48));
    expect(container.textContent).not.toContain(full);
    expect(container.textContent).toContain('startoutput');
    rerender(<MessageToolGroupSummary messages={[message(full, 'failed')]} />);
    expect(container.textContent).toContain(full);
    unmount();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
