import React from 'react';
import MarkdownView from '@/renderer/components/Markdown';
import { useStreamingText } from './useStreamingText';

/** Smooth tool text only; execution state, arguments and approval controls remain immediate. */
export default function ToolOutput({ text, status }: { text: string; status?: string }) {
  const displayed = useStreamingText(
    text,
    status === 'in_progress',
    false,
    status === 'failed' || status === 'cancelled'
  );
  return <MarkdownView>{displayed}</MarkdownView>;
}
