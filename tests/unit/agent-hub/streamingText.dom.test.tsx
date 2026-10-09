import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  revealBoundary,
  useStreamingText,
} from '@/renderer/pages/conversation/Messages/acp/StreamingText/useStreamingText';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('Studio streaming text presentation', () => {
  it('shows history immediately and does not animate later history hydration', () => {
    const { result, rerender } = renderHook(({ text }) => useStreamingText(text, false), {
      initialProps: { text: '历史' },
    });
    expect(result.current).toBe('历史');
    rerender({ text: '历史全文' });
    expect(result.current).toBe('历史全文');
  });
  it('spreads a large burst across frames and catches up within the latency cap', () => {
    const { result, rerender } = renderHook(({ text }) => useStreamingText(text, true), {
      initialProps: { text: '前文' },
    });
    const full = '前文' + '中文'.repeat(500);
    rerender({ text: full });
    advance(64);
    expect(result.current.length).toBeGreaterThan(2);
    expect(result.current.length).toBeLessThan(full.length);
    advance(752);
    expect(result.current).toBe(full);
  });
  it('continues revealing when input arrives more often than the paint interval', () => {
    const { result, rerender } = renderHook(({ text }) => useStreamingText(text, true), { initialProps: { text: '' } });
    for (let i = 1; i <= 20; i++) {
      rerender({ text: '字'.repeat(i * 8) });
      advance(16);
    }
    expect(result.current.length).toBeGreaterThan(0);
    advance(816);
    expect(result.current).toBe('字'.repeat(160));
  });
  it('reveals newly created live messages but drains quickly on completion', () => {
    const full = '正文'.repeat(300);
    const { result, rerender } = renderHook(({ live }) => useStreamingText(full, live, true), {
      initialProps: { live: true },
    });
    expect(result.current).toBe('');
    advance(48);
    expect(result.current.length).toBeGreaterThan(0);
    rerender({ live: false });
    advance(128);
    expect(result.current).toBe(full);
  });
  it('smooths a final chunk delivered by the merge timer just after the finish event', () => {
    const { result, rerender } = renderHook(({ text, live }) => useStreamingText(text, live), {
      initialProps: { text: '正文', live: true },
    });
    rerender({ text: '正文', live: false });
    advance(32);
    const full = '正文' + '尾文'.repeat(100);
    rerender({ text: full, live: false });
    advance(32);
    expect(result.current.length).toBeLessThan(full.length);
    advance(96);
    expect(result.current).toBe(full);
  });
  it('flushes immediately when stopped and replaces non-prefix edits without stale text', () => {
    const { result, rerender } = renderHook(({ text, stopped }) => useStreamingText(text, true, false, stopped), {
      initialProps: { text: '旧', stopped: false },
    });
    rerender({ text: '旧' + '字'.repeat(200), stopped: true });
    expect(result.current).toBe('旧' + '字'.repeat(200));
    rerender({ text: '替换', stopped: false });
    expect(result.current).toBe('替换');
  });
  it('honors reduced motion and cancels work on unmount', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { result, unmount } = renderHook(() => useStreamingText('完整内容', true, true));
    expect(result.current).toBe('完整内容');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('flushes when hidden and cancels an active animation on unmount', () => {
    const { result, rerender, unmount } = renderHook(({ text }) => useStreamingText(text, true), {
      initialProps: { text: '' },
    });
    rerender({ text: '字'.repeat(200) });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current).toBe('字'.repeat(200));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    rerender({ text: '字'.repeat(400) });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not split emoji families or combining sequences', () => {
    expect(revealBoundary('👨‍👩‍👧‍👦中文', 0, 1)).toBe('👨‍👩‍👧‍👦'.length);
    expect(revealBoundary('e\u0301中文', 0, 1)).toBe(2);
    expect(revealBoundary('', 0, 1)).toBe(0);
  });
});
