import { useEffect, useRef, useState } from 'react';

const FRAME_MS = 32;
const MAX_LAG_MS = 800;
const FINISH_MS = 120;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Advance to a complete grapheme, never exposing half an emoji or combining sequence. */
export function revealBoundary(text: string, start: number, count: number): number {
  let end = start;
  for (const part of segmenter.segment(text.slice(start))) {
    end = start + part.index + part.segment.length;
    if (end >= start + count) break;
  }
  return end;
}

/** Smooth append-only live text with a bounded backlog; persisted content stays untouched. */
export function useStreamingText(content: string, streaming: boolean, animateInitial = false, stopped = false): string {
  const [displayed, setDisplayed] = useState(() => (animateInitial ? '' : content));
  const state = useRef({
    text: displayed,
    target: content,
    deadline: 0,
    last: 0,
    frame: 0,
    streaming: false,
    finishedAt: -Infinity,
  });
  const [instant, setInstant] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setInstant(document.hidden || Boolean(media?.matches));
    update();
    document.addEventListener('visibilitychange', update);
    media?.addEventListener('change', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      media?.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    const s = state.current;
    cancelAnimationFrame(s.frame);
    const now = performance.now();
    if (s.streaming && !streaming) s.finishedAt = now;
    s.streaming = streaming;
    const wasIdle = s.text === s.target;
    const replaced = !content.startsWith(s.target);
    s.target = content;
    if (instant || stopped || replaced || (!streaming && wasIdle && now - s.finishedAt > 500)) {
      s.text = content;
      setDisplayed(content);
      return;
    }
    const remaining = content.length - s.text.length;
    if (remaining <= 0) return;
    s.deadline = now + (streaming ? Math.min(MAX_LAG_MS, Math.max(FRAME_MS, remaining * 12)) : FINISH_MS);
    if (wasIdle || s.last === 0) s.last = now;
    const tick = (time: number) => {
      const elapsed = time - s.last;
      if (elapsed >= FRAME_MS || time >= s.deadline) {
        const left = s.target.length - s.text.length;
        const count = time >= s.deadline ? left : Math.max(1, Math.ceil((left * elapsed) / (s.deadline - s.last)));
        s.text = s.target.slice(0, revealBoundary(s.target, s.text.length, count));
        s.last = time;
        setDisplayed(s.text);
      }
      if (s.text !== s.target) s.frame = requestAnimationFrame(tick);
    };
    s.frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(s.frame);
  }, [content, streaming, instant, stopped]);

  // Replacement content must never expose a stale prefix for one render.
  return content.startsWith(displayed) ? displayed : content;
}
