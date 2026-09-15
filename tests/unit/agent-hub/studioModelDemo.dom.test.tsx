import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  StudioConversationModelSelector,
  StudioDemoModelSelector,
} from '@/renderer/components/agent/StudioModelSelector';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

it('shows five Claude demo models with no backend model and never calls the runtime setter', async () => {
  const setModel = vi.fn();
  render(<StudioConversationModelSelector conversationId='A' model={null} disabled={false} setModel={setModel} />);
  fireEvent.click(screen.getByRole('button', { name: /choose: DeepSeek-V4.1-Flash/ }));
  const panel = await screen.findByRole('region');
  expect(within(panel).getAllByRole('button')).toHaveLength(5);
  fireEvent.click(within(panel).getByRole('button', { name: /Kimi-K3/ }));
  expect(await screen.findByRole('button', { name: /choose: Kimi-K3/ })).toBeInTheDocument();
  expect(setModel).not.toHaveBeenCalled();
});

it('excludes GLM and Pro for Codex and resets an incompatible Claude selection', async () => {
  const { rerender } = render(<StudioDemoModelSelector scopeKey='A' backend='claude' />);
  fireEvent.click(screen.getByRole('button', { name: /choose: DeepSeek-V4.1-Flash/ }));
  fireEvent.click(within(await screen.findByRole('region')).getByRole('button', { name: /GLM-5.3/ }));
  rerender(<StudioDemoModelSelector scopeKey='A' backend='codex' />);
  fireEvent.click(screen.getByRole('button', { name: /choose: DeepSeek-V4.1-Flash/ }));
  const panel = await screen.findByRole('region');
  expect(within(panel).getAllByRole('button')).toHaveLength(4);
  expect(within(panel).queryByText('GLM-5.3')).not.toBeInTheDocument();
  expect(within(panel).queryByText('DeepSeek-V4-Pro')).not.toBeInTheDocument();
});

it('keeps demonstration selections independent across conversation scopes', async () => {
  const { rerender } = render(<StudioDemoModelSelector scopeKey='A' />);
  fireEvent.click(screen.getByRole('button', { name: /choose: DeepSeek-V4.1-Flash/ }));
  fireEvent.click(within(await screen.findByRole('region')).getByRole('button', { name: /Kimi-K3/ }));
  rerender(<StudioDemoModelSelector scopeKey='B' />);
  expect(screen.getByRole('button', { name: /choose: DeepSeek-V4.1-Flash/ })).toBeInTheDocument();
  rerender(<StudioDemoModelSelector scopeKey='A' />);
  expect(screen.getByRole('button', { name: /choose: Kimi-K3/ })).toBeInTheDocument();
});
