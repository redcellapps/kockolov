import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { renderInvite, type LinkKind } from '../mail/invite.js';
import { mailConfigured, sendAccountMail } from '../mail/mailer.js';

/** How long each kind of link stays valid. New-password links are short-lived. */
export const LINK_DAYS: Record<LinkKind, number> = { invite: 7, verify: 7, reset: 1 };

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function linkUrl(token: string, kind: LinkKind): string {
  return `${config.APP_URL.replace(/\/$/, '')}/${kind === 'verify' ? 'potvrda' : 'poziv'}/${token}`;
}

/** A new one-time link for the user; any older unused link stops working. */
export async function createLink(userId: number, kind: LinkKind, createdBy: number | null): Promise<string> {
  await query('UPDATE user_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId]);
  const token = randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO user_tokens (token_hash, user_id, kind, created_by, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))`,
    [hashToken(token), userId, kind, createdBy, LINK_DAYS[kind]],
  );
  return token;
}

export interface LinkInfo {
  user_id: number;
  email: string;
  name: string;
  kind: LinkKind;
}

/** The user behind a link, if the link exists, is unused and hasn't expired. */
export async function validLink(token: string): Promise<LinkInfo | null> {
  return one<LinkInfo>(
    `SELECT u.id AS user_id, u.email, u.name, t.kind
       FROM user_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()`,
    [hashToken(token)],
  );
}

/**
 * Creates a link and e-mails it. Without an explicit kind: a new-password link for accepted
 * accounts, a new confirmation for unconfirmed sign-ups, an invitation otherwise. When mail isn't set up or sending
 * fails, the link is returned so an admin can pass it on by hand (never show it to the public).
 */
export async function sendLink(
  userId: number,
  invitedBy: { id: number; name: string } | null,
  kindOverride?: LinkKind,
): Promise<{ kind: LinkKind; emailSent: boolean; link?: string; error?: string }> {
  const u = await one<{ email: string; name: string; accepted_at: string | null; self_signup: boolean }>(
    'SELECT email, name, accepted_at, self_signup FROM users WHERE id = $1',
    [userId],
  );
  if (!u) throw new Error('Korisnik ne postoji');
  // accepted → new password; signed up but unconfirmed → confirmation again; otherwise an invitation
  const kind: LinkKind = kindOverride ?? (u.accepted_at ? 'reset' : u.self_signup ? 'verify' : 'invite');
  const token = await createLink(userId, kind, invitedBy?.id ?? null);
  const url = linkUrl(token, kind);
  if (!mailConfigured()) return { kind, emailSent: false, link: url, error: 'Slanje e-maila nije podešeno (SMTP).' };
  try {
    await sendAccountMail({ to: u.email, ...renderInvite({ kind, name: u.name, url, inviter: invitedBy?.name || null, days: LINK_DAYS[kind] }) });
    return { kind, emailSent: true };
  } catch (err) {
    return { kind, emailSent: false, link: url, error: (err as Error).message };
  }
}

/** True when a link of this kind went to the user less than `seconds` ago (stops mail floods). */
export async function linkSentRecently(userId: number, kind: LinkKind, seconds = 60): Promise<boolean> {
  return !!(await one(
    `SELECT 1 FROM user_tokens WHERE user_id = $1 AND kind = $2 AND created_at > now() - make_interval(secs => $3)`,
    [userId, kind, seconds],
  ));
}
