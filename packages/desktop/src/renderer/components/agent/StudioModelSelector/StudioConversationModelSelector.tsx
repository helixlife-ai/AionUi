import React from 'react';
import { Message, Notification } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';
import StudioModelSelector from './index';
import { getStudioModels, isStudioBackend, STUDIO_MODEL_RATES } from './catalog';

type Props = {
  conversationId: string;
  backend?: string;
  model: AcpDerivedOption | null;
  disabled: boolean;
  setModel: (optionId: string, value: string) => Promise<unknown>;
};

/** Remount selection state when switching tasks or agents. */
export default function StudioConversationModelSelector(props: Props) {
  return <ConversationModelControl key={`${props.backend}:${props.conversationId}`} {...props} />;
}

/** Keep model selection owned by the existing conversation runtime hook. */
function ConversationModelControl({ conversationId, model, disabled, setModel, backend }: Props) {
  const { t } = useTranslation();
  if (!isStudioBackend(backend)) return null;
  const models = getStudioModels(backend);
  return (
    <StudioModelSelector
      backend={backend}
      scopeKey={conversationId}
      value={model?.currentValue}
      disabled={disabled}
      models={models}
      rates={STUDIO_MODEL_RATES}
      onSelect={async (id) => {
        try {
          if (!model) throw new Error('Model configuration is not ready');
          await setModel(model.id, id);
        } catch (error) {
          Message.error(t('agent.config.failed'));
          throw error;
        }
        Notification.info({
          title: t('agent.studioModels.selected', { model: models.find((item) => item.id === id)?.label || id }),
          content: t('agent.studioModels.switchWarning'),
          duration: 6000,
        });
      }}
    />
  );
}
