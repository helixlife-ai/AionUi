import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import StudioModelSelector from './index';
import { getStudioDemoModels, STUDIO_DEMO_RATES, STUDIO_FALLBACK_MODEL } from './catalog';

/** Presentation-only choices never write draft overrides or agent runtime configuration. */
export default function StudioDemoModelSelector({
  scopeKey,
  disabled,
  backend,
}: {
  scopeKey: string;
  disabled?: boolean;
  backend?: string;
}) {
  const { t } = useTranslation();
  const [selections, setSelections] = useState<Record<string, string>>({});
  const models = getStudioDemoModels(backend);
  const selectionKey = `${backend ?? 'claude'}:${scopeKey}`;
  const selected = selections[selectionKey];
  const value = models.some((model) => model.id === selected) ? selected : STUDIO_FALLBACK_MODEL.id;
  return (
    <StudioModelSelector
      scopeKey={selectionKey}
      disabled={disabled}
      models={models}
      rates={STUDIO_DEMO_RATES}
      value={value}
      notice={t('agent.studioModels.demoNotice')}
      onSelect={(id) => setSelections((previous) => ({ ...previous, [selectionKey]: id }))}
    />
  );
}
