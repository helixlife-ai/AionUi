/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionRef } from '@/common/adapter/ipcBridge';
import { type ChatFileRef, isChatFileRef, uploadFileRef } from '@/common/types/chatFile';

export type PendingAcpSend = {
  id: string;
  conversation_id: string;
  input: string;
  files: ChatFileRef[];
  sessions?: SessionRef[];
  displayMessage: string;
  createdAt: number;
  status: 'pending' | 'work' | 'error';
};

const STORAGE_PREFIX = 'conversation-pending-sends/';

export const getPendingAcpSendStorageKey = (conversation_id: string): string => `${STORAGE_PREFIX}${conversation_id}`;

const isPendingAcpSend = (value: unknown, conversation_id: string): value is PendingAcpSend => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PendingAcpSend>;
  return (
    typeof item.id === 'string' &&
    item.conversation_id === conversation_id &&
    typeof item.input === 'string' &&
    Array.isArray(item.files) &&
    item.files.every(isChatFileRef) &&
    typeof item.displayMessage === 'string' &&
    typeof item.createdAt === 'number' &&
    (item.status === 'pending' || item.status === 'work' || item.status === 'error')
  );
};

export const readPendingAcpSends = (conversation_id: string): PendingAcpSend[] => {
  if (typeof window === 'undefined' || !conversation_id) return [];
  try {
    const raw = window.sessionStorage.getItem(getPendingAcpSendStorageKey(conversation_id));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (isPendingAcpSend(item, conversation_id)) return [item];
      if (!item || typeof item !== 'object') return [];
      const legacy = item as Partial<PendingAcpSend> & { files?: unknown };
      if (
        typeof legacy.id !== 'string' ||
        legacy.conversation_id !== conversation_id ||
        typeof legacy.input !== 'string' ||
        typeof legacy.displayMessage !== 'string' ||
        typeof legacy.createdAt !== 'number' ||
        !Array.isArray(legacy.files)
      ) {
        return [];
      }
      const files = legacy.files.flatMap((file) =>
        typeof file === 'string' && file ? [uploadFileRef(file)] : isChatFileRef(file) ? [file] : []
      );
      const status = legacy.status;
      if (status !== 'pending' && status !== 'work' && status !== 'error') return [];
      return [
        {
          id: legacy.id,
          conversation_id,
          input: legacy.input,
          files,
          displayMessage: legacy.displayMessage,
          createdAt: legacy.createdAt,
          status,
        },
      ];
    });
  } catch (error) {
    console.warn('[pending-acp-send] Failed to read pending sends:', error);
    return [];
  }
};

const writePendingAcpSends = (conversation_id: string, items: PendingAcpSend[]): void => {
  if (typeof window === 'undefined' || !conversation_id) return;
  try {
    const key = getPendingAcpSendStorageKey(conversation_id);
    if (items.length === 0) {
      window.sessionStorage.removeItem(key);
      return;
    }
    window.sessionStorage.setItem(key, JSON.stringify(items));
  } catch (error) {
    console.warn('[pending-acp-send] Failed to persist pending sends:', error);
  }
};

export const upsertPendingAcpSend = (item: PendingAcpSend): void => {
  const current = readPendingAcpSends(item.conversation_id);
  const index = current.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) {
    writePendingAcpSends(item.conversation_id, [...current, item]);
    return;
  }
  const next = current.slice();
  next[index] = item;
  writePendingAcpSends(item.conversation_id, next);
};

export const removePendingAcpSend = (conversation_id: string, id: string): void => {
  writePendingAcpSends(
    conversation_id,
    readPendingAcpSends(conversation_id).filter((item) => item.id !== id)
  );
};

export const findPendingAcpSend = (conversation_id: string, id: string): PendingAcpSend | undefined =>
  readPendingAcpSends(conversation_id).find((item) => item.id === id);
