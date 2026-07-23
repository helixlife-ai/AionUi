/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React from 'react';

const NAV_LINE_WIDTHS = [72, 56, 68];

/**
 * Skeleton for the fixed top sider entries (new chat / assistant / scheduled)
 * while conversation history is still hydrating / mounting.
 */
const SiderTopNavSkeleton: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  return (
    <div
      className={classNames('shrink-0 flex flex-col gap-2px', collapsed ? 'px-6px' : 'px-8px')}
      data-testid='sider-top-nav-skeleton'
    >
      {NAV_LINE_WIDTHS.map((width, index) => (
        <div
          key={index}
          className={classNames('h-34px flex items-center', collapsed ? 'justify-center' : 'gap-8px px-10px')}
        >
          <div className='aion-skeleton-block aion-skeleton-block--soft size-16px shrink-0' />
          {!collapsed && (
            <div className='aion-skeleton-block aion-skeleton-block--pill h-12px' style={{ width: `${width}%` }} />
          )}
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for sider footer (settings + theme toggle).
 */
export const SiderFooterSkeleton: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  return (
    <div
      className='shrink-0 sider-footer mt-auto pt-8px pb-8px border-t border-solid border-[var(--color-border-2)] border-l-0 border-r-0 border-b-0'
      data-testid='sider-footer-skeleton'
    >
      <div className={classNames('flex px-8px gap-2px', collapsed ? 'flex-col items-center' : 'items-center')}>
        <div className={classNames('h-34px flex items-center gap-8px', collapsed ? 'justify-center' : 'flex-1 px-10px')}>
          <div className='aion-skeleton-block aion-skeleton-block--soft size-16px shrink-0' />
          {!collapsed && <div className='aion-skeleton-block aion-skeleton-block--pill h-12px w-48px' />}
        </div>
        <div className='size-34px flex items-center justify-center shrink-0'>
          <div className='aion-skeleton-block aion-skeleton-block--soft size-16px' />
        </div>
      </div>
    </div>
  );
};

/**
 * Skeleton for the Layout sider brand row (logo + product title).
 */
export const SiderBrandSkeleton: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  return (
    <div
      className={classNames(
        'flex items-center justify-start pt-8px pb-8px gap-12px layout-sider-header',
        collapsed ? 'pl-12px pr-12px' : 'pl-18px pr-16px'
      )}
      data-testid='sider-brand-skeleton'
    >
      <div className='aion-skeleton-block aion-skeleton-block--soft size-32px shrink-0' style={{ width: 32, height: 32 }} />
      {!collapsed && <div className='aion-skeleton-block aion-skeleton-block--pill h-14px w-56px' />}
    </div>
  );
};

export default SiderTopNavSkeleton;
