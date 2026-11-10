import { describe, expect, it } from 'vitest';
import { describeNetworkError } from '../src/lib/http.js';

describe('describeNetworkError', () => {
  it('adds the cause behind "fetch failed"', () => {
    const err = new TypeError('fetch failed', { cause: Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' }) });
    expect(describeNetworkError(err)).toBe('fetch failed (CERT_HAS_EXPIRED: certificate has expired)');
  });
  it('names a timeout', () => {
    const err = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    expect(describeNetworkError(err)).toContain('timeout');
  });
  it('leaves other errors alone', () => {
    expect(describeNetworkError(new Error('boom'))).toBe('boom');
  });
});
