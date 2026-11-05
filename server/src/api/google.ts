// Sign-in with Google (Google Identity Services): the browser gets an ID token from Google, the server
// asks Google whether it is genuine and for which app it was issued.

export interface GoogleTokenInfo {
  aud?: string;
  iss?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  exp?: string | number;
}

/** Pure rules for Google's answer: right app, right issuer, verified address, not expired. */
export function judgeGoogleToken(t: GoogleTokenInfo, clientId: string): { email: string; name: string } | null {
  if (t.aud !== clientId) return null;
  if (t.iss !== 'accounts.google.com' && t.iss !== 'https://accounts.google.com') return null;
  if (String(t.email_verified) !== 'true' || !t.email) return null;
  if (Number(t.exp) * 1000 < Date.now()) return null;
  return { email: t.email, name: (t.name ?? '').trim().slice(0, 80) };
}

/** Asks Google to check the ID token. Null when Google refuses it or can't be reached. */
export async function googleIdentity(credential: string, clientId: string): Promise<{ email: string; name: string } | null> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return judgeGoogleToken((await res.json()) as GoogleTokenInfo, clientId);
  } catch {
    return null;
  }
}
