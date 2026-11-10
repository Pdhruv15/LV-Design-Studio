import { describe, expect, it } from 'vitest';
import { hasPreviousView, previousView, rememberView } from './cadViewHistory';

describe('view history per drawing', () => {
  it('remembers each drawing apart and goes back through its own views', () => {
    const a = {}, b = {};
    expect(hasPreviousView(a)).toBe(false);
    rememberView(a, { scale: 1, ox: 0, oy: 0 });
    expect(hasPreviousView(a)).toBe(false); // one view: nothing before it
    rememberView(a, { scale: 2, ox: 10, oy: 10 });
    rememberView(b, { scale: 5, ox: 0, oy: 0 });
    expect(hasPreviousView(a)).toBe(true);
    expect(hasPreviousView(b)).toBe(false);
    expect(previousView(a)).toEqual({ scale: 1, ox: 0, oy: 0 });
    expect(previousView(a)).toBeUndefined();
    expect(previousView(b)).toBeUndefined();
  });
});
