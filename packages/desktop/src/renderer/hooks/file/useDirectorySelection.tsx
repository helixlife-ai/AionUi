/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from '@office-ai/platform';
import React, { useCallback, useEffect, useState } from 'react';
import { SHOW_OPEN_REQUEST_EVENT } from '@/common/adapter/constant';
import DirectorySelectionModal from '@renderer/components/settings/DirectorySelectionModal';
import {
  resolveDirectorySelectionMode,
  type DirectorySelectionMode,
} from '@/renderer/utils/file/directorySelectionMode';

interface DirectorySelectionRequest {
  id: string;
  isFileMode?: boolean;
  selectionMode?: DirectorySelectionMode;
  properties?: string[];
}

export const useDirectorySelection = () => {
  const [visible, setVisible] = useState(false);
  const [requestData, setRequestData] = useState<DirectorySelectionRequest | null>(null);

  const handleConfirm = useCallback(
    (paths: string[] | undefined) => {
      if (requestData) {
        // Bridge 框架的回调事件命名规则: subscribe.callback-{event-name}{id}
        const callbackEventName = `subscribe.callback-show-open${requestData.id}`;
        // 使用全局函数发送回调到 bridge emitter
        if ((window as any).__emitBridgeCallback) {
          (window as any).__emitBridgeCallback(callbackEventName, paths);
        }
      }
      setVisible(false);
      setRequestData(null);
    },
    [requestData]
  );

  const handleCancel = useCallback(() => {
    if (requestData) {
      // Bridge 框架的回调事件命名规则: subscribe.callback-{event-name}{id}
      const callbackEventName = `subscribe.callback-show-open${requestData.id}`;
      // 使用全局函数发送回调到 bridge emitter
      if ((window as any).__emitBridgeCallback) {
        (window as any).__emitBridgeCallback(callbackEventName, undefined);
      }
    }
    setVisible(false);
    setRequestData(null);
  }, [requestData]);

  useEffect(() => {
    const handleShowOpenRequest = (data: DirectorySelectionRequest) => {
      const selectionMode = data.selectionMode ?? resolveDirectorySelectionMode(data.properties);
      const isFileMode = selectionMode === 'file';

      setRequestData({ ...data, isFileMode, selectionMode });
      setVisible(true);
    };

    // 监听来自 browser.ts 的文件选择请求
    bridge.on(SHOW_OPEN_REQUEST_EVENT, handleShowOpenRequest);

    return () => {
      bridge.off(SHOW_OPEN_REQUEST_EVENT, handleShowOpenRequest);
    };
  }, []);

  const contextHolder = (
    <DirectorySelectionModal
      visible={visible}
      isFileMode={requestData?.isFileMode}
      selectionMode={requestData?.selectionMode}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { contextHolder };
};
