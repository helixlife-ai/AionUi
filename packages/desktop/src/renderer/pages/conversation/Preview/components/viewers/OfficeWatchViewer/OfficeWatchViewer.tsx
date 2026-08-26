/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  abortOfficePreviewRequestScope,
  adoptOfficePreviewRequestScope,
  getBaseUrl,
  getOfficePreviewRequestSignal,
  isBackendHttpError,
  isHttpAbortError,
} from '@/common/adapter/httpBridge';
import WebviewHost from '@/renderer/components/media/WebviewHost';
import { openExternalUrl } from '@/renderer/utils/platform';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { resolveOfficePreviewFilePath } from '@/renderer/utils/hub/resolveOfficePreviewFilePath';
import { Button, Spin } from '@arco-design/web-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  OFFICE_PREVIEW_START_TIMEOUT_MS,
  runExclusiveOfficeWatch,
  startOfficeWatchRequest,
  stopOfficeWatchRequest,
  type OfficeDocType,
} from './officeWatchSession';

export { OFFICE_PREVIEW_START_TIMEOUT_MS } from './officeWatchSession';

type DocType = OfficeDocType;
type OfficeWatchErrorCode =
  | 'OFFICECLI_NOT_FOUND'
  | 'OFFICECLI_INSTALL_FAILED'
  | 'OFFICECLI_PORT_TIMEOUT'
  | 'OFFICECLI_START_FAILED'
  | 'PATH_OUTSIDE_SANDBOX';

const BRIDGE = {
  ppt: ipcBridge.pptPreview,
  word: ipcBridge.wordPreview,
  excel: ipcBridge.excelPreview,
} as const;

// Web-server proxy base paths (Electron uses the direct localhost URL instead)
const PROXY_PATH: Record<DocType, string> = {
  ppt: '/api/ppt-proxy',
  word: '/api/office-watch-proxy',
  excel: '/api/office-watch-proxy',
};

const IFRAME_TITLE: Record<DocType, string> = {
  ppt: 'PPT Preview',
  word: 'Word Preview',
  excel: 'Excel Preview',
};

const I18N_KEYS = {
  ppt: {
    loading: 'preview.ppt.loading',
    installing: 'preview.ppt.installing',
    startFailed: 'preview.ppt.startFailed',
    installHint: 'preview.ppt.installHint',
  },
  word: {
    loading: 'preview.word.watch.loading',
    installing: 'preview.word.watch.installing',
    startFailed: 'preview.word.watch.startFailed',
    installHint: 'preview.word.watch.installHint',
  },
  excel: {
    loading: 'preview.excel.watch.loading',
    installing: 'preview.excel.watch.installing',
    startFailed: 'preview.excel.watch.startFailed',
    installHint: 'preview.excel.watch.installHint',
  },
} as const;

const OFFICE_ERROR_I18N_KEYS: Record<OfficeWatchErrorCode, string> = {
  OFFICECLI_NOT_FOUND: 'preview.office.errors.officecliNotFound',
  OFFICECLI_INSTALL_FAILED: 'preview.office.errors.installFailed',
  OFFICECLI_PORT_TIMEOUT: 'preview.office.errors.portTimeout',
  OFFICECLI_START_FAILED: 'preview.office.errors.startFailed',
  PATH_OUTSIDE_SANDBOX: 'preview.office.errors.outsideSandbox',
};

export const OFFICECLI_INSTALL_URL = 'https://github.com/iOfficeAI/OfficeCLI/releases';

interface OfficeWatchViewerProps {
  docType: DocType;
  // Preferred identity: the backend resolves pe→path and keys the watch by it, so
  // start/stop match even when the tab has no device path (explorer office files).
  fileRef?: ChatFileRef;
  file_path?: string;
  content?: string;
  workspace?: string;
}

interface OfficeWatchErrorState {
  code?: OfficeWatchErrorCode;
  message: string;
}

export function resolveOfficeWatchUrl(url: string, docType: DocType): string {
  const proxyMatch = url.match(/^\/api\/(?:office-watch-proxy|ppt-proxy)\/(\d+)(\/.*)?$/);
  if (proxyMatch && isElectronDesktop()) {
    const [, port, suffix] = proxyMatch;
    return `http://127.0.0.1:${port}${suffix || '/'}`;
  }

  if (url.startsWith('/')) {
    if (!isElectronDesktop()) {
      const proxyPortMatch = url.match(/^\/api\/(?:office-watch-proxy|ppt-proxy)\/(\d+)(\/.*)?$/);
      if (proxyPortMatch) {
        const [, port, suffix] = proxyPortMatch;
        // The backend registers /{port} and /{port}/{*path} only; a bare
        // trailing slash matches neither route and 404s (#3212), so emit a
        // suffix only when it carries a real sub-path.
        const subPath = suffix && suffix !== '/' ? suffix : '';
        return `${PROXY_PATH[docType]}/${port}${subPath}`;
      }
    }
    return `${getBaseUrl()}${url}`;
  }

  if (!isElectronDesktop()) {
    const parsed = new URL(url);
    return `${PROXY_PATH[docType]}/${parsed.port}`;
  }

  return url;
}

function normalizeOfficeWatchErrorCode(error?: string | null): OfficeWatchErrorCode | undefined {
  switch (error) {
    case 'OFFICECLI_NOT_FOUND':
    case 'OFFICECLI_INSTALL_FAILED':
    case 'OFFICECLI_PORT_TIMEOUT':
    case 'OFFICECLI_START_FAILED':
    case 'PATH_OUTSIDE_SANDBOX':
      return error;
    default:
      return undefined;
  }
}

// officecli runs next to the backend, so on web deployments it must be
// installed on the server — same command the backend's auto-installer uses.
export const OFFICECLI_SERVER_INSTALL_COMMAND = 'curl -fsSL https://d.officecli.ai/install.sh | bash';

export function resolveOfficeErrorActions(
  code: OfficeWatchErrorCode | undefined,
  isElectron: boolean
): { showServerInstallGuide: boolean; showInstallLink: boolean; showRetry: boolean } {
  const officecliMissing = code === 'OFFICECLI_NOT_FOUND' || code === 'OFFICECLI_INSTALL_FAILED';
  return {
    // A desktop install link would point web users at the wrong machine —
    // give them the server-side command instead.
    showServerInstallGuide: !isElectron && officecliMissing,
    showInstallLink: isElectron && code === 'OFFICECLI_NOT_FOUND',
    showRetry: officecliMissing || code === 'OFFICECLI_PORT_TIMEOUT' || code === 'OFFICECLI_START_FAILED',
  };
}

/** Only show “install officecli” copy when the backend actually reported a missing/failed binary. */
export function shouldShowOfficeInstallHint(code: OfficeWatchErrorCode | undefined): boolean {
  return code === 'OFFICECLI_NOT_FOUND' || code === 'OFFICECLI_INSTALL_FAILED';
}

/**
 * Shared Office watch viewer.
 *
 * Launches an `officecli watch` child process via HTTP, waits for the local
 * HTTP server to be ready, then renders it in a webview (Electron) or iframe
 * (web server mode). Cleans up the process on unmount / file switch.
 *
 * Used by PptViewer, OfficeDocViewer, and ExcelViewer — each passes its
 * docType to select the correct bridge, proxy path, and i18n keys.
 */
const OfficeWatchViewer: React.FC<OfficeWatchViewerProps> = ({ docType, fileRef, file_path, workspace }) => {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const keys = I18N_KEYS[docType];

  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'starting' | 'installing'>('starting');
  const [error, setError] = useState<OfficeWatchErrorState | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // Mirror both identities for the unmount cleanup; stop prefers the ref.
  const file_pathRef = useRef(file_path);
  const startedPathRef = useRef<string | null>(null);

  useEffect(() => {
    file_pathRef.current = file_path;
    fileRefRef.current = fileRef;
    const bridge = BRIDGE[docType];
    const translate = tRef.current;

    // Drop any previous iframe/webview immediately so proxy SSE/ping stop.
    setWatchUrl(null);

    // A ChatFileRef alone is enough (explorer office tabs have no device path).
    if (!fileRef && !file_path) {
      setLoading(false);
      setError({ message: translate('preview.errors.missingFilePath') });
      return;
    }

    let cancelled = false;
    // Aborts the previous file's in-flight start without touching conversation HTTP.
    const generationSignal = adoptOfficePreviewRequestScope();
    const resolvedPath = resolveOfficePreviewFilePath(file_path, workspace);
    startedPathRef.current = resolvedPath;

    const unsubStatus = bridge.status.on((evt) => {
      if (cancelled) return;
      if (evt.state === 'installing') setStatus('installing');
      else if (evt.state === 'starting') setStatus('starting');
    });

    const start = async () => {
      setLoading(true);
      setStatus('starting');
      setError(null);
      try {
        await runExclusiveOfficeWatch(async () => {
          if (cancelled || generationSignal.aborted) return;

          const result = await startOfficeWatchRequest(
            docType,
            { file_path: resolvedPath, workspace },
            { signal: generationSignal, timeoutMs: OFFICE_PREVIEW_START_TIMEOUT_MS }
          );

          // Start may have completed on the server after we switched files —
          // tear it down before yielding the exclusive slot to the next start.
          if (cancelled || generationSignal.aborted) {
            await stopOfficeWatchRequest(docType, { file_path: resolvedPath });
            return;
          }

          const errorCode = normalizeOfficeWatchErrorCode(result.error);
          if (errorCode) {
            if (!cancelled) {
              setError({
                code: errorCode,
                message: translate(OFFICE_ERROR_I18N_KEYS[errorCode]),
              });
              setLoading(false);
            }
            return;
          }

          const url = result.url;
          if (!url) {
            throw new Error(translate(keys.startFailed));
          }

          // Small delay to ensure the watch HTTP server is fully ready for the webview
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 300);
            generationSignal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true }
            );
          });

          if (cancelled || generationSignal.aborted) {
            await stopOfficeWatchRequest(docType, { file_path: resolvedPath });
            return;
          }

          setWatchUrl(resolveOfficeWatchUrl(url, docType));
          setLoading(false);
        });
      } catch (err) {
        if (cancelled || isHttpAbortError(err) || generationSignal.aborted) return;
        const timeoutCode =
          err && typeof err === 'object' && 'code' in err
            ? normalizeOfficeWatchErrorCode(String((err as { code?: unknown }).code))
            : undefined;
        // Timeout already aborted the fetch via startOfficeWatchRequest; also drop
        // the office scope so a hung generation cannot linger.
        if (timeoutCode === 'OFFICECLI_PORT_TIMEOUT' && getOfficePreviewRequestSignal() === generationSignal) {
          abortOfficePreviewRequestScope();
        }
        const backendCode = isBackendHttpError(err) ? normalizeOfficeWatchErrorCode(err.code) : undefined;
        const errorCode = timeoutCode || backendCode;
        if (errorCode) {
          setError({
            code: errorCode,
            message: translate(OFFICE_ERROR_I18N_KEYS[errorCode]),
          });
          setLoading(false);
          return;
        }
        const msg = err instanceof Error ? err.message : translate(keys.startFailed);
        setError({ message: msg });
        setLoading(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      unsubStatus();
      // Abort only this generation — a newer effect already adopted a fresh scope.
      if (getOfficePreviewRequestSignal() === generationSignal) {
        abortOfficePreviewRequestScope();
      }
      const stopPath = startedPathRef.current || file_pathRef.current;
      if (stopPath) {
        // Queue stop on the exclusive chain so the next start waits for it.
        void runExclusiveOfficeWatch(() => stopOfficeWatchRequest(docType, { file_path: stopPath }));
      }
    };
  }, [docType, file_path, keys.startFailed, retryKey, workspace]);

  if (loading) {
    return (
      <div className='h-full w-full flex items-center justify-center bg-bg-1'>
        <div className='flex flex-col items-center gap-12px'>
          <Spin size={32} />
          <span className='text-13px text-t-secondary'>
            {status === 'installing' ? t(keys.installing) : t(keys.loading)}
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    const { showServerInstallGuide, showInstallLink, showRetry } = resolveOfficeErrorActions(
      error.code,
      isElectronDesktop()
    );

    return (
      <div className='h-full w-full flex items-center justify-center bg-bg-1'>
        <div className='text-center max-w-400px'>
          <div className='text-16px text-danger mb-8px'>{error.message}</div>
          {shouldShowOfficeInstallHint(error.code) && (
            <div className='text-12px text-t-secondary mb-12px'>{t(keys.installHint)}</div>
          )}
          {showServerInstallGuide && (
            <div className='text-start mb-12px'>
              <div className='text-12px text-t-secondary mb-8px'>{t('preview.office.serverInstall.hint')}</div>
              <code className='block select-all rounded-8px bg-2 px-10px py-8px text-12px text-t-primary'>
                {OFFICECLI_SERVER_INSTALL_COMMAND}
              </code>
              <div className='text-12px text-t-secondary mt-8px'>{t('preview.office.serverInstall.icuNote')}</div>
            </div>
          )}
          {showInstallLink && (
            <div className='flex justify-center'>
              <Button type='text' size='small' onClick={() => void openExternalUrl(OFFICECLI_INSTALL_URL)}>
                {t('preview.office.installLinkText')}
              </Button>
            </div>
          )}
          {showRetry && (
            <div className='flex justify-center'>
              <Button size='small' type='primary' onClick={() => setRetryKey((value) => value + 1)}>
                {t('common.retry', { defaultValue: 'Retry' })}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!watchUrl) return null;

  // Electron: use <webview> via WebviewHost for full Electron integration.
  // Web server mode: use <iframe> since <webview> is Electron-only.
  if (isElectronDesktop()) {
    return <WebviewHost url={watchUrl} className='bg-bg-1' />;
  }
  return <iframe src={watchUrl} className='w-full h-full border-0 bg-bg-1' title={IFRAME_TITLE[docType]} />;
};

export default OfficeWatchViewer;
