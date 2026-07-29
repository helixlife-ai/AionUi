/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveOfficePreviewFilePath } from '@/renderer/utils/hub/resolveOfficePreviewFilePath';
import { describe, expect, it } from 'vitest';

describe('resolveOfficePreviewFilePath', () => {
  it('leaves absolute POSIX paths unchanged', () => {
    expect(resolveOfficePreviewFilePath('/agent_hub/test_proj2/report.xlsx')).toBe(
      '/agent_hub/test_proj2/report.xlsx'
    );
    expect(
      resolveOfficePreviewFilePath('/agent_hub/肝细胞癌文献检索/HCC_literature_20260728_081846.xlsx', '/agent_hub/肝细胞癌文献检索')
    ).toBe('/agent_hub/肝细胞癌文献检索/HCC_literature_20260728_081846.xlsx');
  });

  it('leaves absolute Windows paths unchanged', () => {
    expect(resolveOfficePreviewFilePath('C:/Users/demo/report.xlsx')).toBe('C:/Users/demo/report.xlsx');
    expect(resolveOfficePreviewFilePath('D:\\data\\sheet.xlsx')).toBe('D:/data/sheet.xlsx');
  });

  it('only prefixes a leading slash for forgotten agent_hub relatives', () => {
    expect(resolveOfficePreviewFilePath('agent_hub/test_proj2/report.docx')).toBe(
      '/agent_hub/test_proj2/report.docx'
    );
  });

  it('joins bare relative names to an absolute workspace', () => {
    expect(resolveOfficePreviewFilePath('report.xlsx', '/agent_hub/test_proj2')).toBe(
      '/agent_hub/test_proj2/report.xlsx'
    );
  });

  it('does not invent paths when relative and workspace are both missing', () => {
    expect(resolveOfficePreviewFilePath('relative-only.xlsx')).toBe('relative-only.xlsx');
  });
});
