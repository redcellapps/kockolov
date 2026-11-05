import { describe, expect, it } from 'vitest';
import { judgeRecaptcha } from '../src/api/captcha.js';
import { emailDomain, isDisposableEmail } from '../src/api/disposable.js';

describe('judgeRecaptcha', () => {
  it('accepts a human-looking score for the same action', () => {
    expect(judgeRecaptcha({ success: true, score: 0.9, action: 'register' }, 'register', 0.5)).toEqual({ ok: true });
  });
  it('refuses a low score', () => {
    expect(judgeRecaptcha({ success: true, score: 0.1, action: 'register' }, 'register', 0.5).ok).toBe(false);
  });
  it('refuses a token made for another action', () => {
    expect(judgeRecaptcha({ success: true, score: 0.9, action: 'forgot' }, 'register', 0.5).ok).toBe(false);
  });
  it('refuses when Google says the token is invalid', () => {
    const r = judgeRecaptcha({ success: false, 'error-codes': ['invalid-input-response'] }, 'register', 0.5);
    expect(r).toEqual({ ok: false, reason: 'invalid-input-response' });
  });
});

describe('disposable addresses', () => {
  it('finds throwaway domains regardless of case', () => {
    expect(isDisposableEmail('someone@Mailinator.com')).toBe(true);
    expect(isDisposableEmail('someone@yopmail.com')).toBe(true);
  });
  it('leaves ordinary providers alone', () => {
    expect(isDisposableEmail('milan@gmail.com')).toBe(false);
    expect(isDisposableEmail('info@kockolov.rs')).toBe(false);
  });
  it('reads the domain after the last @', () => {
    expect(emailDomain('a@b@Example.RS ')).toBe('example.rs');
  });
});
