import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import GuidModelSelector from '@/renderer/pages/guid/components/GuidModelSelector';
import { StudioConversationModelSelector } from '@/renderer/components/agent/StudioModelSelector';
import type { AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';

vi.mock('@/renderer/components/agent/StudioModelSelector/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/renderer/components/agent/StudioModelSelector/catalog')>()),
  STUDIO_MODEL_DEMO_ENABLED: false,
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({ useProvidersQuery: () => ({ data: [] }) }));
vi.mock('@arco-design/web-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@arco-design/web-react')>()),
  Message: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Studio Web integration', () => {
  const guidProps = {
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
    fireEvent.click(screen.getByRole('button', { name: /studioModels.choose: Sonnet/ }));
    const panel = await screen.findByRole('region');
    fireEvent.click(within(panel).getByRole('button', { name: /k3/ }));
    expect(setSelectedAcpModel).toHaveBeenCalledWith('opus');
  });

  it('does not re-enable the blocked Aion CLI provider selector on Web', () => {
    vi.stubGlobal('electronAPI', undefined);
    const { container } = render(<GuidModelSelector {...guidProps} isGeminiMode />);
    expect(container).toBeEmptyDOMElement();
  });

  const model: AcpDerivedOption = {
    id: 'model',
    category: 'model',
    currentValue: 'sonnet',
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
        <StudioConversationModelSelector conversationId='A' model={model} disabled={false} setModel={setA} />
        <StudioConversationModelSelector conversationId='B' model={model} disabled={false} setModel={setB} />
      </>
    );
    fireEvent.click(screen.getAllByRole('button', { name: /studioModels.choose: Sonnet/ })[0]);
    fireEvent.click(within(await screen.findByRole('region')).getByRole('button', { name: /Opus/ }));
    await waitFor(() => expect(setA).toHaveBeenCalledWith('model', 'opus'));
    expect(setB).not.toHaveBeenCalled();
  });

  it('reports a rejected runtime switch and retains the confirmed model', async () => {
    const toast = vi.spyOn(Message, 'error');
    render(
      <StudioConversationModelSelector
        conversationId='A'
        model={model}
        disabled={false}
        setModel={vi.fn().mockRejectedValue(new Error('offline'))}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /studioModels.choose: Sonnet/ }));
    fireEvent.click(within(await screen.findByRole('region')).getByRole('button', { name: /Opus/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('agent.config.failed'));
    expect(screen.getByRole('button', { name: /studioModels.choose: Sonnet/ })).toBeInTheDocument();
  });
});
