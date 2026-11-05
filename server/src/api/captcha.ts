import { config } from '../config.js';

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

export type CaptchaResult = { ok: true } | { ok: false; reason: string };

interface VerifyBody {
  success?: boolean;
  score?: number;
  action?: string;
  'error-codes'?: string[];
}

/** Decides from Google's answer. Pure, so the rules can be tested without calling Google. */
export function judgeRecaptcha(body: VerifyBody, action: string, minScore: number): CaptchaResult {
  if (!body.success) return { ok: false, reason: (body['error-codes'] ?? ['rejected']).join(',') };
  if (body.action !== undefined && body.action !== action) return { ok: false, reason: 'action' };
  if ((body.score ?? 0) < minScore) return { ok: false, reason: `score ${body.score}` };
  return { ok: true };
}

/**
 * Checks a reCAPTCHA v3 token from the browser. Off when no secret key is configured.
 * If Google can't be reached the request is refused: better a retry than an unprotected form.
 */
export async function verifyRecaptcha(token: string | undefined, ip: string, action: string): Promise<CaptchaResult> {
  const secret = config.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: true };
  if (!token) return { ok: false, reason: 'missing' };
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, reason: `http ${res.status}` };
    return judgeRecaptcha((await res.json()) as VerifyBody, action, config.RECAPTCHA_MIN_SCORE);
  } catch (err) {
    return { ok: false, reason: `unreachable: ${(err as Error).message}` };
  }
}
