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

  // add this device (or move it to the account signed in now): a browser's subscription, or the app's Firebase token
  app.post('/api/me/push', { preHandler: requireUser }, async (req, reply) => {
    const body = z
      .union([
        z.object({ subscription, replaces: z.string().max(1000).optional() }),
        z.object({ fcm: z.object({ token: z.string().min(20).max(4096), platform: z.enum(['android', 'ios']) }), replaces: z.string().max(4096).optional() }),
      ])
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Neispravna prijava za obaveštenja.' });
    const d = body.data;
    const row =
      'fcm' in d
        ? { kind: 'fcm', endpoint: d.fcm.token, p256dh: null, auth: null, platform: d.fcm.platform }
        : { kind: 'web', endpoint: d.subscription.endpoint, p256dh: d.subscription.keys.p256dh, auth: d.subscription.keys.auth, platform: null };
    const userId = req.user!.id;
    if (d.replaces && d.replaces !== row.endpoint) {
      await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, d.replaces]);
    }
    await query(
      `INSERT INTO push_subscriptions (user_id, kind, endpoint, p256dh, auth, platform, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, kind = EXCLUDED.kind, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
             platform = EXCLUDED.platform, user_agent = EXCLUDED.user_agent, failures = 0`,
      [userId, row.kind, row.endpoint, row.p256dh, row.auth, row.platform, (req.headers['user-agent'] ?? '').slice(0, 300) || null],
    );
    await query(
      `DELETE FROM push_subscriptions WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT ${MAX_DEVICES})`,
      [userId],
    );
    return { ok: true };
  });

  app.delete('/api/me/push', { preHandler: requireUser }, async (req, reply) => {
    const body = z.object({ endpoint: z.string().max(4096) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Neispravan zahtev.' });
    await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user!.id, body.data.endpoint]);
    return { ok: true };
  });

  // a sample notification, to see that it works (this device only, or all of the account's)
  app.post('/api/me/push/test', { preHandler: requireUser }, async (req) => {
    const body = z.object({ endpoint: z.string().max(4096).optional() }).parse(req.body ?? {});
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
