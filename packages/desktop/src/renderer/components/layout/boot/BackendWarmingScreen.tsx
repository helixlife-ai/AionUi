/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Spin } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import AppBootstrapSkeleton from '../AppBootstrapSkeleton';

type BackendWarmingScreenProps = {
  /** 1-based poll attempt counter for subtle progress feedback. */
  attempt?: number;
};

/**
 * Full-viewport boot UI while aioncore is still warming (Agent Hub appliances).
 * Keeps the app shell silhouette (skeleton) and overlays a clear status message
 * so cold start does not look like a blank / hung page.
 */
const BackendWarmingScreen: React.FC<BackendWarmingScreenProps> = ({ attempt = 0 }) => {
  const { t } = useTranslation();

  return (
    <div className='relative size-full min-h-100vh' data-testid='backend-warming-screen'>
      <AppBootstrapSkeleton />
      {/* Avoid color-mix — appliance / Safari 15 WebViews may not support it. */}
      <div className='absolute inset-0 z-10 bg-bg-1 opacity-70' aria-hidden />
      <div className='absolute inset-0 z-20 flex items-center justify-center px-24px'>
        <div className='flex max-w-420px flex-col items-center gap-14px rounded-12px border border-[var(--color-border-2)] bg-bg-2 px-28px py-24px text-center'>
          <Spin size={28} />
          <div className='text-16px font-medium text-t-primary'>{t('common.backendWarming.title')}</div>
          <div className='text-13px leading-22px text-t-secondary'>{t('common.backendWarming.description')}</div>
          <div className='text-12px text-t-tertiary'>{t('common.backendWarming.hint')}</div>
          {attempt > 0 ? (
            <div className='text-11px text-t-tertiary' aria-hidden>
              {t('common.backendWarming.attempt', { count: attempt })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default BackendWarmingScreen;
