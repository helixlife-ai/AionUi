/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const Block: React.FC<{
  className?: string;
  style?: React.CSSProperties;
  variant?: 'pill' | 'card' | 'tile' | 'soft';
}> = ({ className = '', style, variant = 'soft' }) => (
  <div className={`aion-skeleton-block aion-skeleton-block--${variant} ${className}`.trim()} style={style} />
);

const ThinNavRow: React.FC<{ width: number }> = ({ width }) => (
  <div className='h-34px px-10px flex items-center gap-8px'>
    <Block variant='soft' className='size-16px shrink-0' style={{ width: 16, height: 16 }} />
    <Block variant='pill' style={{ width: `${width}%`, height: 12 }} />
  </div>
);

/**
 * Full-app placeholder shown while renderer config boots (replaces the blank white screen).
 * Mirrors the sider + guid hero layout so first paint feels intentional.
 */
const AppBootstrapSkeleton: React.FC = () => {
  return (
    <div className='flex size-full min-h-100vh bg-[var(--color-bg-1)]' data-testid='app-bootstrap-skeleton'>
      <aside className='hidden md:flex w-260px shrink-0 flex-col border-r border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-12px gap-2px'>
        <div className='flex items-center gap-10px px-6px py-4px mb-6px'>
          <Block variant='soft' className='size-32px' style={{ width: 32, height: 32 }} />
          <Block variant='pill' style={{ width: 56, height: 14 }} />
        </div>
        {[72, 56, 68].map((width, index) => (
          <ThinNavRow key={index} width={width} />
        ))}
        <div className='h-1px bg-[var(--color-border-2)] my-6px' />
        <Block variant='pill' className='mx-10px mb-2px' style={{ width: 40, height: 10 }} />
        {[88, 76, 92, 70, 84].map((width, index) => (
          <ThinNavRow key={index} width={width} />
        ))}
      </aside>
      <main className='flex-1 min-w-0 flex flex-col items-center justify-center px-24px gap-20px'>
        <Block variant='pill' style={{ width: 280, maxWidth: '100%', height: 28 }} />
        <div className='flex gap-10px'>
          {[96, 112, 104].map((width, index) => (
            <Block key={index} variant='pill' style={{ width, height: 32 }} />
          ))}
        </div>
        <Block variant='card' className='w-full max-w-720px' style={{ height: 128 }} />
        <div className='w-full max-w-720px flex flex-col gap-10px mt-4px'>
          <Block variant='pill' style={{ width: 120, height: 12 }} />
          {[92, 84, 88].map((width, index) => (
            <Block key={index} variant='pill' style={{ width: `${width}%`, height: 12 }} />
          ))}
        </div>
      </main>
    </div>
  );
};

export default AppBootstrapSkeleton;
