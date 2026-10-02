import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { one, query } from '../../db.js';
import { isCrawlRunning, runCrawl } from '../../crawler/pipeline.js';
import { refreshSets } from '../../crawler/refresh.js';
import { computeDeals } from '../../deals/engine.js';
import { sendLink } from '../invites.js';
import { config } from '../../config.js';
import {
  countRecipients,
  createAnnouncement,
  listAnnouncements,
  renderAnnouncement,
  retryAnnouncement,
  sendTestAnnouncement,
} from '../../mail/announce.js';
import { mailConfigured } from '../../mail/mailer.js';
import { applyRule, loadRules, normalizePhrase, releaseRule, type HideRule } from '../../crawler/hiding.js';
import { normalizeText } from '../../lib/normalize.js';
import { hashPassword, normalizeEmail } from '../auth.js';

/** Offers waiting for a decision: not linked, not "not a set", not hidden */
const OPEN = "match_method IS DISTINCT FROM 'merch' AND match_method IS DISTINCT FROM 'hidden' AND match_method IS DISTINCT FROM 'hidden_rule'";

/** Rows whose title contains every word of q (any order, without diacritics) */
function filterByWords<T extends { title: string }>(rows: T[], q: string | undefined): T[] {
  const words = normalizeText(q).split(' ').filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const n = ` ${normalizeText(r.title)} `;
    return words.every((w) => n.includes(` ${w}`));
  });
}

/** Hidden offers that were linked to sets: set data and today's best buys change */
function refreshAfterHiding(log: { error: (e: unknown) => void }) {
  void (async () => {
    await refreshSets(() => {});
    await computeDeals({ log: () => {} });
  })().catch((err) => log.error(err));
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'Potrebna je prijava.' });
  if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Samo za administratore.' });
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/admin')) return requireAdmin(req, reply);
  });

  app.get('/api/admin/overview', async () => {
    const runs = await query(
      `SELECT id, shop_id, started_at, finished_at, status, pages, items, matched, new_items, price_changes, deactivated, error
         FROM crawl_runs ORDER BY started_at DESC LIMIT 40`,
    );
    const shops = await query(
      `SELECT sh.id, sh.name, sh.enabled,
              count(o.id) FILTER (WHERE o.active)::int AS active_offers,
              count(o.id) FILTER (WHERE o.active AND o.set_num IS NULL AND ${OPEN})::int AS unmatched,
              count(o.id) FILTER (WHERE o.active AND o.match_method = 'merch')::int AS merch,
              count(o.id) FILTER (WHERE o.active AND o.match_method IN ('hidden', 'hidden_rule'))::int AS hidden,
              count(o.id) FILTER (WHERE o.active AND o.match_method = 'name')::int AS name_matched
         FROM shops sh LEFT JOIN offers o ON o.shop_id = sh.id GROUP BY sh.id ORDER BY sh.id`,
    );
    const users = await one('SELECT count(*)::int AS count FROM users');
    return { runs, shops, users: users?.count ?? 0, crawlRunning: isCrawlRunning() };
  });

  /** Offers without a set that still need a decision: link them or hide them. ?q= filters by title words. */
  app.get('/api/admin/unmatched', async (req) => {
    const { shop, q } = z.object({ shop: z.string().optional(), q: z.string().max(80).optional() }).parse(req.query);
    const rows = await query<{ id: number; shop_id: string; seller: string; title: string; url: string; price_rsd: number; in_stock: boolean }>(
      `SELECT id, shop_id, seller, title, url, price_rsd, in_stock
         FROM offers WHERE active AND set_num IS NULL AND ${OPEN} ${shop ? 'AND shop_id = $1' : ''}
        ORDER BY in_stock DESC, price_rsd DESC`,
      shop ? [shop] : [],
    );
    const items = filterByWords(rows, q);
    return { total: items.length, items: items.slice(0, 300) };
  });

  // ---- hiding offers that are not LEGO sets (Barbie, Nerf, used items…) ----
  /** Hides the given offers for good (also ones linked to a set: they leave the site). */
  app.post('/api/admin/offers/hide', async (req) => {
    const { ids } = z.object({ ids: z.array(z.number().int()).min(1).max(2000) }).parse(req.body);
    const rows = await query<{ set_num: string | null }>(
      "UPDATE offers o SET set_num = NULL, match_method = 'hidden' FROM offers old WHERE o.id = old.id AND o.id = ANY($1::bigint[]) RETURNING old.set_num",
      [ids],
    );
    if (rows.some((r) => r.set_num)) refreshAfterHiding(req.log);
    return { ok: true, hidden: rows.length };
  });

  /** Shows an offer hidden one by one again; the next crawl of its shop links it to a set. */
  app.post<{ Params: { id: string } }>('/api/admin/offers/:id/restore', async (req, reply) => {
    const o = await one<{ match_method: string | null }>('SELECT match_method FROM offers WHERE id = $1', [Number(req.params.id)]);
    if (!o) return reply.code(404).send({ error: 'Ponuda nije pronađena' });
    if (o.match_method === 'hidden_rule') return reply.code(409).send({ error: 'Ovu ponudu sakriva pravilo; obriši pravilo da je vratiš.' });
    await query("UPDATE offers SET match_method = NULL WHERE id = $1 AND match_method = 'hidden'", [Number(req.params.id)]);
    return { ok: true };
  });

  app.get('/api/admin/hidden', async (req) => {
    const { q } = z.object({ q: z.string().max(80).optional() }).parse(req.query);
    const rules = await query<HideRule & { created_at: string }>('SELECT id, phrase, shop_id, created_at FROM hide_rules ORDER BY phrase');
    const rows = await query<{ id: number; shop_id: string; seller: string; title: string; url: string; price_rsd: number; match_method: string }>(
      `SELECT id, shop_id, seller, title, url, price_rsd, match_method
         FROM offers WHERE active AND match_method IN ('hidden', 'hidden_rule') ORDER BY shop_id, title`,
    );
    const items = filterByWords(rows, q);
    return { rules, total: items.length, items: items.slice(0, 300) };
  });

  /** "Always hide offers with this phrase" (in one shop or everywhere); hides the current ones too. */
  app.post('/api/admin/hide-rules', async (req, reply) => {
    const body = z.object({ phrase: z.string().max(80), shopId: z.string().nullable().optional() }).parse(req.body);
    const phrase = normalizePhrase(body.phrase);
    if (phrase.length < 3) return reply.code(400).send({ error: 'Pravilo mora imati bar 3 slova.' });
    const shopId = body.shopId || null;
    const row = await one<HideRule>(
      `INSERT INTO hide_rules (phrase, shop_id, created_by) VALUES ($1, $2, $3)
       ON CONFLICT (phrase, coalesce(shop_id, '')) DO UPDATE SET phrase = EXCLUDED.phrase
       RETURNING id, phrase, shop_id`,
      [phrase, shopId, req.user!.id],
    );
    const res = await applyRule(row!);
    if (res.hadSets) refreshAfterHiding(req.log);
    return { ok: true, rule: row, hidden: res.hidden };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/hide-rules/:id', async (req, reply) => {
    const rules = await loadRules();
    const rule = rules.find((r) => r.id === Number(req.params.id));
    if (!rule) return reply.code(404).send({ error: 'Pravilo nije pronađeno' });
    await query('DELETE FROM hide_rules WHERE id = $1', [rule.id]);
    const restored = await releaseRule(rule, rules.filter((r) => r.id !== rule.id));
    return { ok: true, restored };
  });

  app.post<{ Params: { id: string } }>('/api/admin/offers/:id/match', async (req, reply) => {
    const { setNum } = z.object({ setNum: z.string().regex(/^\d{3,7}(-\w+)?$/).nullable() }).parse(req.body);
    const offer = await one<{ id: number; title: string; image_url: string | null }>(
      'SELECT id, title, image_url FROM offers WHERE id = $1',
      [Number(req.params.id)],
    );
    if (!offer) return reply.code(404).send({ error: 'Ponuda nije pronađena' });
    if (setNum) {
      await query('INSERT INTO sets (set_num, name, image_url) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [
        setNum, offer.title, offer.image_url,
      ]);
    }
    await query("UPDATE offers SET set_num = $2, match_method = 'manual' WHERE id = $1", [offer.id, setNum]);
    await refreshSets(() => {});
    return { ok: true };
  });

  app.get('/api/admin/users', async () =>
    query(
      `SELECT u.id, u.email, u.name, u.role, u.digest_enabled, u.created_at, u.last_login_at, u.accepted_at, u.self_signup,
              (SELECT max(t.created_at) FROM user_tokens t WHERE t.user_id = u.id AND t.kind = 'invite') AS invited_at
         FROM users u ORDER BY u.created_at`,
    ),
  );

  // Adds the account and e-mails an invitation; the person sets their own password from the link.
  app.post('/api/admin/users', async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().max(80).optional(),
        role: z.enum(['user', 'admin']).default('user'),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Unesite ispravan e-mail.' });
    const email = normalizeEmail(body.data.email);
    if (await one('SELECT 1 FROM users WHERE email = $1', [email])) {
      return reply.code(409).send({ error: 'Korisnik sa ovim e-mailom već postoji.' });
    }
    // unusable random password until the invitation is accepted
    const user = await one<{ id: number }>(
      'INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, body.data.name ?? '', body.data.role, await hashPassword(randomBytes(24).toString('base64url'))],
    );
    const result = await sendLink(user!.id, { id: req.user!.id, name: req.user!.name });
    return { ok: true, email, ...result };
  });

  // Sends the invitation again (pending accounts) or a new-password link (accepted accounts).
  app.post<{ Params: { id: string } }>('/api/admin/users/:id/invite', async (req, reply) => {
    const id = Number(req.params.id);
    const u = await one<{ email: string }>('SELECT email FROM users WHERE id = $1', [id]);
    if (!u) return reply.code(404).send({ error: 'Korisnik ne postoji.' });
    const result = await sendLink(id, { id: req.user!.id, name: req.user!.name });
    return { ok: true, email: u.email, ...result };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/users/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (id === req.user!.id) return reply.code(400).send({ error: 'Ne možete obrisati sopstveni nalog.' });
    await query('DELETE FROM users WHERE id = $1', [id]);
    return { ok: true };
  });

  app.post('/api/admin/crawl', async (req, reply) => {
    const { shops } = z.object({ shops: z.array(z.string()).optional() }).parse(req.body ?? {});
    if (isCrawlRunning()) return reply.code(409).send({ error: 'Preuzimanje cena je već u toku.' });
    runCrawl({ shops, log: (m) => req.log.info(m) }).catch((err) => req.log.error(err));
    return { ok: true, started: true };
  });

  app.post('/api/admin/deals', async () => {
    const deals = await computeDeals({ log: () => {} });
    return { ok: true, count: deals.length };
  });

  // ---- news e-mail to every user ----
  const draft = z.object({
    subject: z.string().trim().min(3, 'Naslov je prekratak.').max(150, 'Naslov je predugačak (najviše 150 znakova).'),
    body: z.string().trim().min(10, 'Tekst je prekratak.').max(20000, 'Tekst je predugačak.'),
  });
  const badDraft = (reply: FastifyReply, err: z.ZodError) => reply.code(400).send({ error: err.issues[0]?.message ?? 'Neispravan unos.' });

  app.get('/api/admin/announcements', async (req) => ({
    recipients: await countRecipients(),
    mailConfigured: mailConfigured(),
    delayMs: config.ANNOUNCE_DELAY_MS,
    adminEmail: req.user!.email,
    items: await listAnnouncements(),
  }));

  /** The e-mail as it will look (with the admin's own name), for the preview next to the form */
  app.post('/api/admin/announcements/preview', async (req) => {
    const body = z.object({ subject: z.string().max(150), body: z.string().max(20000) }).parse(req.body ?? {});
    const m = renderAnnouncement({
      subject: body.subject.trim() || 'Naslov obaveštenja',
      body: body.body.trim() || 'Ovde će biti tekst obaveštenja.',
      name: req.user!.name,
      unsubscribe: `${config.APP_URL.replace(/\/$/, '')}/nalog`,
    });
    return { subject: m.subject, html: m.html };
  });

  app.post('/api/admin/announcements/test', async (req, reply) => {
    const body = draft.safeParse(req.body ?? {});
    if (!body.success) return badDraft(reply, body.error);
    if (!mailConfigured()) return reply.code(503).send({ error: 'Slanje mejlova nije podešeno (SMTP_HOST).' });
    try {
      const email = await sendTestAnnouncement(body.data, req.user!.id);
      return { ok: true, email };
    } catch (err) {
      return reply.code(502).send({ error: `Mejl nije poslat: ${(err as Error).message}` });
    }
  });

  app.post('/api/admin/announcements', async (req, reply) => {
    const parsed = draft.extend({ expected: z.number().int() }).safeParse(req.body ?? {});
    if (!parsed.success) return badDraft(reply, parsed.error);
    if (!mailConfigured()) return reply.code(503).send({ error: 'Slanje mejlova nije podešeno (SMTP_HOST).' });
    // the confirmation named a number of recipients; don't send if it no longer holds
    const now = await countRecipients();
    if (now !== parsed.data.expected) {
      return reply.code(409).send({ error: `Broj primalaca se u međuvremenu promenio (sada ${now}). Proveri i pošalji ponovo.`, recipients: now });
    }
    if (now === 0) return reply.code(400).send({ error: 'Nema korisnika koji primaju novosti.' });
    const { subject, body } = parsed.data;
    const res = await createAnnouncement({ subject, body }, req.user!.id, (m) => req.log.info(m));
    return { ok: true, ...res };
  });

  app.post<{ Params: { id: string } }>('/api/admin/announcements/:id/retry', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(404).send({ error: 'Nije pronađeno' });
    if (!mailConfigured()) return reply.code(503).send({ error: 'Slanje mejlova nije podešeno (SMTP_HOST).' });
    const retried = await retryAnnouncement(id, (m) => req.log.info(m));
    return { ok: true, retried };
  });
}
