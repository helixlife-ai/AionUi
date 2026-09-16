import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Message, Notification } from '@arco-design/web-react';
import GuidModelSelector from '@/renderer/pages/guid/components/GuidModelSelector';
import { StudioConversationModelSelector } from '@/renderer/components/agent/StudioModelSelector';
import type { AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({ useProvidersQuery: () => ({ data: [] }) }));
vi.mock('@arco-design/web-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@arco-design/web-react')>()),
  Message: { success: vi.fn(), error: vi.fn() },
  Notification: { info: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('Studio Web integration', () => {
  const guidProps = {
    backend: 'claude',
    isGeminiMode: false,
    modelList: [],
    current_model: undefined,
    setCurrentModel: vi.fn(),
    currentAcpCachedModelInfo: {
      current_model_id: 'sonnet',
      current_model_label: 'Sonnet',
      available_models: [
        { id: 'sonnet', label: 'Sonnet' },
        { id: 'opus', label: 'k3' },
      ],
    },
    selectedAcpModel: 'sonnet',
    setSelectedAcpModel: vi.fn(),
  };

  it('exposes the Web ACP selector despite the original hidden policy and forwards the exact draft model ID', async () => {
    vi.stubGlobal('electronAPI', undefined);
    const setSelectedAcpModel = vi.fn();
    render(<GuidModelSelector {...guidProps} setSelectedAcpModel={setSelectedAcpModel} />);
    fireEvent.click(screen.getByRole('button', { name: /studioModels.choose: DeepSeek/ }));
    const panel = await screen.findByRole('region');
    fireEvent.click(within(panel).getByRole('button', { name: /Kimi-K3/ }));
    expect(setSelectedAcpModel).toHaveBeenCalledWith('agenthub-kimi-k3');
    expect(Notification.info).not.toHaveBeenCalled();
  });

  it('does not re-enable the blocked Aion CLI provider selector on Web', () => {
    vi.stubGlobal('electronAPI', undefined);
    const { container } = render(<GuidModelSelector {...guidProps} isGeminiMode />);
    expect(container).toBeEmptyDOMElement();
  });

  const model: AcpDerivedOption = {
    id: 'model',
    category: 'model',
    currentValue: 'agenthub-claude',
    options: [
      { value: 'sonnet', label: 'Sonnet' },
      { value: 'opus', label: 'Opus' },
    ],
  };

  it('sends a switch only to the selected conversation callback', async () => {
    const setA = vi.fn().mockResolvedValue(undefined);
    const setB = vi.fn().mockResolvedValue(undefined);
    render(
      <>
        <StudioConversationModelSelector
          backend='claude'
          conversationId='A'
          model={model}
          disabled={false}
          setModel={setA}
        />
        <StudioConversationModelSelector
          backend='claude'
          conversationId='B'
          model={model}
          disabled={false}
          setModel={setB}
        />
      </>
    );
    fireEvent.click(screen.getAllByRole('button', { name: /studioModels.choose: DeepSeek/ })[0]);
    fireEvent.click(within(await screen.findByRole('region')).getByRole('button', { name: /Qwen3.7/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(setA).toHaveBeenCalledWith('model', 'agenthub-qwen3-7-plus'));
    expect(setB).not.toHaveBeenCalled();
  });

  it('reports a rejected runtime switch and retains the confirmed model', async () => {
    const toast = vi.spyOn(Message, 'error');
    render(
      <StudioConversationModelSelector
        backend='claude'
        conversationId='A'
        model={model}
        disabled={false}
        setModel={vi.fn().mockRejectedValue(new Error('offline'))}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /studioModels.choose: DeepSeek/ }));
    fireEvent.click(within(await screen.findByRole('region')).getByRole('button', { name: /Kimi-K3/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('agent.config.failed'));
    expect(Notification.info).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /studioModels.choose: DeepSeek/ })).toBeInTheDocument();
  });

  it('does not report success when runtime configuration is unavailable', async () => {
    vi.mocked(Message.success).mockClear();
    const setter = vi.fn();
    render(
      <StudioConversationModelSelector
        backend='codex'
        conversationId='A'
        model={null}
        disabled={false}
        setModel={setter}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /studioModels.choose:/ }));
    const panel = await screen.findByRole('region');
    expect(within(panel).queryByText('GLM-5.3')).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: /DeepSeek/ }));
    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('agent.config.failed'));
    expect(setter).not.toHaveBeenCalled();
    expect(Notification.info).not.toHaveBeenCalled();
  });

  it('uses the Codex fallback request ID even with an empty runtime catalog', async () => {
    const setter = vi.fn().mockResolvedValue(undefined);
    render(
      <StudioConversationModelSelector
        backend='codex'
        conversationId='A'
        model={{ ...model, currentValue: 'agenthub-kimi-k3', options: [] }}
        disabled={false}
        setModel={setter}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /studioModels.choose: Kimi/ }));
    fireEvent.click(within(await screen.findByRole('region')).getByRole('button', { name: /DeepSeek/ }));
    await waitFor(() => expect(setter).toHaveBeenCalledWith('model', 'agenthub-codex'));
  });

  it('switches immediately and notifies only after runtime success without a dialog', async () => {
    let resolveSwitch!: () => void;
    const setter = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSwitch = resolve;
        })
    );
    render(
      <StudioConversationModelSelector
        backend='claude'
        conversationId='A'
        model={model}
        disabled={false}
        setModel={setter}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /studioModels.choose: DeepSeek/ }));
    fireEvent.click(within(await screen.findByRole('region')).getByRole('button', { name: /Kimi/ }));
    expect(setter).toHaveBeenCalledWith('model', 'agenthub-kimi-k3');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(Notification.info).not.toHaveBeenCalled();
    resolveSwitch();
    await waitFor(() =>
      expect(Notification.info).toHaveBeenCalledWith({
        title: 'agent.studioModels.selected',
        content: 'agent.studioModels.switchWarning',
        duration: 6000,
      })
    );
  });

  it('does not switch when the task is busy', () => {
    const setter = vi.fn();
    render(
      <StudioConversationModelSelector backend='claude' conversationId='A' model={model} disabled setModel={setter} />
    );
    expect(screen.getByRole('button', { name: /studioModels.choose: DeepSeek/ })).toBeDisabled();
    expect(setter).not.toHaveBeenCalled();
    expect(Notification.info).not.toHaveBeenCalled();
  });

  it('does not warn or call the runtime when selecting the current model', async () => {
    const setter = vi.fn();
    render(
      <StudioConversationModelSelector
        backend='claude'
        conversationId='A'
        model={model}
        disabled={false}
        setModel={setter}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /studioModels.choose: DeepSeek/ }));
    fireEvent.click(within(await screen.findByRole('region')).getByRole('button', { name: /DeepSeek/ }));
    expect(Notification.info).not.toHaveBeenCalled();
    expect(setter).not.toHaveBeenCalled();
  });
});
