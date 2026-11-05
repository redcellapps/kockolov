import { resolveMx, resolve4 } from 'node:dns/promises';
import { config } from '../config.js';

// Well-known throwaway-address services. Not exhaustive; reCAPTCHA catches the rest.
const DISPOSABLE = new Set([
  '10minutemail.com', '10minutemail.net', 'burnermail.io', 'discard.email', 'dispostable.com', 'emailfake.com',
  'emailondeck.com', 'fakeinbox.com', 'fakemail.net', 'getnada.com', 'grr.la', 'guerrillamail.com',
  'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'inboxkitten.com',
  'maildrop.cc', 'mailcatch.com', 'mailforspam.com', 'mailinator.com', 'mailnesia.com', 'mailsac.com', 'minutemail.com',
  'mintemail.com', 'mohmal.com', 'moakt.com', 'mytemp.email', 'nada.email', 'sharklasers.com', 'spam4.me',
  'spambox.us', 'temp-mail.io', 'temp-mail.org', 'tempail.com', 'tempinbox.com', 'tempmail.com', 'tempmailo.com',
  'tmpmail.net', 'tmpmail.org', 'throwam.com', 'throwawaymail.com', 'trashmail.com', 'trashmail.net', 'trbvm.com',
  'wegwerfemail.de', 'wegwerfmail.de', 'yopmail.com', 'yopmail.net',
]);

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase();
}

export function isDisposableEmail(email: string): boolean {
  return DISPOSABLE.has(emailDomain(email));
}

/**
 * Can the address's domain receive mail at all? A domain with MX records, or with an address record
 * only (the mail fallback), passes. Only "no such domain" or "no server for it" refuses; a DNS hiccup lets it through.
 */
export async function domainAcceptsMail(email: string): Promise<boolean> {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (!config.MAIL_DOMAIN_CHECK) return true;
  try {
    return (await resolveMx(domain)).length > 0;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENODATA' && code !== 'ENOTFOUND') return true;
  }
  try {
    return (await resolve4(domain)).length > 0;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code !== 'ENODATA' && code !== 'ENOTFOUND';
  }
}
