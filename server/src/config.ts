import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Local development: read the repository's .env (e.g. DATABASE_URL). Real environment variables win;
// in production Docker passes the variables itself, and tests set their own.
const localEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'production' && !process.env.VITEST && existsSync(localEnv)) {
  process.loadEnvFile(localEnv);
}

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://kockolov:kockolov@localhost:5432/kockolov'),

  // Public URL of the app, used in e-mails
  APP_URL: z.string().default('http://localhost:8080'),
  // false = login required for everything (current phase); true = anyone can browse
  PUBLIC_MODE: bool(false),
  // Allow self sign-up (defaults to PUBLIC_MODE)
  REGISTRATION_OPEN: z.string().optional(),
  COOKIE_SECURE: bool(false),
  SESSION_DAYS: z.coerce.number().default(60),

  // Crawler
  CRAWLER_USER_AGENT: z
    .string()
    .default('KockolovBot/0.1 (+https://github.com/redcellapps/kockolov; LEGO price comparison)'),
  CRAWLER_DELAY_MS: z.coerce.number().default(1200),
  CRAWLER_TIMEOUT_MS: z.coerce.number().default(30000),
  CRAWLER_SHOPS: z.string().optional(), // comma list; empty = all enabled
  LSTORE_BASE_URL: z.string().default('https://lstore.rs'),
  KOCKARIUM_BASE_URL: z.string().default('https://www.kockarium.rs'),
  ANANAS_BASE_URL: z.string().default('https://ananas.rs'),

  // Schedules (Europe/Belgrade)
  TZ_NAME: z.string().default('Europe/Belgrade'),
  CRAWL_CRON: z.string().default('30 5 * * *'),
  DIGEST_CRON: z.string().default('0 7 * * *'),

  // E-mail (morning digest)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Accept a self-signed certificate (the server's own Exim on VestaCP/myVesta)
  SMTP_TLS_INSECURE: bool(false),
  MAIL_FROM: z.string().default('Kockolov <no-reply@kockolov.rs>'),
  // Account e-mails (sign-up confirmation, new password, invitation) from their own address.
  // Empty = same as MAIL_FROM. With ACCOUNT_SMTP_USER set they log in to SMTP as that mailbox.
  ACCOUNT_MAIL_FROM: z.string().optional(),
  ACCOUNT_SMTP_USER: z.string().optional(),
  ACCOUNT_SMTP_PASS: z.string().optional(),
  ADMIN_ALERT_EMAIL: z.string().optional(),
});

const parsed = schema.parse(process.env);

export const config = {
  ...parsed,
  registrationOpen:
    parsed.REGISTRATION_OPEN === undefined || parsed.REGISTRATION_OPEN === ''
      ? parsed.PUBLIC_MODE
      : ['1', 'true', 'yes', 'on'].includes(parsed.REGISTRATION_OPEN.toLowerCase()),
  isProd: parsed.NODE_ENV === 'production',
};

export type Config = typeof config;
