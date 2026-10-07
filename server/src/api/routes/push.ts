import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../../db.js';
import { sendPushToUser, vapidKeys } from '../../push/push.js';
import { requireUser } from './me.js';

/** Most devices one account keeps notifications on; the oldest goes when a new one is added */
const MAX_DEVICES = 10;

const subscription = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .refine((u) => u.startsWith('https://'), 'endpoint'),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Push notifications: the server's public key, and this account's devices */
export async function pushRoutes(app: FastifyInstance) {
  app.get('/api/push/key', async () => ({ key: (await vapidKeys()).publicKey }));

  app.get('/api/me/push', { preHandler: requireUser }, async (req) => {
    const r = await one<{ n: number }>('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [req.user!.id]);
    return { devices: r?.n ?? 0 };
  });

  // add this device (or move it to the account signed in now)
  app.post('/api/me/push', { preHandler: requireUser }, async (req, reply) => {
    const body = z.object({ subscription, replaces: z.string().max(1000).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Neispravna prijava za obaveštenja.' });
    const { endpoint, keys } = body.data.subscription;
    const userId = req.user!.id;
    if (body.data.replaces && body.data.replaces !== endpoint) {
      await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, body.data.replaces]);
    }
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
             user_agent = EXCLUDED.user_agent, failures = 0`,
      [userId, endpoint, keys.p256dh, keys.auth, (req.headers['user-agent'] ?? '').slice(0, 300) || null],
    );
    await query(
      `DELETE FROM push_subscriptions WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT ${MAX_DEVICES})`,
      [userId],
    );
    return { ok: true };
  });

  app.delete('/api/me/push', { preHandler: requireUser }, async (req, reply) => {
    const body = z.object({ endpoint: z.string().max(1000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Neispravan zahtev.' });
    await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user!.id, body.data.endpoint]);
    return { ok: true };
  });

  // a sample notification, to see that it works (this device only, or all of the account's)
  app.post('/api/me/push/test', { preHandler: requireUser }, async (req) => {
    const body = z.object({ endpoint: z.string().max(1000).optional() }).parse(req.body ?? {});
    const r = await sendPushToUser(
      req.user!.id,
      {
        title: 'Kockolov: obaveštenja rade',
        body: 'Ovako ćeš saznati kad set koji pratiš pojeftini ili se vrati na stanje.',
        url: '/pracenje',
        tag: 'test',
      },
      body.endpoint,
    );
    return { ok: r.sent > 0, ...r };
  });
}
