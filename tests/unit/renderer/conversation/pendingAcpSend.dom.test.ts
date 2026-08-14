/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findPendingAcpSend,
  getPendingAcpSendStorageKey,
  readPendingAcpSends,
  removePendingAcpSend,
  upsertPendingAcpSend,
  type PendingAcpSend,
} from '@/renderer/pages/conversation/platforms/acp/pendingAcpSend';

const pendingSend: PendingAcpSend = {
  id: 'local-1',
  conversation_id: 'conv-1',
  input: 'Hello',
  files: ['/tmp/file.txt'],
  displayMessage: 'Hello',
  createdAt: 100,
  status: 'pending',
};

describe('pending ACP sends', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('persists and updates a pending send by id', () => {
    upsertPendingAcpSend(pendingSend);
    upsertPendingAcpSend({ ...pendingSend, status: 'work' });

    expect(readPendingAcpSends('conv-1')).toEqual([{ ...pendingSend, status: 'work' }]);
    expect(findPendingAcpSend('conv-1', 'local-1')?.status).toBe('work');
  });

  it('removes the storage record when its final send is removed', () => {
    upsertPendingAcpSend(pendingSend);
    removePendingAcpSend('conv-1', 'local-1');

    expect(readPendingAcpSends('conv-1')).toEqual([]);
    expect(sessionStorage.getItem(getPendingAcpSendStorageKey('conv-1'))).toBeNull();
  });

  it('ignores malformed and cross-conversation records', () => {
    sessionStorage.setItem(
      getPendingAcpSendStorageKey('conv-1'),
      JSON.stringify([
        pendingSend,
        { ...pendingSend, id: 'wrong-conversation', conversation_id: 'conv-2' },
        { ...pendingSend, id: 'wrong-files', files: [42] },
      ])
    );

    expect(readPendingAcpSends('conv-1')).toEqual([pendingSend]);
  });

  it('returns an empty list for invalid JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    sessionStorage.setItem(getPendingAcpSendStorageKey('conv-1'), '{invalid');

    expect(readPendingAcpSends('conv-1')).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
