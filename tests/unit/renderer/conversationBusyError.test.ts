/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { classifyConversationBusyError } from '@/renderer/pages/conversation/platforms/conversationBusyError';

const conflict = (error: string) =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/conversations/abc/messages',
    status: 409,
    body: { success: false, code: 'CONFLICT', error },
  });

describe('classifyConversationBusyError', () => {
  it('classifies already-processing conflicts', () => {
    const result = classifyConversationBusyError(conflict('Conversation is already processing a message'));
    expect(result?.kind).toBe('active_turn');
  });

  it('returns null for non-busy conflicts', () => {
    expect(classifyConversationBusyError(conflict('something else'))).toBeNull();
  });

  it('does not throw when backendMessage is missing on a duck-typed conflict', () => {
    const err = conflict('already running');
    (err as { backendMessage: unknown }).backendMessage = undefined;

    expect(() => classifyConversationBusyError(err)).not.toThrow();
    // Corrupted message cannot match busy patterns.
    expect(classifyConversationBusyError(err)).toBeNull();
  });
});
