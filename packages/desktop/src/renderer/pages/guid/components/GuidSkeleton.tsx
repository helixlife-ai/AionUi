/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import styles from '../index.module.css';

const Block: React.FC<{
  className?: string;
  style?: React.CSSProperties;
  variant?: 'pill' | 'card' | 'tile' | 'soft';
}> = ({ className = '', style, variant = 'soft' }) => (
  <div className={`aion-skeleton-block aion-skeleton-block--${variant} ${className}`.trim()} style={style} />
);

/**
 * Skeleton placeholder for the AssistantSelectionArea while custom agents load.
 */
export const AssistantsSkeleton: React.FC = () => {
  const widths = [96, 112, 104];
  return (
    <div className='mt-16px w-full' data-testid='guid-assistants-skeleton'>
      <div className='flex flex-wrap gap-10px justify-center'>
        {widths.map((w, i) => (
          <Block key={i} variant='pill' style={{ width: w, height: 32 }} />
        ))}
      </div>
    </div>
  );
};

/**
 * Placeholder for the guid input card + prompt hints while agents load.
 */
export const GuidInputCardSkeleton: React.FC = () => {
  return (
    <div className='w-full mt-20px' data-testid='guid-input-skeleton'>
      <Block variant='card' className='w-full' style={{ height: 128 }} />
      <div className='mt-20px w-full flex flex-col gap-10px'>
        <Block variant='pill' style={{ width: 120, height: 12 }} />
        {[92, 84, 88].map((width, index) => (
          <Block key={index} variant='pill' style={{ width: `${width}%`, height: 12 }} />
        ))}
      </div>
    </div>
  );
};

/**
 * Guid hero placeholders for agent pills + input while assistants are loading.
 * Greeting text stays visible so the page does not feel blank.
 */
export const GuidAgentsLoadingSkeleton: React.FC = () => {
  return (
    <>
      <AssistantsSkeleton />
      <GuidInputCardSkeleton />
    </>
  );
};

/**
 * Full Guid content-area skeleton for route Suspense (fills the blank right panel).
 */
export const GuidPageSkeleton: React.FC = () => {
  return (
    <div className={styles.guidContainer} data-testid='guid-page-skeleton'>
      <div className={styles.guidLayout}>
        <div className={styles.heroHeader}>
          <Block variant='pill' style={{ width: 260, height: 28 }} />
        </div>
        <AssistantsSkeleton />
        <GuidInputCardSkeleton />
      </div>
    </div>
  );
};
