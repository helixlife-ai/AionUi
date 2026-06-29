/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import PwaPullToRefresh from '@/renderer/components/layout/PwaPullToRefresh';
import Titlebar from '@/renderer/components/layout/Titlebar';
import { Layout as ArcoLayout, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { setGlobalNavigate } from '@/renderer/utils/navigation';
import { LayoutContext } from '@renderer/hooks/context/LayoutContext';
import { NavigationHistoryProvider } from '@renderer/hooks/context/NavigationHistoryContext';
import { useDeepLink } from '@renderer/hooks/system/useDeepLink';
import { useNotificationClick } from '@renderer/hooks/system/notification/useNotificationClick';
import { useBrowserNotification } from '@renderer/hooks/system/notification/useBrowserNotification';
import { useDirectorySelection } from '@renderer/hooks/file/useDirectorySelection';
import { cleanupSiderTooltips } from '@renderer/utils/ui/siderTooltip';
import { useConversationShortcuts } from '@renderer/hooks/ui/useConversationShortcuts';
import { isElectronDesktop } from '@renderer/utils/platform';
import '@renderer/styles/layout.css';

const SidebarIcon: React.FC<{ size?: number; strokeWidth?: number }> = ({ size = 18, strokeWidth = 4 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 48 48'
    fill='none'
    stroke='currentColor'
    strokeWidth={strokeWidth}
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-hidden='true'
    focusable='false'
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
  >
    <rect x='6' y='10' width='36' height='28' rx='5' />
    <line x1='18' y1='10' x2='18' y2='38' />
  </svg>
);

const useDebug = () => {
  const [count, setCount] = useState(0);
  const timer = useRef<any>(null);
  const onClick = () => {
    const open = () => {
      ipcBridge.application.openDevTools.invoke().catch((error) => {
        console.error('Failed to open dev tools:', error);
      });
      setCount(0);
    };
    if (count >= 3) {
      return open();
    }
    setCount((prev) => {
      if (prev >= 2) {
        open();
        return 0;
      }
      return prev + 1;
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      clearTimeout(timer.current);
      setCount(0);
    }, 1000);
  };

  return { onClick };
};

const UpdateModal = React.lazy(() => import('@/renderer/components/settings/UpdateModal'));

const DEFAULT_SIDER_WIDTH = 260;
const DESKTOP_COLLAPSED_WIDTH = 0;
const SIDER_DRAG_SNAP_THRESHOLD = Math.round((DEFAULT_SIDER_WIDTH + DESKTOP_COLLAPSED_WIDTH) / 2);
const SIDER_DRAG_HYSTERESIS = 6;
const MOBILE_SIDER_WIDTH_RATIO = 0.67;
const MOBILE_SIDER_MIN_WIDTH = 260;
const MOBILE_SIDER_MAX_WIDTH = 420;

const detectMobileViewportOrTouch = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isElectronDesktop()) {
    return window.innerWidth < 768;
  }
  const width = window.innerWidth;
  const byWidth = width < 768;
  // 仅在小屏时才将 coarse/touch 视为移动端，避免触控笔记本被误判
  // Treat touch/coarse pointer as mobile only on smaller viewports
  const smallScreen = width < 1024;
  const byMedia = window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches;
  const byTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return byWidth || (smallScreen && (byMedia || byTouchPoints));
};

const Layout: React.FC<{
  sider: React.ReactNode;
  onSessionClick?: () => void;
}> = ({ sider, onSessionClick: _onSessionClick }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 390 : window.innerWidth
  );
  const { onClick } = useDebug();
  const { contextHolder: directorySelectionContextHolder } = useDirectorySelection();
  useDeepLink();
  useNotificationClick();
  useBrowserNotification();
  const navigate = useNavigate();
  useConversationShortcuts({ navigate });
  // Expose navigate to code running outside the Router tree (e.g. the globally
  // mounted FeedbackReportModal's "via chat" action).
  useEffect(() => {
    setGlobalNavigate(navigate);
    return () => setGlobalNavigate(null);
  }, [navigate]);
  const location = useLocation();
  const { t } = useTranslation();
  // The "AionUi" wordmark acts as Home / Back-to-Chat, but only from settings routes.
  // In non-settings routes the user is already "home", so it is a no-op (and not actionable).
  const isSettingsRoute = location.pathname.startsWith('/settings');
  // Only wired to the wordmark in the isSettingsRoute branch below, so the
  // "no-op outside settings" contract is enforced structurally — no internal
  // route guard needed (the chat-route wordmark is a plain, inert div).
  const handleBrandHome = useCallback(() => {
    // Mirror Titlebar's handleBackToChat convention: return to the last non-settings path.
    let target: string | null = null;
    try {
      target = sessionStorage.getItem('aion:last-non-settings-path');
    } catch {
      // ignore
    }
    if (target && !target.startsWith('/settings')) {
      void navigate(target);
      return;
    }
    void navigate('/guid');
  }, [navigate]);
  const workspaceAvailable =
    location.pathname.startsWith('/conversation/') || (TEAM_MODE_ENABLED && location.pathname.startsWith('/team/'));
  const collapsedRef = useRef(collapsed);
  const dragStateRef = useRef<{ active: boolean; startX: number; startWidth: number }>({
    active: false,
    startX: 0,
    startWidth: DEFAULT_SIDER_WIDTH,
  });

  // 检测移动端并响应窗口大小变化
  useEffect(() => {
    const checkMobile = () => {
      const mobile = detectMobileViewportOrTouch();
      setIsMobile(mobile);
      setViewportWidth(window.innerWidth);
    };

    // 初始检测
    checkMobile();

    // 监听窗口大小变化
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 进入移动端后立即折叠 / Collapse immediately when switching to mobile
  useEffect(() => {
    if (!isMobile || collapsedRef.current) {
      return;
    }
    setCollapsed(true);
  }, [isMobile]);

  // 清理侧栏 Tooltip 残留节点，避免移动端路由切换后浮层卡在左上角
  useEffect(() => {
    cleanupSiderTooltips();
  }, [isMobile, collapsed, location.pathname, location.search, location.hash]);

  // Bridge Main Process logs to F12 Console
  useEffect(() => {
    const unsubscribe = ipcBridge.application.logStream.on((entry) => {
      const prefix = `%c[Main:${entry.tag}]%c ${entry.message}`;
      const style = 'color:#7c3aed;font-weight:bold';
      if (entry.level === 'error') {
        console.error(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      } else if (entry.level === 'warn') {
        console.warn(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      } else {
        console.log(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle tray events from main process / 处理来自主进程的托盘事件
  useEffect(() => {
    if (!isElectronDesktop()) return;

    // Navigate to guid page when requested from tray / 托盘请求导航到 guid 页面
    const handleNavigateToGuid = () => {
      void navigate('/guid');
    };

    // Navigate to conversation when requested from tray / 托盘请求导航到对话页面
    const handleNavigateToConversation = (event: CustomEvent<{ conversation_id: string }>) => {
      void navigate(`/conversation/${event.detail.conversation_id}`);
    };

    // Open about dialog when requested from tray / 托盘请求打开关于对话框
    const handleOpenAbout = () => {
      // Navigate to settings/about page / 导航到设置/关于页面
      void navigate('/settings/about');
    };

    // Handle pause all tasks request from tray / 托盘请求暂停所有任务
    const handlePauseAllTasks = async () => {
      const result = await ipcBridge.task.stopAll.invoke();
      if (result?.success) {
        // Navigate to settings page to show task status
        void navigate('/settings/system');
      }
    };

    // Handle check update request from tray / 托盘请求检查更新
    const handleCheckUpdate = () => {
      window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'tray' } }));
    };

    // Listen for tray events / 监听托盘事件
    window.addEventListener('tray:navigate-to-guid', handleNavigateToGuid as EventListener);
    window.addEventListener('tray:navigate-to-conversation', handleNavigateToConversation as EventListener);
    window.addEventListener('tray:open-about', handleOpenAbout as EventListener);
    window.addEventListener('tray:pause-all-tasks', handlePauseAllTasks as EventListener);
    window.addEventListener('tray:check-update', handleCheckUpdate as EventListener);

    return () => {
      window.removeEventListener('tray:navigate-to-guid', handleNavigateToGuid as EventListener);
      window.removeEventListener('tray:navigate-to-conversation', handleNavigateToConversation as EventListener);
      window.removeEventListener('tray:open-about', handleOpenAbout as EventListener);
      window.removeEventListener('tray:pause-all-tasks', handlePauseAllTasks as EventListener);
      window.removeEventListener('tray:check-update', handleCheckUpdate as EventListener);
    };
  }, [navigate]);

  const siderWidth = isMobile
    ? Math.max(
        MOBILE_SIDER_MIN_WIDTH,
        Math.min(MOBILE_SIDER_MAX_WIDTH, Math.round(viewportWidth * MOBILE_SIDER_WIDTH_RATIO))
      )
    : DEFAULT_SIDER_WIDTH;
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  const beginSiderResizeDrag = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isMobile) return;
      event.preventDefault();
      dragStateRef.current = {
        active: true,
        startX: event.clientX,
        startWidth: collapsedRef.current ? DESKTOP_COLLAPSED_WIDTH : DEFAULT_SIDER_WIDTH,
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [isMobile]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState.active) return;

      const draggedWidth = dragState.startWidth + (event.clientX - dragState.startX);
      // Add a small hysteresis zone to avoid rapid toggling near the snap threshold.
      const shouldCollapse = collapsedRef.current
        ? draggedWidth < SIDER_DRAG_SNAP_THRESHOLD + SIDER_DRAG_HYSTERESIS
        : draggedWidth <= SIDER_DRAG_SNAP_THRESHOLD - SIDER_DRAG_HYSTERESIS;
      if (shouldCollapse !== collapsedRef.current) {
        setCollapsed(shouldCollapse);
      }
    };

    const endDrag = () => {
      if (!dragStateRef.current.active) return;
      dragStateRef.current.active = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const handleBlur = () => endDrag();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('blur', handleBlur);
      endDrag();
    };
  }, []);

  const siderStyle = isMobile
    ? {
        position: 'fixed' as const,
        left: 0,
        zIndex: 100,
        transform: collapsed ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'none',
        pointerEvents: collapsed ? ('none' as const) : ('auto' as const),
      }
    : {
        position: 'relative' as const,
        overflow: 'visible' as const,
      };

  return (
    <LayoutContext.Provider value={{ isMobile, siderCollapsed: collapsed, setSiderCollapsed: setCollapsed }}>
      <NavigationHistoryProvider>
        <div className='app-shell flex flex-col size-full min-h-0'>
          <Titlebar workspaceAvailable={workspaceAvailable} />
          {/* 移动端左侧边栏蒙板 / Mobile left sider backdrop */}
          {isMobile && !collapsed && (
            <div className='fixed inset-0 bg-black/30 z-90' onClick={() => setCollapsed(true)} aria-hidden='true' />
          )}

          <ArcoLayout className={'size-full layout flex-1 min-h-0'}>
            <ArcoLayout.Sider
              collapsedWidth={isMobile ? 0 : 0}
              collapsed={collapsed}
              width={siderWidth}
              className={classNames('!bg-2 layout-sider', {
                collapsed: collapsed,
              })}
              style={siderStyle}
            >
              <ArcoLayout.Header
                className={classNames(
                  'flex items-center justify-start pt-8px pb-8px pl-18px pr-16px gap-12px layout-sider-header',
                  isMobile && 'layout-sider-header--mobile',
                  {
                    'cursor-pointer group ': collapsed,
                  }
                )}
              >
                <div
                  className={classNames('bg-black shrink-0 size-32px relative rd-0.5rem', {
                    '!size-24px': collapsed,
                  })}
                  onClick={onClick}
                >
                  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M25.771 0H5.947A5.947 5.947 0 0 0 0 5.947v19.825a5.947 5.947 0 0 0 5.947 5.947h19.825a5.947 5.947 0 0 0 5.947-5.948V5.947A5.947 5.947 0 0 0 25.77 0z"
                      fill="#016F41" />
                    <path
                      d="M24.207 20.769c-.025-.291-.316-.444-.873-.46-.556-.015-1.268-.028-2.136-.038l-.03-1.76 1.44-.72c.316-.113.556-.434.719-.965.163-.53.26-1.041.29-1.531.021-.398.024-.858.008-1.378-.015-.52-.18-.801-.497-.842-.204-.01-.355.064-.452.222-.097.158-.15.35-.16.574l-.077 1.623a3.55 3.55 0 0 1-.123.788c-.061.2-.16.386-.299.56-.137.173-.42.367-.849.581l.03-.873.047-.72v-1.132a5.022 5.022 0 0 1 .029-.652 4.512 4.512 0 0 1 1.172-2.594c.291-.317.531-.697.72-1.141.19-.444.293-.982.314-1.615.01-.531-.064-.955-.222-1.271-.159-.317-.428-.602-.811-.858a3.104 3.104 0 0 0-1.149-.49 6.428 6.428 0 0 0-1.301-.091c-.485.01-.794-.036-.927-.138-.173-.113-.275-.286-.306-.52-.03-.236.033-.478.192-.728.158-.25.594-.452 1.309-.605a7.61 7.61 0 0 1 1.974-.184l.552.046c.408.041.714-.01.919-.153.204-.143.288-.377.252-.704-.035-.327-.681-.485-1.937-.475-1.04.01-1.95.169-2.725.475-.776.306-1.276.638-1.5.995-.236.358-.317 1.034-.245 2.029.071.995.796 1.39 2.174 1.186l-.276.904c-.112.388-.334.79-.666 1.21a7.109 7.109 0 0 1-1.217 1.186c-.48.373-.784.661-.911.865-.128.204-.135.38-.023.528.112.148.27.217.474.207.205-.01.409-.084.613-.222.204-.137.45-.33.735-.574.285-.245.636-.582 1.049-1.01.413-.43.73-.952.95-1.57.218-.618.39-1.126.512-1.524.561.174.94.414 1.133.72.132.235.197.559.192.972a2.314 2.314 0 0 1-.26 1.087 4.35 4.35 0 0 1-.712.942c-1.032 1.427-1.261 2.44-1.163 3.095-.038.31-.063.625-.063.947v1.715c-.01.174-.02.429-.03.766-.746-.02-1.195-.166-1.348-.437a2.366 2.366 0 0 1-.29-.834c-.113-.592-.16-1.077-.138-1.455l.03-.536c0-.367-.117-.571-.352-.612-.235-.041-.413.018-.536.176a1.065 1.065 0 0 0-.214.566c-.021.22-.031.447-.031.682-.02.541.01 1.072.092 1.592.082.521.334.983.758 1.386.423.403 1.11.625 2.06.666l-.062 1.654c-1.43.04-2.31.064-2.641.069-.332.005-.564.074-.697.206-.153.153-.22.312-.199.475.02.163.087.296.2.398a.785.785 0 0 0 .458.184c.082.02.233.015.452-.015.22-.031.597-.049 1.133-.054.536-.005.957-.018 1.264-.038l-.077 2.02.015 1.685-.061 2.113.046 2.006c-.021.336.005.566.076.689.133.265.327.377.582.336.255-.04.409-.308.46-.803.05-.496.086-1.034.107-1.616 0-.357-.003-1.15-.008-2.38s.003-2.58.023-4.05c1.705.081 2.643.048 2.817-.1.174-.148.248-.367.222-.658zM14.755 13.087l-.965-.52c-.143-.051-.28-.187-.413-.406a4.81 4.81 0 0 1-.283-.521c-.057-.127-.09-.332-.1-.613-.01-.28-.02-.604-.03-.972.816.113 1.324.286 1.523.521.199.235.303.561.314.98.01.419-.006.93-.046 1.531zm-.082 2.912c-.01.184-.02.725-.03 1.623-.92-.744-1.435-1.21-1.547-1.393a1.34 1.34 0 0 1-.191-.62c-.015-.23-.026-.46-.03-.689-.006-.23-.037-.398-.093-.505-.056-.107-.222-.174-.498-.2-.275-.025-.438.207-.49.697-.05.49-.101.868-.153 1.133-.05.266-.17.557-.36.873-.188.317-.387.554-.596.712-.21.159-.473.325-.789.498v-1.715c0-.174-.015-.73-.046-1.67.837-.428 1.332-.706 1.485-.833.153-.128.506-.529 1.057-1.202.377.53.717.893 1.018 1.087.301.194.748.393 1.34.597l-.077 1.607zm-4.87-3.294l-.046-.995c.01-.296.1-.56.268-.789.168-.23.743-.492 1.722-.788v.612c.01.664-.166 1.2-.527 1.608a5.598 5.598 0 0 1-1.386 1.102l-.03-.75zm6.494 12.953a20.644 20.644 0 0 1-.238-1.921c-.056-.7-.097-1.442-.122-2.228a81.55 81.55 0 0 1-.038-2.664c-.01-1.276.007-2.703.053-4.28.046-1.577.059-2.6.038-3.07-.03-.438-.158-.936-.383-1.493-.224-.556-1.107-.926-2.648-1.11l.03-.444c.03-.551.14-.883.33-.995.188-.113.522-.25 1.002-.413.48-.164.848-.414 1.103-.75a1.98 1.98 0 0 0 .398-1.18c.01-1.082-.424-1.72-1.301-1.914-.878-.193-1.537-.275-1.976-.245l-1.133.138c-.684.052-1.105-.04-1.263-.275a1.6 1.6 0 0 1-.268-.804c-.02-.301-.064-.483-.13-.544a.518.518 0 0 0-.207-.122.547.547 0 0 0-.55.191c-.144.169-.208.442-.192.82.015.377.091.701.23.972.137.27.341.477.612.62.27.143.6.26.987.352v1.056c.02.133-.13.332-.451.598-.322.265-.74.464-1.256.597-.515.132-.847.268-.995.405-.148.138-.212.291-.192.46.021.168.154.306.399.413.245.107.773-.002 1.585-.329.81-.327 1.324-.66 1.538-1.003a3.02 3.02 0 0 0 .421-1.026c.067-.342.13-.737.192-1.186.643-.031 1.138-.041 1.485-.031.347.01.622.097.827.26.204.163.321.332.352.506.02.255-.039.441-.176.558-.138.118-.388.256-.75.414-.363.158-.746.41-1.149.758-.403.347-.63.717-.681 1.11a5.932 5.932 0 0 0-.046 1.11c-1.511.286-2.425.648-2.74 1.087-.317.439-.496.898-.537 1.378-.02.245-.008.668.039 1.27.045.603.078 1.43.1 2.481l.03 2.496a51.8 51.8 0 0 1-.023 2.473 40.432 40.432 0 0 1-.2 2.51 32.45 32.45 0 0 1-.39 2.734L7.6 27.465a9.172 9.172 0 0 0-.059.443s-.162 1.211.19 1.397c.274.146.464.073.614.004.14-.083.254-.267.342-.558.132-.439.23-.822.29-1.148.062-.327.205-1.325.43-2.994.224-1.669.352-2.687.382-3.054.03-.368.056-1.087.077-2.16.49-.142.913-.336 1.27-.58.358-.246.807-.71 1.348-1.394l.414.474c.214.276.785.643 1.714 1.103l.031 1.301c.02 1.133.043 1.965.069 2.496.025.53.102 1.421.23 2.672.127 1.25.262 2.087.405 2.51.143.424.286.708.43.85.305.327.535.366.688.115.153-.25.227-.474.222-.673a7.52 7.52 0 0 0-.069-.758l-.321-1.853z"
                      fill="#fff" />
                  </svg>
                </div>
                {isSettingsRoute ? (
                  <Tooltip content={t('common.back', { defaultValue: 'Back to Chat' })} position='bottom'>
                    <div
                      className='text-16px text-t-primary collapsed-hidden font-semibold cursor-pointer'
                      role='button'
                      tabIndex={0}
                      aria-label={t('common.back', { defaultValue: 'Back to Chat' })}
                      onClick={handleBrandHome}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleBrandHome();
                        }
                      }}
                    >
                      Agent Hub
                    </div>
                  </Tooltip>
                ) : (
                  <div className='text-16px text-t-primary collapsed-hidden font-semibold'>Agent Hub</div>
                )}
                {isMobile && !collapsed && (
                  <button
                    type='button'
                    className='app-titlebar__button app-titlebar__button--mobile'
                    onClick={() => setCollapsed(true)}
                    title='Collapse sidebar'
                    aria-label='Collapse sidebar'
                  >
                    <SidebarIcon size={18} strokeWidth={2.5} />
                  </button>
                )}
                {/* 侧栏折叠改由标题栏统一控制 / Sidebar folding handled by Titlebar toggle */}
              </ArcoLayout.Header>
              <ArcoLayout.Content className='pt-0 px-8px pb-0 layout-sider-content'>
                {React.isValidElement(sider)
                  ? React.cloneElement(sider, {
                      onSessionClick: () => {
                        cleanupSiderTooltips();
                        if (isMobile) setCollapsed(true);
                      },
                      collapsed,
                    } as any)
                  : sider}
              </ArcoLayout.Content>
              {!isMobile && (
                <div
                  className='absolute top-0 h-full w-8px z-20 cursor-col-resize group'
                  style={{ right: '-4px' }}
                  onMouseDown={beginSiderResizeDrag}
                  aria-hidden='true'
                >
                  <div className='absolute top-0 left-1/2 h-full w-1px -translate-x-1/2 bg-transparent group-hover:bg-[var(--color-border-2)] transition-colors duration-150' />
                </div>
              )}
            </ArcoLayout.Sider>

            <ArcoLayout.Content
              className={'bg-1 layout-content flex flex-col min-h-0'}
              onClick={() => {
                if (isMobile && !collapsed) setCollapsed(true);
              }}
              style={
                isMobile
                  ? {
                      width: '100%',
                    }
                  : undefined
              }
            >
              <Outlet />
              {directorySelectionContextHolder}
              <PwaPullToRefresh />
              <Suspense fallback={null}>
                <UpdateModal />
              </Suspense>
            </ArcoLayout.Content>
          </ArcoLayout>
        </div>
      </NavigationHistoryProvider>
    </LayoutContext.Provider>
  );
};

export default Layout;
