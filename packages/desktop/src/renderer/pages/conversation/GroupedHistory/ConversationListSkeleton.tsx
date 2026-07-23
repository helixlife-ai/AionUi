/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const ROW_WIDTHS = [88, 76, 92, 70, 84, 78];

/**
 * Sidebar conversation-list placeholder while history IPC has not hydrated yet.
 */
const ConversationListSkeleton: React.FC<{ rows?: number }> = ({ rows = ROW_WIDTHS.length }) => {
  const widths = ROW_WIDTHS.slice(0, Math.max(1, rows));
  return (
    <div className='px-8px py-4px flex flex-col gap-2px' data-testid='conversation-list-skeleton'>
      <div className='aion-skeleton-block aion-skeleton-block--pill mx-10px mt-6px mb-4px' style={{ width: 40, height: 10 }} />
      {widths.map((width, index) => (
        <div key={index} className='h-34px px-10px flex items-center gap-8px'>
          <div className='aion-skeleton-block aion-skeleton-block--soft size-14px shrink-0' />
          <div className='aion-skeleton-block aion-skeleton-block--pill h-12px' style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
};

export default ConversationListSkeleton;
