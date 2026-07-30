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

/** Message-area placeholders used while conversation metadata is still loading. */
export const ConversationMessageAreaSkeleton: React.FC = () => {
  const rows = [
    { align: 'left' as const, bubbleWidth: '100%', lines: [72, 58, 64] },
    { align: 'right' as const, bubbleWidth: '82%', lines: [54, 48] },
    { align: 'left' as const, bubbleWidth: '100%', lines: [68, 76, 44] },
    { align: 'right' as const, bubbleWidth: '78%', lines: [60, 42] },
    { align: 'left' as const, bubbleWidth: '100%', lines: [74, 62, 40] },
  ];

  return (
    <div
      className='flex-1 h-full overflow-hidden pb-10px box-border px-16px'
      data-testid='conversation-message-area-skeleton'
    >
      <div className='min-h-full flex flex-col justify-between py-10px box-border'>
        {rows.map((row, index) => (
          <div
            key={index}
            className={`w-full min-w-0 flex items-start m-t-10px ${
              row.align === 'right' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className='flex-none min-w-0 rd-16px p-14px'
              style={{
                width: row.bubbleWidth,
                maxWidth: '100%',
                background: 'var(--color-fill-1)',
                border: '1px solid var(--color-border-2)',
              }}
            >
              <div className='flex flex-col gap-10px'>
                {row.lines.map((width, lineIndex) => (
                  <div
                    key={lineIndex}
                    className='h-12px rd-999px'
                    style={{
                      width: `${width}%`,
                      background:
                        'linear-gradient(90deg, var(--color-fill-2) 25%, var(--color-fill-3) 50%, var(--color-fill-2) 75%)',
                      backgroundSize: '200% 100%',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Right-panel file-tree placeholders while workspace listing is in flight. */
export const WorkspacePanelSkeleton: React.FC = () => {
  const widths = [88, 72, 80, 64, 76, 70, 84];
  return (
    <div className='flex flex-col gap-10px p-16px box-border' data-testid='workspace-panel-skeleton'>
      <Block variant='pill' style={{ width: 120, height: 12 }} />
      {widths.map((width, index) => (
        <Block key={index} variant='pill' style={{ width: `${width}%`, height: 14 }} />
      ))}
    </div>
  );
};

/**
 * Full conversation content-area skeleton for route Suspense
 * (fills the blank right panel while the conversation chunk loads).
 */
export const ConversationPageSkeleton: React.FC = () => {
  return (
    <div className='flex flex-col h-full min-h-0 bg-1' data-testid='conversation-page-skeleton'>
      <div className='shrink-0 flex items-center gap-12px px-16px py-12px border-b border-b-base'>
        <Block variant='pill' style={{ width: 28, height: 28 }} />
        <Block variant='pill' style={{ width: 180, height: 16 }} />
        <div className='flex-1' />
        <Block variant='pill' style={{ width: 96, height: 28 }} />
      </div>
      <div className='flex flex-1 min-h-0'>
        <div className='flex-1 min-w-0'>
          <ConversationMessageAreaSkeleton />
        </div>
        <div
          className='shrink-0 border-l border-b-base'
          style={{ width: 280, borderLeft: '1px solid var(--bg-3)' }}
        >
          <div className='px-16px py-12px border-b border-b-base'>
            <Block variant='pill' style={{ width: 100, height: 14 }} />
          </div>
          <WorkspacePanelSkeleton />
        </div>
      </div>
    </div>
  );
};
