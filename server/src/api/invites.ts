import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { renderInvite, type LinkKind } from '../mail/invite.js';
import { mailConfigured, sendMail } from '../mail/mailer.js';

export const LINK_DAYS = 7;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function linkUrl(token: string): string {
  return `${config.APP_URL.replace(/\/$/, '')}/poziv/${token}`;
}

/** A new one-time link for the user; any older unused link stops working. */
export async function createLink(userId: number, kind: LinkKind, createdBy: number | null): Promise<string> {
  await query('UPDATE user_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId]);
  const token = randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO user_tokens (token_hash, user_id, kind, created_by, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))`,
    [hashToken(token), userId, kind, createdBy, LINK_DAYS],
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
 * Creates a link and e-mails it. An invitation for accounts that haven't been accepted yet,
 * a new-password link otherwise. When mail isn't set up or sending fails, the link is
 * returned so the admin can pass it on by hand.
 */
export async function sendLink(
  userId: number,
  invitedBy: { id: number; name: string } | null,
): Promise<{ kind: LinkKind; emailSent: boolean; link?: string; error?: string }> {
  const u = await one<{ email: string; name: string; accepted_at: string | null }>(
    'SELECT email, name, accepted_at FROM users WHERE id = $1',
    [userId],
  );
  if (!u) throw new Error('Korisnik ne postoji');
  const kind: LinkKind = u.accepted_at ? 'reset' : 'invite';
  const token = await createLink(userId, kind, invitedBy?.id ?? null);
  const url = linkUrl(token);
  if (!mailConfigured()) return { kind, emailSent: false, link: url, error: 'Slanje e-maila nije podešeno (SMTP).' };
  try {
    await sendMail({ to: u.email, ...renderInvite({ kind, name: u.name, url, inviter: invitedBy?.name || null, days: LINK_DAYS }) });
    return { kind, emailSent: true };
  } catch (err) {
    return { kind, emailSent: false, link: url, error: (err as Error).message };
  }
}
