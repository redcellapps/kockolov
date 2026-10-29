import { config } from '../config.js';
import { one, query } from '../db.js';
import { escapeHtml, rsd, shopLabel } from '../mail/format.js';
import { mailConfigured, sendMail } from '../mail/mailer.js';
import { todayLocal } from '../lib/time.js';
import { dayGenitive, plural, type InstagramCard } from '../seo/og.js';

// Instagram "set dana": every morning one popular set, as a 1080×1350 picture (served at
// /og/ig/<id>.jpg) and a caption. With an Instagram account connected the worker publishes it;
// without one it stays ready on the admin page and the admin gets an e-mail, to post it from the phone.
// Two ways to connect, by the token the admin pastes:
// - Instagram login ("IGAA…"): graph.instagram.com, a long-lived user token with
//   instagram_business_basic + instagram_business_content_publish, renewed here every week;
// - Facebook login ("EAA…"): graph.facebook.com through the Facebook Page the Instagram account is
//   linked to. A long-lived user token (instagram_basic, instagram_content_publish, pages_show_list,
//   pages_read_engagement, business_management) is turned into that Page's token, which doesn't expire.
// Publishing is the same call sequence on both.
//
// Prices in the post come from the public shops only, like everything a visitor sees; the
// members-only shops are only counted ("+ još 4 prodavnice uz nalog").

type Log = (m: string) => void;
const site = () => config.APP_URL.replace(/\/$/, '');

export type PostStatus = 'ready' | 'publishing' | 'published' | 'posted_by_hand' | 'failed' | 'skipped';

export interface InstagramPost {
  id: number;
  day: string;
  set_num: string;
  card: InstagramCard;
  caption: string;
  status: PostStatus;
  media_id: string | null;
  permalink: string | null;
  error: string | null;
  created_at: string;
  published_at: string | null;
}

export interface Candidate {
  set_num: string;
  name: string;
  theme_slug: string | null;
  theme_name: string | null;
  image_url: string | null;
  alt_images: string[];
  rrp_rsd: number | null;
  best_price: number;
  best_shop: string;
  best_seller: string;
  member_shops: number;
  member_best: number | null;
  watchers: number;
  shops: number;
}

/**
 * Today's set: in stock at a public shop and with a picture, not posted in the last
 * INSTAGRAM_REPEAT_DAYS days (nor skipped today). "Popular" = what many shops carry and people watch,
 * a little extra for a real discount against the LEGO Store, and not a theme from the last few posts.
 */
export async function pickSet(day: string): Promise<Candidate | null> {
  return one<Candidate>(
    `WITH pub AS (
       SELECT DISTINCT ON (o.set_num) o.set_num, o.price_rsd, o.shop_id, o.seller
         FROM public_offers o JOIN shops sh ON sh.id = o.shop_id AND sh.enabled
        WHERE o.active AND o.in_stock AND o.set_num IS NOT NULL
        ORDER BY o.set_num, o.price_rsd, o.shop_id
     ), everywhere AS (
       SELECT o.set_num, count(DISTINCT o.shop_id)::int AS shops,
              count(DISTINCT o.shop_id) FILTER (WHERE sh.members_only)::int AS member_shops,
              min(o.price_rsd) FILTER (WHERE sh.members_only) AS member_best
         FROM offers o JOIN shops sh ON sh.id = o.shop_id AND sh.enabled
        WHERE o.active AND o.in_stock AND o.set_num IS NOT NULL
        GROUP BY o.set_num
     ), watch AS (
       SELECT set_num, count(*)::int AS watchers FROM watchlist GROUP BY set_num
     ), last_themes AS (
       SELECT s.theme_slug, row_number() OVER (ORDER BY p.day DESC, p.id DESC) AS n
         FROM instagram_posts p JOIN sets s ON s.set_num = p.set_num
        WHERE p.status <> 'skipped' AND p.day < $1::date
        ORDER BY p.day DESC, p.id DESC LIMIT 3
     )
     SELECT s.set_num, s.name, s.theme_slug, t.name AS theme_name, s.image_url, s.rrp_rsd,
            pub.price_rsd AS best_price, pub.shop_id AS best_shop, pub.seller AS best_seller,
            e.shops, e.member_shops, e.member_best, coalesce(w.watchers, 0) AS watchers,
            array(
              SELECT o.image_url FROM offers o
               WHERE o.set_num = s.set_num AND o.active AND o.image_url IS NOT NULL AND o.image_url IS DISTINCT FROM s.image_url
               GROUP BY o.image_url ORDER BY o.image_url LIMIT 4
            ) AS alt_images
       FROM sets s
       JOIN pub ON pub.set_num = s.set_num
       JOIN everywhere e ON e.set_num = s.set_num
       LEFT JOIN watch w ON w.set_num = s.set_num
       LEFT JOIN themes t ON t.slug = s.theme_slug
      WHERE s.image_url IS NOT NULL
        AND s.set_num ~ '^[0-9]{4,6}$'        -- not single minifigures ("71051-7")
        AND pub.price_rsd >= 1000              -- not key chains and polybags
        AND NOT EXISTS (SELECT 1 FROM instagram_posts p
                         WHERE p.set_num = s.set_num AND p.day > $1::date - $2::int)
      ORDER BY 3 * coalesce(w.watchers, 0) + e.shops
               + CASE WHEN s.rrp_rsd > pub.price_rsd THEN least(30, 100.0 * (s.rrp_rsd - pub.price_rsd) / s.rrp_rsd) / 2 ELSE 0 END
               -- a theme from the last three posts waits its turn (yesterday's the longest)
               - coalesce((SELECT max(CASE WHEN l.n = 1 THEN 12 ELSE 6 END) FROM last_themes l WHERE l.theme_slug = s.theme_slug), 0)
               DESC,
               s.set_num
      LIMIT 1`,
    [day, config.INSTAGRAM_REPEAT_DAYS],
  );
}

export function cardFor(c: Candidate, day: string): InstagramCard {
  return {
    setNum: c.set_num,
    name: c.name,
    theme: c.theme_name,
    imageUrl: c.image_url,
    alternatives: c.alt_images ?? [],
    bestPrice: c.best_price,
    refPrice: c.rrp_rsd,
    shopLabel: shopLabel(c.best_shop, c.best_seller),
    moreShops: c.member_shops,
    day,
  };
}

/** "star-wars" -> "#legostarwars" */
const themeTag = (slug: string | null) => (slug ? `#lego${slug.replace(/[^a-z0-9]/g, '')}` : null);

const OPENERS = ['Set dana na Kockolovu 👇', 'Jutros smo proverili cene 👇', 'Gde je danas najjeftiniji? 👇'];

/** The caption: what the set costs today, where, the saving, and the members-only shops as a reason to sign up */
export function buildCaption(c: Candidate, day: string): string {
  const pct = c.rrp_rsd && c.rrp_rsd > c.best_price ? Math.round((100 * (c.rrp_rsd - c.best_price)) / c.rrp_rsd) : 0;
  const opener =
    pct >= 10
      ? `${pct}% jeftinije nego u LEGO® Store-u 🔥`
      : OPENERS[Number(day.replace(/-/g, '')) % OPENERS.length];
  const title = [c.theme_name ? `LEGO® ${c.theme_name}` : 'LEGO®', c.name].join(' ');
  const lines = [
    opener,
    '',
    `🧱 ${title} (${c.set_num})`,
    `💰 Najniža cena ${dayGenitive(day)}: ${rsd(c.best_price)}, ${shopLabel(c.best_shop, c.best_seller)}`,
  ];
  if (c.rrp_rsd && c.best_shop !== 'lstore' && c.rrp_rsd !== c.best_price) lines.push(`🏷️ U LEGO® Store-u: ${rsd(c.rrp_rsd)}`);
  if (c.member_shops > 0) {
    const where = `${c.member_shops} ${plural(c.member_shops, 'prodavnici', 'prodavnice', 'prodavnica')}`;
    lines.push(
      c.member_best !== null && c.member_best < c.best_price
        ? `🔎 Ima ga i u još ${where}, a negde je i jeftiniji. Te cene vidiš uz besplatan nalog.`
        : `🔎 Ima ga i u još ${where}. Njihove cene vidiš uz besplatan nalog.`,
    );
  }
  lines.push('', `Sve cene i istorija cene: kockolov.rs/set/${c.set_num} (link u bio-u)`, '');
  const tags = ['#lego', '#legosrbija', themeTag(c.theme_slug), `#lego${c.set_num}`, '#legoakcija', '#kockolov'];
  lines.push([...new Set(tags.filter(Boolean))].join(' '));
  return lines.join('\n');
}

export const imageUrlFor = (p: Pick<InstagramPost, 'id'>) => `${site()}/og/ig/${p.id}.jpg`;

/** A post's columns, the day as YYYY-MM-DD */
const COLS = `id, to_char(day, 'YYYY-MM-DD') AS day, set_num, card, caption, status, media_id, permalink, error, created_at, published_at`;

/** Today's post (not the skipped ones), if there is one */
export function todaysPost(day = todayLocal()): Promise<InstagramPost | null> {
  return one<InstagramPost>(
    `SELECT ${COLS} FROM instagram_posts p WHERE p.day = $1::date AND status <> 'skipped' ORDER BY id DESC LIMIT 1`,
    [day],
  );
}

export function getPost(id: number): Promise<InstagramPost | null> {
  return one<InstagramPost>(`SELECT ${COLS} FROM instagram_posts WHERE id = $1`, [id]);
}

export function recentPosts(limit = 14): Promise<InstagramPost[]> {
  return query<InstagramPost>(
    `SELECT ${COLS} FROM instagram_posts p ORDER BY p.day DESC, p.id DESC LIMIT $1`,
    [limit],
  );
}

/** One post on the page behind the link in the bio (/ig): what was posted, and the set's price today */
export interface FeedItem {
  id: number;
  day: string;
  set_num: string;
  name: string;
  theme_name: string | null;
  card: InstagramCard;
  permalink: string | null;
  /** today's best price at the public shops; null = not in stock anywhere now */
  best_price: number | null;
  best_shop: string | null;
  best_seller: string | null;
}

/**
 * The posts that went out (published by the worker or posted by hand), newest first. Instagram doesn't
 * let anyone change the link in the bio through its API, so the bio keeps one link (kockolov.rs/ig) and
 * this list is what changes behind it.
 */
export function postedFeed(limit = 24): Promise<FeedItem[]> {
  return query<FeedItem>(
    `SELECT p.id, to_char(p.day, 'YYYY-MM-DD') AS day, p.set_num, s.name, t.name AS theme_name, p.card, p.permalink,
            b.price_rsd AS best_price, b.shop_id AS best_shop, b.seller AS best_seller
       FROM instagram_posts p
       JOIN sets s ON s.set_num = p.set_num
       LEFT JOIN themes t ON t.slug = s.theme_slug
       LEFT JOIN LATERAL (
         SELECT price_rsd, shop_id, seller FROM public_offers o
          WHERE o.set_num = p.set_num AND o.active AND o.in_stock ORDER BY price_rsd LIMIT 1
       ) b ON true
      WHERE p.status IN ('published', 'posted_by_hand')
      ORDER BY p.day DESC, p.id DESC
      LIMIT $1`,
    [limit],
  );
}

/** Makes today's post unless there is one already. null = no set qualifies (nothing in stock?). */
export async function preparePost(day = todayLocal()): Promise<InstagramPost | null> {
  const existing = await todaysPost(day);
  if (existing) return existing;
  const c = await pickSet(day);
  if (!c) return null;
  return one<InstagramPost>(
    `INSERT INTO instagram_posts (day, set_num, card, caption) VALUES ($1::date, $2, $3, $4)
     RETURNING ${COLS}`,
    [day, c.set_num, JSON.stringify(cardFor(c, day)), buildCaption(c, day)],
  );
}

/** Another set for the same day: this one is set aside (and not offered again for a while). */
export async function skipPost(id: number): Promise<InstagramPost | null> {
  const p = await one<{ day: string }>(
    `UPDATE instagram_posts SET status = 'skipped' WHERE id = $1 AND status IN ('ready', 'failed')
     RETURNING to_char(day, 'YYYY-MM-DD') AS day`,
    [id],
  );
  if (!p) throw new PostStateError();
  return preparePost(p.day);
}

/** Posted from the phone: the admin page and tomorrow's pick know it went out. */
export async function markPostedByHand(id: number): Promise<void> {
  const r = await one(
    `UPDATE instagram_posts SET status = 'posted_by_hand', published_at = now(), error = NULL
      WHERE id = $1 AND status IN ('ready', 'failed') RETURNING id`,
    [id],
  );
  if (!r) throw new PostStateError();
}

export class PostStateError extends Error {
  constructor() {
    super('post is not waiting');
  }
}

// ---- the Instagram account and API ----

export type ApiKind = 'instagram' | 'facebook';

export interface InstagramAccount {
  token: string;
  user_id: string;
  username: string;
  refreshed_at: string;
  paused: boolean;
  api: ApiKind;
  page_name: string;
}

const ACCOUNT_COLS = 'token, user_id, username, refreshed_at, paused, api, page_name';
export const getAccount = () => one<InstagramAccount>(`SELECT ${ACCOUNT_COLS} FROM instagram_account WHERE id = 1`);

export class InstagramError extends Error {}

async function graph<T>(
  method: 'GET' | 'POST',
  pathAndQuery: string,
  token: string,
  form?: Record<string, string>,
  versioned = true,
  api: ApiKind = 'instagram',
): Promise<T> {
  const base = (api === 'facebook' ? config.FACEBOOK_GRAPH_URL : config.INSTAGRAM_GRAPH_URL).replace(/\/$/, '');
  const url = new URL(`${base}/${versioned ? `${config.INSTAGRAM_API_VERSION}/` : ''}${pathAndQuery}`);
  let body: URLSearchParams | undefined;
  if (method === 'GET') url.searchParams.set('access_token', token);
  else body = new URLSearchParams({ ...form, access_token: token });
  const res = await fetch(url, { method, body, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let data: { error?: { message?: string; error_user_msg?: string } } & Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok || data.error) {
    const msg = data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}`;
    throw new InstagramError(msg);
  }
  return data as T;
}

/** A Facebook token (Facebook login) rather than an Instagram one */
export const isFacebookToken = (token: string) => /^EAA/.test(token.trim());

interface PageWithIg {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
}

/**
 * Facebook login: from a user token, the Page (and its token) whose Instagram account we publish to;
 * a Page token is taken as it is. A Page token got with a long-lived user token doesn't expire.
 */
async function facebookAccount(token: string): Promise<{ token: string; user_id: string; username: string; page_name: string }> {
  const fields = 'id,name,access_token,instagram_business_account{id,username}';
  let pages: PageWithIg[];
  try {
    pages = (await graph<{ data?: PageWithIg[] }>('GET', `me/accounts?fields=${fields}&limit=100`, token, undefined, true, 'facebook')).data ?? [];
  } catch (err) {
    // a Page token has no "accounts": it is the Page itself
    const page = await graph<PageWithIg>('GET', 'me?fields=id,name,instagram_business_account{id,username}', token, undefined, true, 'facebook').catch(() => {
      throw err;
    });
    pages = [{ ...page, access_token: token }];
  }
  const page = pages.find((p) => p.instagram_business_account?.id && p.access_token);
  if (!page) {
    throw new InstagramError(
      pages.length
        ? 'Nijedna tvoja Facebook stranica nije povezana sa Instagram profesionalnim nalogom (stranica → Podešavanja → Linked accounts → Instagram).'
        : 'Token ne vidi nijednu Facebook stranicu: pri pravljenju tokena izaberi stranicu Kockolov i dozvole pages_show_list i business_management.',
    );
  }
  return {
    token: page.access_token!,
    user_id: page.instagram_business_account!.id,
    username: page.instagram_business_account!.username ?? '',
    page_name: page.name ?? '',
  };
}

/** Checks the token with Instagram (or Facebook) and keeps what publishing needs (the admin pastes it once). */
export async function connectAccount(token: string): Promise<InstagramAccount> {
  const t = token.trim();
  let acc: { token: string; user_id: string; username: string; page_name: string; api: ApiKind };
  if (isFacebookToken(t)) {
    acc = { ...(await facebookAccount(t)), api: 'facebook' };
  } else {
    const me = await graph<{ user_id?: string; id?: string; username?: string }>('GET', 'me?fields=user_id,username', t);
    const userId = String(me.user_id ?? me.id ?? '');
    if (!userId) throw new InstagramError('Instagram nije vratio ID naloga.');
    acc = { token: t, user_id: userId, username: me.username ?? '', page_name: '', api: 'instagram' };
  }
  return (await one<InstagramAccount>(
    `INSERT INTO instagram_account (id, token, user_id, username, refreshed_at, paused, updated_at, api, page_name)
     VALUES (1, $1, $2, $3, now(), false, now(), $4, $5)
     ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token, user_id = EXCLUDED.user_id, username = EXCLUDED.username,
       refreshed_at = now(), updated_at = now(), api = EXCLUDED.api, page_name = EXCLUDED.page_name
     RETURNING ${ACCOUNT_COLS}`,
    [acc.token, acc.user_id, acc.username, acc.api, acc.page_name],
  ))!;
}

export async function disconnectAccount(): Promise<void> {
  await query('DELETE FROM instagram_account');
}

export async function setPaused(paused: boolean): Promise<void> {
  await query('UPDATE instagram_account SET paused = $1, updated_at = now() WHERE id = 1', [paused]);
}

/**
 * An Instagram-login token lasts 60 days; renewing it every week keeps it alive while the worker runs.
 * (A Facebook Page token doesn't expire and isn't renewed.)
 */
export async function refreshTokenIfDue(log: Log = () => {}): Promise<void> {
  const acc = await one<InstagramAccount & { due: boolean }>(
    "SELECT token, refreshed_at < now() - interval '7 days' AS due FROM instagram_account WHERE id = 1 AND api = 'instagram'",
  );
  if (!acc?.due) return;
  try {
    const r = await graph<{ access_token?: string }>('GET', 'refresh_access_token?grant_type=ig_refresh_token', acc.token, undefined, false);
    if (!r.access_token) throw new InstagramError('bez novog tokena');
    await query('UPDATE instagram_account SET token = $1, refreshed_at = now(), updated_at = now() WHERE id = 1', [r.access_token]);
    log('instagram: token obnovljen');
  } catch (err) {
    log(`instagram: token nije obnovljen: ${(err as Error).message}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Publishes the post: Instagram fetches the picture from our URL into a container, we wait until
 * the container is FINISHED (asking at most 6 times), then publish it.
 */
export async function publishPost(id: number, log: Log = () => {}): Promise<InstagramPost> {
  const acc = await getAccount();
  if (!acc) throw new InstagramError('Instagram nalog nije povezan.');
  const p = await one<InstagramPost>(
    `UPDATE instagram_posts SET status = 'publishing', error = NULL
      WHERE id = $1 AND status IN ('ready', 'failed') RETURNING ${COLS}`,
    [id],
  );
  if (!p) throw new PostStateError();
  try {
    const call = <T,>(method: 'GET' | 'POST', path: string, form?: Record<string, string>) =>
      graph<T>(method, path, acc.token, form, true, acc.api);
    const container = await call<{ id: string }>('POST', `${acc.user_id}/media`, { image_url: imageUrlFor(p), caption: p.caption });
    let status = 'IN_PROGRESS';
    for (let i = 0; i < 6 && status !== 'FINISHED'; i++) {
      if (i) await sleep(config.INSTAGRAM_POLL_MS);
      status = (await call<{ status_code?: string }>('GET', `${container.id}?fields=status_code`)).status_code ?? 'IN_PROGRESS';
      if (status === 'ERROR' || status === 'EXPIRED') throw new InstagramError(`Instagram nije prihvatio sliku (${status}).`);
    }
    if (status !== 'FINISHED') throw new InstagramError('Instagram nije stigao da obradi sliku; probaj ponovo.');
    const media = await call<{ id: string }>('POST', `${acc.user_id}/media_publish`, { creation_id: container.id });
    const link = await call<{ permalink?: string }>('GET', `${media.id}?fields=permalink`).catch(() => ({ permalink: undefined }));
    log(`instagram: objavljen set ${p.set_num} (${media.id})`);
    return (await one<InstagramPost>(
      `UPDATE instagram_posts SET status = 'published', media_id = $2, permalink = $3, published_at = now()
        WHERE id = $1 RETURNING ${COLS}`,
      [id, media.id, link.permalink ?? null],
    ))!;
  } catch (err) {
    const msg = (err as Error).message;
    await query("UPDATE instagram_posts SET status = 'failed', error = $2 WHERE id = $1", [id, msg.slice(0, 500)]);
    log(`instagram: objava nije uspela: ${msg}`);
    throw err;
  }
}

/** E-mail to the admin: the post is ready to post by hand, or publishing failed. */
async function tellAdmin(p: InstagramPost, problem: string | null, log: Log): Promise<void> {
  if (!config.ADMIN_ALERT_EMAIL || !mailConfigured()) return;
  const subject = problem
    ? `Kockolov: Instagram objava nije uspela (${p.set_num})`
    : `Kockolov: Instagram objava za danas je spremna (${p.set_num})`;
  const intro = problem
    ? `Objava seta ${p.set_num} na Instagramu nije uspela: ${problem}`
    : 'Slika i tekst za današnju objavu su spremni. Sačuvaj sliku, kopiraj tekst i objavi sa telefona.';
  try {
    await sendMail({
      to: config.ADMIN_ALERT_EMAIL,
      subject,
      text: `${intro}\n\nSlika: ${imageUrlFor(p)}\n\n${p.caption}\n\nAdministracija: ${site()}/admin#instagram`,
      html: `<p>${escapeHtml(intro)}</p>
        <p><a href="${escapeHtml(imageUrlFor(p))}"><img src="${escapeHtml(imageUrlFor(p))}" width="360" alt="" style="border-radius:12px"></a></p>
        <pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:14px;background:#f6f4ee;padding:12px;border-radius:12px">${escapeHtml(p.caption)}</pre>
        <p><a href="${site()}/admin#instagram">Otvori administraciju</a></p>`,
    });
  } catch (err) {
    log(`instagram: mejl nije poslat: ${(err as Error).message}`);
  }
}

/** The morning job: prepare today's post, then publish it (or tell the admin it waits). */
export async function instagramJob(log: Log = () => {}): Promise<InstagramPost | null> {
  await refreshTokenIfDue(log);
  const post = await preparePost();
  if (!post) {
    log('instagram: nijedan set ne ispunjava uslove za objavu');
    return null;
  }
  if (post.status !== 'ready') return post; // already handled today
  const acc = await getAccount();
  if (!acc || acc.paused) {
    await tellAdmin(post, null, log);
    return post;
  }
  try {
    return await publishPost(post.id, log);
  } catch (err) {
    await tellAdmin(post, (err as Error).message, log);
    return getPost(post.id);
  }
}
