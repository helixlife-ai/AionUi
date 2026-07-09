/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Identity context for the Agent Hub.
 *
 * There is no login flow: the device SN (read from the `AIONUI_SERIAL_NUMBER` env var,
 * surfaced to the renderer via web-host's `/api/identity` endpoint) is the
 * sole user identifier. aioncore is launched with `--local`, which does not
 * enforce sessions on application routes, so the renderer is always
 * authenticated — mirroring how the Electron desktop path has always worked.
 *
 * `user.id` stays `'system_default_user'` to match aioncore's internal data
 * attribution (conversations/teams are keyed on that row); `user.username`
 * surfaces the SN for display. Team pages already fall back to
 * `'system_default_user'` when `user` is null, so the brief async window
 * before the SN resolves is safe.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export interface AuthUser {
  id: string;
  username: string;
}

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  ready: boolean;
  user: AuthUser | null;
  status: AuthStatus;
  /** Device serial number from the `AIONUI_SERIAL_NUMBER` env var, or null if unset. */
  sn: string | null;
  /** File-picker root from the `AIONUI_FS_ROOT` env var, or null if unset. */
  fsRoot: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEFAULT_USER_ID = 'system_default_user';

const isDesktopRuntime = typeof window !== 'undefined' && Boolean((window as { electronAPI?: unknown }).electronAPI);

interface IdentityResponse {
  success?: boolean;
  sn?: string | null;
  fsRoot?: string | null;
}

/**
 * Fetch the device SN and fs root from web-host's `/api/identity` endpoint.
 * Only available in WebUI mode (static-server carves it out before the reverse
 * proxy). Desktop (Electron) has no static-server; the preload layer may inject
 * the SN as `window.__AIONUI_SERIAL_NUMBER__`, otherwise the SN stays null and
 * the default identity is used.
 */
async function fetchIdentity(): Promise<{ sn: string | null; fsRoot: string | null }> {
  if (isDesktopRuntime) {
    return {
      sn: (window as { __AIONUI_SERIAL_NUMBER__?: string | null }).__AIONUI_SERIAL_NUMBER__ ?? null,
      fsRoot: null,
    };
  }
  try {
    const response = await fetch('/api/identity', { credentials: 'include' });
    if (!response.ok) return { sn: null, fsRoot: null };
    const data = (await response.json()) as IdentityResponse;
    const sn = typeof data.sn === 'string' && data.sn.length > 0 ? data.sn : null;
    const fsRoot = typeof data.fsRoot === 'string' && data.fsRoot.length > 0 ? data.fsRoot : null;
    return { sn, fsRoot };
  } catch (error) {
    console.error('Failed to fetch device identity:', error);
    return { sn: null, fsRoot: null };
  }
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [sn, setSn] = useState<string | null>(null);
  const [fsRoot, setFsRoot] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  // No login gate: resolve the SN once on mount and derive the identity.
  // `ready` is true immediately so app boot is not blocked on the fetch —
  // team pages tolerate the brief null-`user` window via their fallback.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { sn: resolvedSn, fsRoot: resolvedFsRoot } = await fetchIdentity();
      if (cancelled) return;
      setSn(resolvedSn);
      setFsRoot(resolvedFsRoot);
      setUser({ id: DEFAULT_USER_ID, username: resolvedSn ?? DEFAULT_USER_ID });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ready: true, user, status: 'authenticated', sn, fsRoot }),
    [user, sn, fsRoot]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
