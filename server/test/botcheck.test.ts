import { describe, expect, it } from 'vitest';
import { judgeRecaptcha } from '../src/api/captcha.js';
import { emailDomain, isDisposableEmail } from '../src/api/disposable.js';
import { judgeGoogleToken } from '../src/api/google.js';

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

describe('judgeGoogleToken', () => {
  const now = Math.floor(Date.now() / 1000);
  const good = { aud: 'app.apps.googleusercontent.com', iss: 'https://accounts.google.com', email: 'Ana@Gmail.com', email_verified: 'true', name: ' Ana P. ', exp: String(now + 600) };
  it('accepts a verified address from this app', () => {
    expect(judgeGoogleToken(good, 'app.apps.googleusercontent.com')).toEqual({ email: 'Ana@Gmail.com', name: 'Ana P.' });
  });
  it('refuses a token issued for another app', () => {
    expect(judgeGoogleToken({ ...good, aud: 'other' }, 'app.apps.googleusercontent.com')).toBeNull();
  });
  it('refuses an unverified address and a wrong issuer', () => {
    expect(judgeGoogleToken({ ...good, email_verified: 'false' }, 'app.apps.googleusercontent.com')).toBeNull();
    expect(judgeGoogleToken({ ...good, iss: 'https://evil.example' }, 'app.apps.googleusercontent.com')).toBeNull();
  });
  it('refuses an expired token', () => {
    expect(judgeGoogleToken({ ...good, exp: String(now - 10) }, 'app.apps.googleusercontent.com')).toBeNull();
  });
});

describe('failed sign-ins', () => {
  it('counts wrong passwords per address and reports them without adding one', async () => {
    const { failedLogins } = await import('../src/api/auth.js');
    const key = `peek-${Date.now()}@example.com`;
    expect(failedLogins.peek(key)).toBe(0);
    failedLogins.hit(key);
    failedLogins.hit(key);
    expect(failedLogins.peek(key)).toBe(2);
    expect(failedLogins.peek(key)).toBe(2);
    failedLogins.reset(key);
    expect(failedLogins.peek(key)).toBe(0);
  });
});
