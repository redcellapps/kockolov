import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

const transports = new Map<string, Transporter>();

export function mailConfigured(): boolean {
  return !!config.SMTP_HOST;
}

/** One SMTP connection per login (the morning mailbox, and optionally the account mailbox). */
function getTransport(user?: string, pass?: string): Transporter {
  const key = user ?? '';
  let t = transports.get(key);
  if (!t) {
    t = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: user ? { user, pass } : undefined,
      tls: config.SMTP_TLS_INSECURE ? { rejectUnauthorized: false } : undefined,
    });
    transports.set(key, t);
  }
  return t;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Morning digest and admin alerts, from MAIL_FROM (jutro@…). */
export async function sendMail(msg: MailMessage): Promise<void> {
  if (!mailConfigured()) throw new Error('SMTP nije podešen (SMTP_HOST)');
  await getTransport(config.SMTP_USER, config.SMTP_PASS).sendMail({ from: config.MAIL_FROM, ...msg });
}

/** Sender used for account e-mails: ACCOUNT_MAIL_FROM, or MAIL_FROM when that isn't set. */
export function accountFrom(): string {
  return config.ACCOUNT_MAIL_FROM || config.MAIL_FROM;
}

/** Sign-up confirmation, new password and invitation, from ACCOUNT_MAIL_FROM (nalog@…). */
export async function sendAccountMail(msg: MailMessage): Promise<void> {
  if (!mailConfigured()) throw new Error('SMTP nije podešen (SMTP_HOST)');
  const t = config.ACCOUNT_SMTP_USER
    ? getTransport(config.ACCOUNT_SMTP_USER, config.ACCOUNT_SMTP_PASS)
    : getTransport(config.SMTP_USER, config.SMTP_PASS);
  await t.sendMail({ from: accountFrom(), ...msg });
}
