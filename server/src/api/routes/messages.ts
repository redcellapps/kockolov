import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../../db.js';
import { createLimiter } from '../auth.js';
import { mailConfigured, sendAccountMail } from '../../mail/mailer.js';
import { renderMessageMail } from '../../mail/message.js';
import { gate } from './listings.js';
import { requireUser } from './me.js';

const limits = { send: createLimiter(30, 10 * 60_000), newConv: createLimiter(15, 24 * 3600_000), report: createLimiter(20, 24 * 3600_000) };
/** At most one "you have a message" e-mail per conversation and recipient in this time */
export const MAIL_EVERY_MIN = 15;
const body = z.object({ text: z.string().trim().min(1).max(1000) });

interface Conv {
  id: number;
  listing_id: number;
  buyer_id: number;
  seller_id: number;
  title: string;
}

/** Stores a message, bumps the conversation and e-mails the other person (throttled, and only if they didn't switch it off) */
export async function sendMessage(conv: Conv, senderId: number, senderName: string, text: string, log: (e: unknown) => void = () => {}) {
  const msg = await one<{ id: number; created_at: string }>('INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id, created_at', [conv.id, senderId, text]);
  await query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conv.id]);
  const toSeller = senderId === conv.buyer_id;
  const recipientId = toSeller ? conv.seller_id : conv.buyer_id;
  const col = toSeller ? 'seller_mailed_at' : 'buyer_mailed_at';
  try {
    if (!mailConfigured()) return msg;
    // the claim is atomic: only one request wins the right to send within the window
    const claimed = await one(
      `UPDATE conversations SET ${col} = now()
        WHERE id = $1 AND (${col} IS NULL OR ${col} < now() - make_interval(mins => $2))
          AND EXISTS (SELECT 1 FROM users WHERE id = $3 AND msg_email_enabled AND accepted_at IS NOT NULL)
        RETURNING id`,
      [conv.id, MAIL_EVERY_MIN, recipientId],
    );
    if (!claimed) return msg;
    const r = await one<{ email: string; name: string }>('SELECT email, name FROM users WHERE id = $1', [recipientId]);
    if (!r) return msg;
    const m = renderMessageMail({ name: r.name, from: senderName || 'Korisnik', title: conv.title, text, conversationId: conv.id });
    await sendAccountMail({ to: r.email, subject: m.subject, html: m.html, text: m.text });
  } catch (err) {
    log(err); // a failed e-mail must not fail the message
  }
  return msg;
}

async function myConversation(id: number, userId: number) {
  return one<Conv>(
    `SELECT c.id, c.listing_id, c.buyer_id, c.seller_id, coalesce(l.title, c.listing_title, 'oglas') AS title FROM conversations c LEFT JOIN listings l ON l.id = c.listing_id
      WHERE c.id = $1 AND $2 IN (c.buyer_id, c.seller_id)`,
    [id, userId],
  );
}

export async function messageRoutes(app: FastifyInstance) {
  app.get('/api/poruke', { preHandler: [gate, requireUser] }, async (req) => {
    const me = req.user!.id;
    const rows = await query(
      `SELECT c.id, c.listing_id, coalesce(l.title, c.listing_title, 'Obrisan oglas') AS listing_title, l.price_rsd AS listing_price, coalesce(l.status, 'deleted') AS listing_status,
              (SELECT '/media/oglasi/' || i.file FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position, i.id LIMIT 1) AS listing_image,
              (c.seller_id = $1) AS my_ad,
              coalesce(nullif(o.name, ''), 'Korisnik') AS other,
              (SELECT json_build_object('text', m.body, 'at', m.created_at, 'mine', m.sender_id = $1) FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last,
              (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_id <> $1) AS unread
         FROM conversations c
         LEFT JOIN listings l ON l.id = c.listing_id
         JOIN users o ON o.id = CASE WHEN c.seller_id = $1 THEN c.buyer_id ELSE c.seller_id END
        WHERE $1 IN (c.buyer_id, c.seller_id) AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
        ORDER BY c.last_message_at DESC LIMIT 200`,
      [me],
    );
    return { items: rows };
  });

  app.get<{ Params: { id: string } }>('/api/poruke/:id', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const me = req.user!.id;
    const c = await myConversation(Number(req.params.id) || 0, me);
    if (!c) return reply.code(404).send({ error: 'Razgovor nije pronađen.' });
    // opening the conversation reads what the other side wrote
    await query('UPDATE messages SET read_at = now() WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL', [c.id, me]);
    const messages = await query(
      `SELECT id, (sender_id = $2) AS mine, body AS text, created_at AS at FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 200`,
      [c.id, me],
    );
    return { id: c.id, listing_id: c.listing_id, messages: messages.reverse() };
  });

  /** Reply inside a conversation */
  app.post<{ Params: { id: string } }>('/api/poruke/:id', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const me = req.user!;
    const { text } = body.parse(req.body);
    const c = await myConversation(Number(req.params.id) || 0, me.id);
    if (!c) return reply.code(404).send({ error: 'Razgovor nije pronađen.' });
    if (limits.send.hit(String(me.id))) return reply.code(429).send({ error: 'Šalješ prebrzo. Sačekaj malo.' });
    const m = await sendMessage(c, me.id, me.name, text, (e) => req.log.error(e));
    return { ok: true, id: m?.id };
  });

  /** First message (or another one) from a buyer about an ad */
  app.post<{ Params: { id: string } }>('/api/oglasi/:id/poruke', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const me = req.user!;
    const { text } = body.parse(req.body);
    const l = await one<{ id: number; user_id: number; title: string }>("SELECT id, user_id, title FROM listings WHERE id = $1 AND status = 'active'", [Number(req.params.id) || 0]);
    if (!l) return reply.code(404).send({ error: 'Oglas nije pronađen.' });
    if (l.user_id === me.id) return reply.code(400).send({ error: 'Ovo je tvoj oglas.' });
    if (limits.send.hit(String(me.id))) return reply.code(429).send({ error: 'Šalješ prebrzo. Sačekaj malo.' });
    let c = await one<Conv>('SELECT id, listing_id, buyer_id, seller_id, $3::text AS title FROM conversations WHERE listing_id = $1 AND buyer_id = $2', [l.id, me.id, l.title]);
    if (!c) {
      // a new conversation per ad is limited, so one account can't write to the whole site
      if (limits.newConv.hit(String(me.id))) return reply.code(429).send({ error: 'Danas si započeo dosta razgovora. Pokušaj sutra.' });
      c = await one<Conv>('INSERT INTO conversations (listing_id, buyer_id, seller_id, listing_title) VALUES ($1, $2, $3, $4) RETURNING id, listing_id, buyer_id, seller_id, $4::text AS title', [l.id, me.id, l.user_id, l.title]);
    }
    await sendMessage(c!, me.id, me.name, text, (e) => req.log.error(e));
    return { ok: true, conversation_id: c!.id };
  });

  app.post<{ Params: { id: string } }>('/api/poruke/:id/prijava', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const { reason } = z.object({ reason: z.string().trim().max(500).default('Prijavljen razgovor') }).parse(req.body ?? {});
    const c = await myConversation(Number(req.params.id) || 0, req.user!.id);
    if (!c) return reply.code(404).send({ error: 'Razgovor nije pronađen.' });
    if (limits.report.hit(String(req.user!.id))) return reply.code(429).send({ error: 'Previše prijava danas.' });
    await query('INSERT INTO listing_reports (reporter_id, conversation_id, reason) VALUES ($1, $2, $3)', [req.user!.id, c.id, reason || 'Prijavljen razgovor']);
    return { ok: true };
  });
}
