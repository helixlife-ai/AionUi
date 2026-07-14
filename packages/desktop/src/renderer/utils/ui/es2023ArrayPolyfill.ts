/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Polyfill ES2023 Array methods missing on older WebKit (macOS 12 / Safari 15).
 *
 * The all-in-one client embeds a system WebKit that may lack `toReversed` /
 * `toSorted`. Without these, renderer boot crashes with:
 * `TypeError: e.toReversed is not a function` (white screen).
 */

type CompareFn<T> = (a: T, b: T) => number;

type ArrayProto = typeof Array.prototype & {
  toReversed?: <T>(this: T[]) => T[];
  toSorted?: <T>(this: T[], compareFn?: CompareFn<T>) => T[];
  toSpliced?: <T>(this: T[], start: number, deleteCount?: number, ...items: T[]) => T[];
  with?: <T>(this: T[], index: number, value: T) => T[];
};

export const applyEs2023ArrayPolyfills = (): void => {
  const proto = Array.prototype as ArrayProto;

  if (typeof proto.toReversed !== 'function') {
    Object.defineProperty(proto, 'toReversed', {
      configurable: true,
      writable: true,
      value: function toReversed<T>(this: readonly T[]): T[] {
        return this.slice().reverse();
      },
    });
  }

  if (typeof proto.toSorted !== 'function') {
    Object.defineProperty(proto, 'toSorted', {
      configurable: true,
      writable: true,
      value: function toSorted<T>(this: readonly T[], compareFn?: CompareFn<T>): T[] {
        return this.slice().sort(compareFn);
      },
    });
  }

  if (typeof proto.toSpliced !== 'function') {
    Object.defineProperty(proto, 'toSpliced', {
      configurable: true,
      writable: true,
      value: function toSpliced<T>(this: readonly T[], start: number, deleteCount = 0, ...items: T[]): T[] {
        const next = this.slice();
        next.splice(start, deleteCount, ...items);
        return next;
      },
    });
  }

  if (typeof proto.with !== 'function') {
    Object.defineProperty(proto, 'with', {
      configurable: true,
      writable: true,
      value: function arrayWith<T>(this: readonly T[], index: number, value: T): T[] {
        const len = this.length;
        const relative = index < 0 ? len + index : index;
        if (relative < 0 || relative >= len) {
          throw new RangeError('Invalid index');
        }
        const next = this.slice();
        next[relative] = value;
        return next;
      },
    });
  }
};

applyEs2023ArrayPolyfills();
