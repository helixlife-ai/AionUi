import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import GuidModelSelector from '@/renderer/pages/guid/components/GuidModelSelector';
import { StudioConversationModelSelector } from '@/renderer/components/agent/StudioModelSelector';
import type { AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({ useProvidersQuery: () => ({ data: [] }) }));
vi.mock('@arco-design/web-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@arco-design/web-react')>()),
  Message: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
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
    expect(Message.success).toHaveBeenCalledWith('agent.studioModels.selected');
  });

  it('does not re-enable the blocked Aion CLI provider selector on Web', () => {
    vi.stubGlobal('electronAPI', undefined);
    const { container } = render(<GuidModelSelector {...guidProps} isGeminiMode />);
    expect(container).toBeEmptyDOMElement();
  });

  const model: AcpDerivedOption = {
    id: 'model',
    category: 'model',
    currentValue: 'agenthub-deepseek-v4-1-flash',
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
    expect(Message.info).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /studioModels.choose: DeepSeek/ })).toBeInTheDocument();
  });

  it('keeps a legacy Flash request ID while showing the current Flash label', async () => {
    const setter = vi.fn();
    render(
      <StudioConversationModelSelector
        backend='claude'
        conversationId='legacy'
        model={{ ...model, currentValue: 'agenthub-claude' }}
        disabled={false}
        setModel={setter}
      />
    );
    expect(screen.getByRole('button', { name: /studioModels.choose: DeepSeek-V4.1-Flash/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /studioModels.choose: DeepSeek-V4.1-Flash/ }));
    fireEvent.click(within(await screen.findByRole('region')).getByRole('button', { name: /DeepSeek-V4.1-Flash/ }));
    expect(setter).not.toHaveBeenCalled();
  });

  it('uses the persisted conversation model when the runtime snapshot is empty', () => {
    render(
      <StudioConversationModelSelector
        backend='codex'
        conversationId='persisted'
        model={{ ...model, currentValue: null }}
        initialModelId='agenthub-kimi-k3'
        disabled={false}
        setModel={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /studioModels.choose: Kimi-K3/ })).toBeInTheDocument();
  });

  it('does not report success when runtime configuration is unavailable', async () => {
    vi.mocked(Message.info).mockClear();
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
    expect(within(panel).getByText('GLM-5.3')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: /DeepSeek/ }));
    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('agent.config.failed'));
    expect(setter).not.toHaveBeenCalled();
    expect(Message.info).not.toHaveBeenCalled();
  });

  it.each([
    ['DeepSeek', 'agenthub-deepseek-v4-1-flash'],
    ['GLM', 'agenthub-glm-5-3'],
  ])('uses the confirmed Codex %s request ID even with an empty runtime catalog', async (label, id) => {
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
    fireEvent.click(within(await screen.findByRole('region')).getByRole('button', { name: new RegExp(label) }));
    await waitFor(() => expect(setter).toHaveBeenCalledWith('model', id));
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
    expect(Message.info).not.toHaveBeenCalled();
    resolveSwitch();
    await waitFor(() =>
      expect(Message.info).toHaveBeenCalledWith({
        content: 'agent.studioModels.selected — agent.studioModels.switchWarning',
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
    expect(Message.info).not.toHaveBeenCalled();
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
    expect(Message.info).not.toHaveBeenCalled();
    expect(setter).not.toHaveBeenCalled();
  });
});
