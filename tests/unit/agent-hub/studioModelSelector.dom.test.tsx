import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StudioModelSelector from '@/renderer/components/agent/StudioModelSelector';
import en from '@/renderer/services/i18n/locales/en-US/agent.json';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key
        .split('.')
        .slice(1)
        .reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], en),
  }),
}));

const models = [
  { id: 'qwen3.5-plus', label: 'Qwen3.5-Plus' },
  { id: 'qwen3.7-plus', label: 'Qwen3.7-Plus' },
  { id: 'agenthub-claude-deepseek-v4-1-flash', label: 'DeepSeek-V4.1-Flash' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek-V4-Pro' },
  { id: 'glm-5.3', label: 'GLM-5.3' },
  { id: 'kimi-k3', label: 'Kimi-K3' },
];
const rates = {
  'qwen3.5-plus': 0.29,
  'qwen3.7-plus': 0.64,
  'agenthub-claude-deepseek-v4-1-flash': { min: 0.44, max: 0.89 },
  'deepseek-v4-pro': { min: 1.33, max: 2.66 },
  'glm-5.3': 1.9,
  'kimi-k3': 4.22,
};
const open = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^Choose model:/ }));
  return screen.findByRole('region', { name: 'Choose model' });
};
afterEach(cleanup);

describe('Studio model selection', () => {
  it('uses a larger bold check that inherits the model accent color', async () => {
    render(<StudioModelSelector models={models} value='agenthub-claude-deepseek-v4-1-flash' onSelect={vi.fn()} />);
    const selected = within(await open()).getByRole('button', { pressed: true });
    expect(selected.querySelector('svg')).toHaveAttribute('width', '18');
    expect(selected.querySelector('[stroke-width="4"]')).toHaveAttribute('stroke', 'currentColor');
  });
  it('shows the six-model design with descriptions and fixed-format rates', async () => {
    render(
      <StudioModelSelector
        models={models}
        rates={rates}
        value='agenthub-claude-deepseek-v4-1-flash'
        onSelect={vi.fn()}
      />
    );
    const panel = await open();
    expect(within(panel).getAllByRole('button', { pressed: false })).toHaveLength(5);
    expect(within(panel).getByText('0.44～0.89×')).toBeInTheDocument();
    expect(within(panel).getByText('Quick questions, everyday tasks')).toBeInTheDocument();
  });
  it('passes the exact runtime ID and closes after a successful selection', async () => {
    const onSelect = vi.fn().mockResolvedValue(undefined);
    render(<StudioModelSelector models={[{ id: 'opus', label: 'k3' }]} value='default' onSelect={onSelect} />);
    const panel = await open();
    fireEvent.click(within(panel).getByRole('button', { name: /k3/ }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('opus'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Choose model:/ })).toHaveAttribute('aria-expanded', 'false')
    );
  });
  it('keeps the previous selection and reports a rejected switch', async () => {
    render(
      <StudioModelSelector
        models={models}
        value='agenthub-claude-deepseek-v4-1-flash'
        onSelect={vi.fn().mockRejectedValue(new Error('rejected'))}
      />
    );
    const panel = await open();
    fireEvent.click(within(panel).getByRole('button', { name: /Kimi-K3/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { pressed: true })).toHaveTextContent('DeepSeek-V4.1-Flash');
  });
  it('does not allow a busy conversation to switch', () => {
    render(
      <StudioModelSelector models={models} disabled value='agenthub-claude-deepseek-v4-1-flash' onSelect={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /^Choose model:/ })).toBeDisabled();
  });
  it('closes on Escape without changing the selection', async () => {
    const onSelect = vi.fn();
    render(<StudioModelSelector models={models} onSelect={onSelect} />);
    fireEvent.keyDown(await open(), { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Choose model:/ })).toHaveAttribute('aria-expanded', 'false');
  });
  it('fetches rates once per opening and retries failures without blocking model selection', async () => {
    const loadRates = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(rates);
    render(
      <StudioModelSelector
        models={models}
        value='agenthub-claude-deepseek-v4-1-flash'
        onSelect={vi.fn()}
        loadRates={loadRates}
      />
    );
    let panel = await open();
    await waitFor(() => expect(within(panel).getAllByText('--')).toHaveLength(6));
    expect(within(panel).getByRole('button', { name: /Kimi-K3/ })).not.toBeDisabled();
    fireEvent.keyDown(panel, { key: 'Escape' });
    panel = await open();
    expect(await within(panel).findByText('4.22×')).toBeInTheDocument();
    expect(loadRates).toHaveBeenCalledTimes(2);
  });
  it('switching conversation scopes resets the popup and uses the other conversation model', async () => {
    const { rerender } = render(
      <StudioModelSelector
        scopeKey='A'
        models={models}
        value='agenthub-claude-deepseek-v4-1-flash'
        onSelect={vi.fn()}
      />
    );
    await open();
    rerender(<StudioModelSelector scopeKey='B' models={models} value='kimi-k3' onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Choose model: Kimi-K3' })).toHaveAttribute('aria-expanded', 'false');
  });
  it('always shows the fallback when the runtime catalog is empty', async () => {
    render(<StudioModelSelector models={[]} onSelect={vi.fn()} />);
    expect(within(await open()).getByRole('button', { name: /DeepSeek-V4.1-Flash/ })).toBeInTheDocument();
  });
  it('shows the current fallback label for the legacy Claude alias', async () => {
    render(<StudioModelSelector models={models} value='agenthub-claude' onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Choose model: DeepSeek-V4.1-Flash' })).toBeInTheDocument();
    expect(within(await open()).getByRole('button', { name: /DeepSeek-V4.1-Flash/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
  it('shows the fallback label for the ACP default sentinel', async () => {
    render(<StudioModelSelector models={models} value='default' onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Choose model: DeepSeek-V4.1-Flash' })).toBeInTheDocument();
    expect(within(await open()).getByRole('button', { name: /DeepSeek-V4.1-Flash/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
