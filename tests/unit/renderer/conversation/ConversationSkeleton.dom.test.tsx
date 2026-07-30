/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ConversationMessageAreaSkeleton,
  ConversationPageSkeleton,
  WorkspacePanelSkeleton,
} from '@/renderer/pages/conversation/components/ConversationSkeleton';

describe('ConversationSkeleton', () => {
  it('renders the route-level conversation page skeleton', () => {
    render(<ConversationPageSkeleton />);
    expect(screen.getByTestId('conversation-page-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-message-area-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-panel-skeleton')).toBeInTheDocument();
  });

  it('renders message and workspace skeletons independently', () => {
    const { rerender } = render(<ConversationMessageAreaSkeleton />);
    expect(screen.getByTestId('conversation-message-area-skeleton')).toBeInTheDocument();
    rerender(<WorkspacePanelSkeleton />);
    expect(screen.getByTestId('workspace-panel-skeleton')).toBeInTheDocument();
  });
});
