import React from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';
import StudioModelSelector from './index';
import StudioDemoModelSelector from './StudioDemoModelSelector';
import { STUDIO_MODEL_DEMO_ENABLED } from './catalog';

/** Keep model selection owned by the existing conversation runtime hook. */
export default function StudioConversationModelSelector({
  conversationId,
  model,
  disabled,
  setModel,
  backend,
}: {
  conversationId: string;
  backend?: string;
  model: AcpDerivedOption | null;
  disabled: boolean;
  setModel: (optionId: string, value: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  if (STUDIO_MODEL_DEMO_ENABLED)
    return <StudioDemoModelSelector scopeKey={conversationId} disabled={disabled} backend={backend} />;
  return (
    <StudioModelSelector
      scopeKey={conversationId}
      value={model?.currentValue}
      disabled={disabled}
      models={
        model?.options.map((item) => ({
          id: item.value,
          label: item.label,
          description: item.description ?? undefined,
        })) ?? []
      }
      onSelect={async (id) => {
        if (!model) return;
        try {
          await setModel(model.id, id);
          Message.success(
            t('agent.studioModels.selected', { model: model.options.find((item) => item.value === id)?.label || id })
          );
        } catch (error) {
          Message.error(t('agent.config.failed'));
          throw error;
        }
      }}
    />
  );
}
