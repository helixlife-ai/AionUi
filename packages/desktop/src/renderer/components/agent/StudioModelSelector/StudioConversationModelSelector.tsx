import React from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';
import StudioModelSelector from './index';
import {
  getStudioModels,
  isStudioBackend,
  normalizeStudioModelId,
  resolveStudioConversationModel,
  STUDIO_MODEL_RATES,
} from './catalog';

type Props = {
  conversationId: string;
  backend?: string;
  model: AcpDerivedOption | null;
  initialModelId?: string;
  disabled: boolean;
  setModel: (optionId: string, value: string) => Promise<unknown>;
};

/** Remount selection state when switching tasks or agents. */
export default function StudioConversationModelSelector(props: Props) {
  return <ConversationModelControl key={`${props.backend}:${props.conversationId}`} {...props} />;
}

/** Keep model selection owned by the existing conversation runtime hook. */
function ConversationModelControl({ conversationId, model, initialModelId, disabled, setModel, backend }: Props) {
  const { t } = useTranslation();
  const [pendingValue, setPendingValue] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (pendingValue && normalizeStudioModelId(model?.currentValue) === normalizeStudioModelId(pendingValue)) {
      setPendingValue(null);
    }
  }, [model?.currentValue, pendingValue]);
  if (!isStudioBackend(backend)) return null;
  const models = getStudioModels(backend);
  const selectedValue = pendingValue || resolveStudioConversationModel(backend, model?.currentValue, initialModelId);
  return (
    <StudioModelSelector
      backend={backend}
      scopeKey={conversationId}
      value={selectedValue}
      disabled={disabled}
      models={models}
      rates={STUDIO_MODEL_RATES}
      onSelect={async (id) => {
        setPendingValue(id);
        try {
          if (!model) throw new Error('Model configuration is not ready');
          await setModel(model.id, id);
        } catch (error) {
          setPendingValue(null);
          Message.error(t('agent.config.failed'));
          throw error;
        }
        Message.info({
          content: `${t('agent.studioModels.selected', { model: models.find((item) => item.id === id)?.label || id })} — ${t('agent.studioModels.switchWarning')}`,
          duration: 6000,
        });
      }}
    />
  );
}
