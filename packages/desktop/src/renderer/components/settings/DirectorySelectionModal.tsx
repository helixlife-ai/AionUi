/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Modal, Spin } from '@arco-design/web-react';
import { IconFile, IconFolder, IconUp } from '@arco-design/web-react/icon';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBaseUrl } from '@/common/adapter/httpBridge';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { stripWindowsVerbatimPrefix } from '@/renderer/utils/file/fileSelection';
import {
  buildBrowseDirectoryUrl,
  canSelectDirectoryItem,
  filterBrowseItemsForMode,
  mapBrowseDirectoryItem,
  type DirectorySelectionItem,
  type DirectorySelectionMode,
} from '@/renderer/utils/file/directorySelectionMode';

type DirectoryItem = DirectorySelectionItem;

interface DirectoryData {
  items: DirectoryItem[];
  canGoUp: boolean;
  parentPath?: string;
}

interface DirectorySelectionModalProps {
  visible: boolean;
  isFileMode?: boolean;
  selectionMode?: DirectorySelectionMode;
  onConfirm: (paths: string[] | undefined) => void;
  onCancel: () => void;
}

const DirectorySelectionModal: React.FC<DirectorySelectionModalProps> = ({
  visible,
  isFileMode = false,
  selectionMode: selectionModeProp,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const selectionMode: DirectorySelectionMode = selectionModeProp ?? (isFileMode ? 'file' : 'directory');
  const modalTitle =
    selectionMode === 'hybrid'
      ? `📁 ${t('fileSelection.selectFileOrDirectory')}`
      : selectionMode === 'file'
        ? `📄 ${t('fileSelection.selectFile')}`
        : `📁 ${t('fileSelection.selectDirectory')}`;
  const selectionHint =
    selectionMode === 'hybrid'
      ? t('fileSelection.pleaseSelectFileOrDirectory')
      : selectionMode === 'file'
        ? t('fileSelection.pleaseSelectFile')
        : t('fileSelection.pleaseSelectDirectory');
  const { fsRoot } = useAuth();
  const [loading, setLoading] = useState(false);
  const [directoryData, setDirectoryData] = useState<DirectoryData>({ items: [], canGoUp: false });
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadSeqRef = useRef(0);

  // When fsRoot is set (WebUI container mode), the picker is capped to that
  // directory: it starts there and the up-arrow is hidden at the root so users
  // never see container internals (app/bin/boot/…). aioncore's browse endpoint
  // still reports canGoUp=true at fsRoot because `/` is in its allow-list, so
  // we override the flag client-side.
  const isAtRoot = (path: string) => Boolean(fsRoot) && path === fsRoot;

  const loadDirectory = useCallback(
    async (dirPath = '') => {
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      const loadSeq = ++loadSeqRef.current;

      setLoading(true);
      setError(null);
      try {
        // Always request files via show_files=true (never use heavy /api/fs/dir).
        // Directory-only mode filters files client-side so a folders-only browse
        // response/cache cannot blank a file picker.
        const response = await fetch(buildBrowseDirectoryUrl(getBaseUrl(), dirPath), {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (controller.signal.aborted || loadSeq !== loadSeqRef.current) {
          return;
        }
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          setError(errorData.error || `HTTP ${response.status}`);
          return;
        }
        const envelope = await response.json();
        if (controller.signal.aborted || loadSeq !== loadSeqRef.current) {
          return;
        }
        // Backend wraps the payload in { success, data, ... }.
        const data = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : envelope;
        if (!data || !Array.isArray(data.items)) {
          setError('Invalid response from server');
          return;
        }
        // Older backends return Windows verbatim paths (`\\?\C:\DEV`), which
        // break agent spawning when stored as a workspace (issue #3191).
        // 旧版后端会返回 `\\?\` 前缀的 Windows 路径，存为工作区后会导致 agent 启动失败。
        const browseItems = (data.items as Parameters<typeof mapBrowseDirectoryItem>[0][])
          .map((item) => mapBrowseDirectoryItem(item, stripWindowsVerbatimPrefix))
          .filter((item): item is DirectoryItem => Boolean(item));

        const normalized: DirectoryData = {
          ...data,
          items: filterBrowseItemsForMode(browseItems, selectionMode),
          parentPath:
            typeof data.parentPath === 'string' ? stripWindowsVerbatimPrefix(data.parentPath) : data.parentPath,
        };
        setDirectoryData(normalized);
        setCurrentPath(dirPath);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }
        console.error('Failed to load directory:', err);
        setError(err instanceof Error ? err.message : 'Failed to load directory');
      } finally {
        if (loadSeq === loadSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [selectionMode]
  );

  useEffect(() => {
    if (visible) {
      setSelectedPath('');
      loadDirectory(fsRoot ?? '').catch((error) => console.error('Failed to load initial directory:', error));
    } else {
      loadAbortRef.current?.abort();
    }

    return () => {
      loadAbortRef.current?.abort();
    };
  }, [visible, loadDirectory, fsRoot]);

  const handleSelect = (path: string) => {
    setSelectedPath(path);
  };

  const handleItemClick = (item: DirectoryItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path).catch((error) => console.error('Failed to load directory:', error));
      return;
    }

    if (canSelectDirectoryItem(item, selectionMode)) {
      handleSelect(item.path);
    }
  };

  const handleGoUp = () => {
    if (directoryData.parentPath !== undefined) {
      // Handle '__ROOT__' as empty path to show drive list on Windows
      // 处理 '__ROOT__' 为空路径，在 Windows 上显示驱动器列表
      const targetPath = directoryData.parentPath === '__ROOT__' ? '' : directoryData.parentPath;
      // Refuse to navigate above the fsRoot cap.
      if (fsRoot && targetPath && !targetPath.startsWith(fsRoot)) {
        return;
      }
      loadDirectory(targetPath).catch((error) => console.error('Failed to load parent directory:', error));
    }
  };

  const handleConfirm = () => {
    if (selectedPath) {
      onConfirm([selectedPath]);
    }
  };

  const canSelect = (item: DirectoryItem) => canSelectDirectoryItem(item, selectionMode);

  return (
    // This picker is opened *from* other modals (team/cron create dialogs sit at
    // zIndex 10000, the cron workspace menu at 10020), so it must float above all
    // of them — it's the topmost layer while choosing a folder.
    <Modal
      visible={visible}
      title={modalTitle}
      onCancel={onCancel}
      onOk={handleConfirm}
      okButtonProps={{ disabled: !selectedPath }}
      className='w-[90vw] md:w-[600px]'
      style={{ width: 'min(600px, 90vw)' }}
      wrapStyle={{ zIndex: 10050 }}
      maskStyle={{ zIndex: 10040 }}
      footer={
        <div className='w-full flex justify-between items-center'>
          <div
            className='text-t-secondary text-14px overflow-hidden text-ellipsis whitespace-nowrap max-w-[70vw]'
            title={selectedPath || currentPath}
          >
            {selectedPath || currentPath || selectionHint}
          </div>
          <div className='flex gap-10px'>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button type='primary' onClick={handleConfirm} disabled={!selectedPath}>
              {t('common.confirm')}
            </Button>
          </div>
        </div>
      }
    >
      <Spin loading={loading} className='w-full'>
        <div className='w-full border border-b-base rd-4px overflow-hidden' style={{ height: 'min(400px, 60vh)' }}>
          <div className='h-full overflow-y-auto'>
            {directoryData.canGoUp && !isAtRoot(currentPath) && (
              <div
                className='flex items-center p-10px border-b border-b-light cursor-pointer hover:bg-hover transition'
                onClick={handleGoUp}
              >
                <IconUp className='mr-10px text-t-secondary' />
                <span>..</span>
              </div>
            )}
            {error && (
              <div className='p-16px text-center text-danger text-13px'>
                <div>{error}</div>
                <Button size='mini' className='mt-8px' onClick={() => loadDirectory(currentPath).catch(() => {})}>
                  {t('common.retry', { defaultValue: 'Retry' })}
                </Button>
              </div>
            )}
            {!error && !loading && directoryData.items.length === 0 && (
              <div className='p-16px text-center text-t-secondary text-13px'>
                {t('fileSelection.emptyDirectory', { defaultValue: 'This folder is empty' })}
              </div>
            )}
            {directoryData.items.map((item) => (
              <div
                key={item.path}
                className='flex items-center justify-between p-10px border-b border-b-light cursor-pointer hover:bg-hover transition'
                style={selectedPath === item.path ? { background: 'var(--brand-light)' } : {}}
                onClick={() => handleItemClick(item)}
              >
                <div className='flex items-center flex-1 min-w-0'>
                  {item.isDirectory ? (
                    <IconFolder className='mr-10px text-warning shrink-0' />
                  ) : (
                    <IconFile className='mr-10px text-primary shrink-0' />
                  )}
                  <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{item.name}</span>
                </div>
                {canSelect(item) && (
                  <Button
                    type='primary'
                    size='mini'
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(item.path);
                    }}
                  >
                    {t('common.select')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Spin>
    </Modal>
  );
};

export default DirectorySelectionModal;
