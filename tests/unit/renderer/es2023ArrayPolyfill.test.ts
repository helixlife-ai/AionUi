/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyEs2023ArrayPolyfills } from '@renderer/utils/ui/es2023ArrayPolyfill';

type ArrayProto = typeof Array.prototype & {
  toReversed?: <T>(this: T[]) => T[];
  toSorted?: <T>(this: T[], compareFn?: (a: T, b: T) => number) => T[];
  toSpliced?: <T>(this: T[], start: number, deleteCount?: number, ...items: T[]) => T[];
  with?: <T>(this: T[], index: number, value: T) => T[];
};

const proto = Array.prototype as ArrayProto;

const originalDescriptors = {
  toReversed: Object.getOwnPropertyDescriptor(proto, 'toReversed'),
  toSorted: Object.getOwnPropertyDescriptor(proto, 'toSorted'),
  toSpliced: Object.getOwnPropertyDescriptor(proto, 'toSpliced'),
  with: Object.getOwnPropertyDescriptor(proto, 'with'),
};

const restoreDescriptor = (key: keyof typeof originalDescriptors) => {
  const descriptor = originalDescriptors[key];
  if (descriptor) {
    Object.defineProperty(proto, key, descriptor);
    return;
  }
  // Native engines that never had the method leave it undefined after delete.
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete proto[key];
};

describe('applyEs2023ArrayPolyfills', () => {
  beforeEach(() => {
    delete proto.toReversed;
    delete proto.toSorted;
    delete proto.toSpliced;
    delete proto.with;
  });

  afterEach(() => {
    restoreDescriptor('toReversed');
    restoreDescriptor('toSorted');
    restoreDescriptor('toSpliced');
    restoreDescriptor('with');
  });

  it('polyfills toReversed without mutating the source array', () => {
    applyEs2023ArrayPolyfills();

    const source = [1, 2, 3];
    expect(source.toReversed()).toEqual([3, 2, 1]);
    expect(source).toEqual([1, 2, 3]);
  });

  it('polyfills toSorted without mutating the source array', () => {
    applyEs2023ArrayPolyfills();

    const source = [3, 1, 2];
    expect(source.toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(source).toEqual([3, 1, 2]);
  });

  it('polyfills toSpliced and with', () => {
    applyEs2023ArrayPolyfills();

    expect([1, 2, 3].toSpliced(1, 1, 9)).toEqual([1, 9, 3]);
    expect([1, 2, 3].with(1, 9)).toEqual([1, 9, 3]);
  });

  it('is idempotent when native methods already exist', () => {
    applyEs2023ArrayPolyfills();
    const first = proto.toReversed;
    applyEs2023ArrayPolyfills();
    expect(proto.toReversed).toBe(first);
  });
});
