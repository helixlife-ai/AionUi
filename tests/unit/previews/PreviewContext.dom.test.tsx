/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { PreviewProvider, usePreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { ipcBridge } from '@/common';

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: {
      contentUpdate: { on: vi.fn(() => vi.fn()) },
    },
    preview: {
      open: { on: vi.fn(() => vi.fn()) },
    },
    fs: {
      writeFile: { invoke: vi.fn() },
      getFileMetadata: { invoke: vi.fn(() => new Promise(() => {})) },
      readFile: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en' },
  }),
}));

describe('PreviewContext', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <PreviewProvider>{children}</PreviewProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('initializes with closed state', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBe(null);
  });

  it('opens preview and creates tab', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('# Hello', 'markdown', { title: 'test.md' });
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].content).toBe('# Hello');
    expect(result.current.tabs[0].content_type).toBe('markdown');
  });

  // `closePreview` hides the panel and KEEPS the tabs. It used to also empty them,
  // which propagated to storage and wiped the whole project's remembered tab list —
  // see clearPreviewForScope for the discarding variant.
  it('closes the panel but keeps its tabs', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('content', 'code');
    });
    act(() => {
      result.current.closePreview();
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.tabs).toHaveLength(1);
  });

  it('discards tabs only when asked to explicitly', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('content', 'code');
    });
    act(() => {
      result.current.clearPreviewForScope();
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.tabs).toEqual([]);
  });

  it('provides all context API methods', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    expect(typeof result.current.openPreview).toBe('function');
    expect(typeof result.current.closePreview).toBe('function');
    expect(typeof result.current.updateContent).toBe('function');
    expect(typeof result.current.findPreviewTab).toBe('function');
  });

  it('updates content and marks tab as dirty', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('original', 'code');
    });
    expect(result.current.activeTab?.isDirty).toBe(false);
    act(() => {
      result.current.updateContent('modified');
    });
    expect(result.current.activeTab?.content).toBe('modified');
    expect(result.current.activeTab?.isDirty).toBe(true);
  });

  it('does not poll file metadata for excel/word office previews', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('', 'excel', {
        title: 'sheet.xlsx',
        file_name: 'sheet.xlsx',
        file_path: '/agent_hub/demo/sheet.xlsx',
        workspace: '/agent_hub/demo',
      });
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(ipcBridge.fs.getFileMetadata.invoke).not.toHaveBeenCalled();
  });

  it('polls file metadata for text previews but skips overlapping in-flight calls', () => {
    const { result } = renderHook(() => usePreviewContext(), { wrapper });
    act(() => {
      result.current.openPreview('hello', 'code', {
        title: 'a.ts',
        file_name: 'a.ts',
        file_path: '/agent_hub/demo/a.ts',
        workspace: '/agent_hub/demo',
      });
    });

    // Immediate check on tab open + one interval tick while the first call hangs.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(ipcBridge.fs.getFileMetadata.invoke).toHaveBeenCalledTimes(1);
  });
});
