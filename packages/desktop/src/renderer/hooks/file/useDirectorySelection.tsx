/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { bridge } from '@/common/platform/bridge';
import { SHOW_OPEN_REQUEST_EVENT } from '@/common/adapter/constant';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import DirectorySelectionModal from '@renderer/components/settings/DirectorySelectionModal';
import {
  resolveDirectorySelectionMode,
  type DirectorySelectionMode,
} from '@/renderer/utils/file/directorySelectionMode';

type DirectorySelectionRequest = {
  id: string;
  isFileMode?: boolean;
  selectionMode?: DirectorySelectionMode;
  properties?: string[];
};

type OpenDialogOptions = {
  defaultPath?: string;
  properties?: string[];
  filters?: unknown;
};

/**
 * WebUI host for `ipcBridge.dialog.showOpen`.
 *
 * Electron handles show-open in the main process. In the browser, native dialogs
 * are unavailable — this hook registers a renderer-local provider that opens
 * DirectorySelectionModal and resolves the invoke() Promise with the chosen paths.
 */
export const useDirectorySelection = () => {
  const [visible, setVisible] = useState(false);
  const [requestData, setRequestData] = useState<DirectorySelectionRequest | null>(null);
  const pendingResolveRef = useRef<((paths: string[] | undefined) => void) | null>(null);

  const finish = useCallback((paths: string[] | undefined) => {
    const resolve = pendingResolveRef.current;
    pendingResolveRef.current = null;
    setVisible(false);
    setRequestData(null);
    resolve?.(paths);
  }, []);

  const handleConfirm = useCallback(
    (paths: string[] | undefined) => {
      if (pendingResolveRef.current) {
        finish(paths);
        return;
      }
      // Legacy path: backend emitted show-open-request; complete via bridge callback.
      if (requestData) {
        bridge.emit(`subscribe.callback-show-open${requestData.id}`, paths);
      }
      setVisible(false);
      setRequestData(null);
    },
    [finish, requestData]
  );

  const handleCancel = useCallback(() => {
    if (pendingResolveRef.current) {
      finish(undefined);
      return;
    }
    if (requestData) {
      bridge.emit(`subscribe.callback-show-open${requestData.id}`, undefined);
    }
    setVisible(false);
    setRequestData(null);
  }, [finish, requestData]);

  useEffect(() => {
    const disposeProvider = ipcBridge.dialog.showOpen.provider((options?: OpenDialogOptions) => {
      return new Promise<string[] | undefined>((resolve) => {
        // Replace any in-flight picker (rare) so the latest invoke wins.
        pendingResolveRef.current?.(undefined);
        pendingResolveRef.current = resolve;

        const selectionMode = resolveDirectorySelectionMode(options?.properties);
        setRequestData({
          id: 'renderer-local',
          properties: options?.properties,
          selectionMode,
          isFileMode: selectionMode === 'file',
        });
        setVisible(true);
      });
    });

    // Back-compat: older aioncore builds may push show-open-request over WS.
    const disposeLegacy = bridge.on(SHOW_OPEN_REQUEST_EVENT, (data: DirectorySelectionRequest) => {
      const selectionMode = data.selectionMode ?? resolveDirectorySelectionMode(data.properties);
      setRequestData({
        ...data,
        isFileMode: selectionMode === 'file',
        selectionMode,
      });
      setVisible(true);
    });

    return () => {
      disposeProvider();
      disposeLegacy();
      pendingResolveRef.current?.(undefined);
      pendingResolveRef.current = null;
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
