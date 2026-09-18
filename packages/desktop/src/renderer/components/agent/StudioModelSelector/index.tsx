import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, Spin, Tooltip, Trigger } from '@arco-design/web-react';
import { Check, Down, Info, Up } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import {
  formatStudioModelRate,
  getStudioModelDescriptionKey,
  normalizeStudioModelId,
  withStudioFallback,
} from './catalog';
import type { StudioBackend, StudioModelOption, StudioModelRates } from './catalog';
import styles from './StudioModelSelector.module.css';

export type { StudioModelOption, StudioModelRates } from './catalog';
export { default as StudioConversationModelSelector } from './StudioConversationModelSelector';

export { isStudioModelSelectorEnabled } from './catalog';

export type StudioModelSelectorProps = {
  backend?: StudioBackend;
  notice?: string;
  models: StudioModelOption[];
  value?: string | null;
  currentLabel?: string | null;
  onSelect: (id: string) => void | Promise<unknown>;
  disabled?: boolean;
  loading?: boolean;
  scopeKey?: string;
  rates?: StudioModelRates;
  loadRates?: () => Promise<StudioModelRates>;
};

/** Present a runtime-owned catalog without inventing model IDs or changing global agent configuration. */
export default function StudioModelSelector({
  backend = 'claude',
  notice,
  models,
  value,
  currentLabel,
  onSelect,
  disabled = false,
  loading = false,
  scopeKey = '',
  rates,
  loadRates,
}: StudioModelSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [fetchedRates, setFetchedRates] = useState<StudioModelRates>();
  const [ratesLoading, setRatesLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const selectionRequest = useRef(0);
  const selectingRef = useRef(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const effectiveRates = loadRates ? fetchedRates : rates;
  const catalog = withStudioFallback(models, backend);
  const uniqueModels = catalog.filter((model, index) => catalog.findIndex((item) => item.id === model.id) === index);
  const normalizedValue = normalizeStudioModelId(value);
  const label =
    uniqueModels.find((model) => model.id === normalizedValue)?.label ||
    currentLabel ||
    value ||
    t('agent.studioModels.choose');
  const missingRates = uniqueModels.some((model) => formatStudioModelRate(effectiveRates?.[model.id]) === '--');

  useEffect(() => {
    request.current += 1;
    selectionRequest.current += 1;
    selectingRef.current = false;
    setOpen(false);
    setFailed(false);
    setSelecting(false);
    setFetchedRates(undefined);
    setRatesLoading(false);
    return () => {
      request.current += 1;
      selectionRequest.current += 1;
    };
  }, [scopeKey]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const changeOpen = (next: boolean) => {
    if (next && disabled) return;
    setOpen(next);
    if (!next) {
      request.current += 1;
      return;
    }
    setFailed(false);
    if (loadRates) {
      const version = ++request.current;
      setFetchedRates(undefined);
      setRatesLoading(true);
      void Promise.resolve()
        .then(loadRates)
        .then((result) => {
          if (version === request.current) setFetchedRates(result);
        })
        .catch(() => {
          if (version === request.current) setFetchedRates(undefined);
        })
        .finally(() => {
          if (version === request.current) setRatesLoading(false);
        });
    }
  };

  const select = async (id: string) => {
    if (disabled || selectingRef.current) return;
    if (id === normalizedValue) {
      changeOpen(false);
      return;
    }
    const version = ++selectionRequest.current;
    selectingRef.current = true;
    setSelecting(true);
    setFailed(false);
    try {
      await onSelect(id);
      if (version === selectionRequest.current) changeOpen(false);
    } catch {
      if (version === selectionRequest.current) setFailed(true);
    } finally {
      if (version === selectionRequest.current) {
        selectingRef.current = false;
        setSelecting(false);
      }
    }
  };

  const popup = (
    <section
      className={styles.panel}
      id={menuId}
      aria-label={t('agent.studioModels.choose')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          changeOpen(false);
          triggerRef.current?.querySelector('button')?.focus();
        }
      }}
    >
      <div className={styles.heading}>
        <strong>{t('agent.studioModels.choose')}</strong>
        <span className={styles.rateHeading}>
          {t('agent.studioModels.referenceRate')}
          {missingRates && !ratesLoading && (
            <Tooltip content={t('agent.studioModels.rateUnavailable')} trigger={['hover', 'click', 'focus']}>
              <Button type='text' size='mini' aria-label={t('agent.studioModels.rateUnavailable')} icon={<Info />} />
            </Tooltip>
          )}
        </span>
      </div>
      <Spin loading={loading} className={styles.list}>
        {uniqueModels.length === 0 ? (
          <div className={styles.empty}>{t('agent.studioModels.empty')}</div>
        ) : (
          uniqueModels.map((model) => {
            const descriptionKey = getStudioModelDescriptionKey(model.id);
            return (
              <Button
                key={model.id}
                type='text'
                className={styles.row}
                aria-pressed={model.id === normalizedValue}
                disabled={disabled || selecting}
                onClick={() => void select(model.id)}
              >
                <span className={styles.copy}>
                  <span className={styles.name}>
                    {model.label}
                    {model.id === normalizedValue && (
                      <Check className={styles.check} size={18} strokeWidth={4} fill='currentColor' />
                    )}
                  </span>
                  <span className={styles.description}>
                    {descriptionKey
                      ? t(descriptionKey)
                      : model.description || t('agent.studioModels.scenarios.generic')}
                  </span>
                </span>
                <span className={styles.rate}>
                  {ratesLoading ? '--' : formatStudioModelRate(effectiveRates?.[model.id])}
                </span>
              </Button>
            );
          })
        )}
      </Spin>
      {failed && (
        <div role='alert' className={styles.error}>
          {t('agent.config.failed')}
        </div>
      )}
      <footer className={styles.footer}>
        {notice && <div>{notice}</div>}
        {t('agent.studioModels.disclaimer')}
      </footer>
    </section>
  );

  return (
    <Trigger
      popup={() => popup}
      trigger='click'
      position='br'
      popupVisible={open}
      onVisibleChange={changeOpen}
      autoFitPosition
      popupAlign={{ bottom: 8 }}
      unmountOnExit
    >
      <div ref={triggerRef} className={styles.triggerWrap}>
        <Button
          className={styles.trigger}
          disabled={disabled}
          loading={loading || selecting}
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`${t('agent.studioModels.choose')}: ${label}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') changeOpen(false);
          }}
        >
          <span className={styles.triggerLabel}>{label}</span>
          {open ? <Up /> : <Down />}
        </Button>
      </div>
    </Trigger>
  );
}
