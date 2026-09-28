import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

let transporter: Transporter | null = null;

export function mailConfigured(): boolean {
  return !!config.SMTP_HOST;
}

function getTransport(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(msg: { to: string; subject: string; html: string; text: string }): Promise<void> {
  if (!mailConfigured()) throw new Error('SMTP nije podešen (SMTP_HOST)');
  await getTransport().sendMail({ from: config.MAIL_FROM, ...msg });
}
