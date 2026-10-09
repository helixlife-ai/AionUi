import { ipcBridge } from '@/common';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    application: { systemInfo: { invoke: vi.fn().mockResolvedValue({ workDir: '/' }) } },
    fs: { getFilesByDir: { invoke: vi.fn().mockResolvedValue([]) } },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

import { WebFsPicker } from '@/renderer/components/workspace/webFsPicker';

afterEach(() => cleanup());

describe('WebFsPicker responsive dialog', () => {
  it('keeps the picker inside a narrow WebUI viewport', async () => {
    render(<WebFsPicker options={{ properties: ['openDirectory'] }} onDone={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    const modal = dialog.closest<HTMLElement>('.arco-modal');

    expect(modal?.style.width).toBe('calc(100vw - 32px)');
    expect(modal?.style.maxWidth).toBe('640px');
  });
});

it('confines remembered and manually entered paths to the appliance root', async () => {
  localStorage.setItem('aionui:web-fs-picker:last-dir', '/etc');
  render(<WebFsPicker options={{ properties: ['openDirectory'] }} fsRoot='/agent_hub' onDone={vi.fn()} />);
  await waitFor(() =>
    expect(ipcBridge.fs.getFilesByDir.invoke).toHaveBeenLastCalledWith({ dir: '/agent_hub', root: '/agent_hub' })
  );
  expect(screen.getByRole('button', { name: 'Up' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '/agent_hub/../../etc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('/agent_hub'));
  localStorage.clear();
});
