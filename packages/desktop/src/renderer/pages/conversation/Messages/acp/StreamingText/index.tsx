import React, { useCallback, useSyncExternalStore } from 'react';
import MarkdownView from '@/renderer/components/Markdown';
import {
  getConversationRuntimeViewSnapshot,
  subscribeConversationRuntimeView,
} from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import { useStreamingText } from './useStreamingText';

type Props = React.ComponentProps<typeof MarkdownView> & {
  conversationId: string;
  current: boolean;
  createdAt?: number;
};

/** Keep animation local to the current Markdown reply, outside the durable message store. */
export default function StreamingText({ conversationId, current, createdAt, children, ...props }: Props) {
  const snapshot = useCallback(() => getConversationRuntimeViewSnapshot(conversationId), [conversationId]);
  const runtime = useSyncExternalStore(subscribeConversationRuntimeView, snapshot, snapshot);
  const streaming = current && runtime.isProcessing;
  const fresh = streaming && Boolean(createdAt && Math.abs(Date.now() - createdAt) < 1500);
  const text = useStreamingText(children, streaming, fresh, runtime.localStopping);
  return <MarkdownView {...props}>{text}</MarkdownView>;
}
