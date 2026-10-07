// Answers the app's /api calls inside the browser for the preview build, from snapshot.json
// (exported by server/scripts/export-demo.ts). Nothing is sent anywhere; changes live in memory.
import raw from './snapshot.json';
import { DemoCatalog, type DemoDeal, type DemoOffer, type DemoSet, type SearchFilters } from './search';

type Json = Record<string, any>;

/** Swap the demo's /demo-img/<set>.svg paths for the embedded pictures. */
function withImages<T>(value: T, images: Record<string, string>): T {
  if (typeof value === 'string') {
    const m = value.match(/^\/demo-img\/(.+)\.svg$/);
    return (m && images[m[1]] ? images[m[1]] : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => withImages(v, images)) as T;
  if (value && typeof value === 'object') {
    const out: Json = {};
    for (const [k, v] of Object.entries(value)) out[k] = withImages(v, images);
    return out as T;
  }
  return value;
}

const { images, ...rest } = raw as unknown as Json & { images: Record<string, string> };
const snap = withImages(rest, images) as Json;

export const DEMO_EMAIL = snap.user?.email ?? 'demo@kockolov.local';
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_DATE = snap.stats?.members?.last_update as string | undefined;

// Like the live site: visitors see the public shops, signed-in users every shop.
type Audience = 'public' | 'members';
const membersShops = new Set<string>(snap.membersShops ?? []);
const allOffers = snap.offers as DemoOffer[];
const catalogs: Record<Audience, DemoCatalog> = {
  public: new DemoCatalog(snap.sets as DemoSet[], allOffers.filter((o) => !membersShops.has(o.shop_id)), snap.latestDeals.public as DemoDeal[]),
  members: new DemoCatalog(snap.sets as DemoSet[], allOffers, snap.latestDeals.members as DemoDeal[]),
};
const state = {
  // the preview starts as a visitor; signing in shows the members-only shops
  user: null as Json | null,
  // a few sets already watched, so the watchlist page shows what it does
  watchlist: new Set<string>((snap.deals.members.items as Json[]).slice(0, 3).map((d) => d.set_num as string)),
  users: (snap.admin.users as Json[]).map((u): Json => ({ accepted_at: u.last_login_at ?? u.created_at, invited_at: null, ...u })),
  // every offer as the admin sees it (linked ones from the set pages, plus the unmatched ones);
  // orig_* is how the crawler linked it, for "back to automatic" and "restore"
  rows: adminRows(),
  rules: [] as Json[],
};

function adminRows(): Json[] {
  const sets = new Map((snap.sets as DemoSet[]).map((s) => [s.set_num, s]));
  const rows: Json[] = [];
  for (const [setNum, d] of Object.entries(snap.details as Record<string, Json>)) {
    for (const o of d.members.offers as Json[]) {
      rows.push({
        id: o.id, shop_id: o.shop_id, seller: o.seller, title: o.title, url: o.url, image_url: o.image_url,
        price_rsd: o.price_rsd, in_stock: o.in_stock, set_num: setNum, match_method: o.match_method,
        orig_set: setNum, orig_method: o.match_method, manual_at: null, manual_by: null, set: sets.get(setNum),
      });
    }
  }
  for (const o of snap.admin.unmatched as Json[]) {
    rows.push({ ...o, image_url: null, set_num: null, match_method: o.match_method ?? null, orig_set: null, orig_method: o.match_method ?? null, manual_at: null, manual_by: null });
  }
  return rows;
}
const setByNum = new Map((snap.sets as DemoSet[]).map((s) => [s.set_num, s]));
const HIDDEN = ['hidden', 'hidden_rule'];
const isOpenRow = (o: Json) => !o.set_num && o.match_method !== 'merch' && !HIDDEN.includes(o.match_method);
const openRows = () => state.rows.filter(isOpenRow);
const hiddenRows = () => state.rows.filter((o) => HIDDEN.includes(o.match_method));
/** back to how the crawler linked it (unless a rule hides it) */
function relink(o: Json) {
  const ruled = state.rules.some((r) => (!r.shop_id || o.shop_id === r.shop_id) && ` ${normWords(String(o.title))} `.includes(` ${r.phrase}`));
  Object.assign(o, ruled ? { set_num: null, match_method: 'hidden_rule' } : { set_num: o.orig_set, match_method: o.orig_method });
  Object.assign(o, { manual_at: null, manual_by: null, set: o.set_num ? setByNum.get(o.set_num) : undefined });
}
function doubts(o: Json): Json[] {
  if (!o.set_num) return [];
  const title = ` ${normWords(String(o.title))} `;
  if (title.includes(` ${normWords(o.set_num)} `)) return [];
  const other = (String(o.title).match(/(?<![\d.,])\d{4,6}(?!\d)/g) ?? []).find((n) => n !== o.set_num && setByNum.has(n));
  return other ? [{ kind: 'number', num: other }] : [];
}
const FILTERS: Record<string, (o: Json) => boolean> = {
  all: () => true,
  linked: (o) => !!o.set_num,
  manual: (o) => o.match_method === 'manual',
  check: (o) => doubts(o).length > 0,
  open: isOpenRow,
  merch: (o) => o.match_method === 'merch',
  hidden: (o) => HIDDEN.includes(o.match_method),
};
const coll = new Intl.Collator('sr', { numeric: true, sensitivity: 'base' });
const SORTS: Record<string, (a: Json, b: Json) => number> = {
  title: (a, b) => coll.compare(a.title, b.title),
  shop: (a, b) => coll.compare(a.shop_id, b.shop_id) || coll.compare(a.title, b.title),
  price: (a, b) => a.price_rsd - b.price_rsd,
  set: (a, b) => (!a.set_num ? 1 : 0) - (!b.set_num ? 1 : 0) || coll.compare(a.set_num ?? '', b.set_num ?? ''),
  linked: (a, b) => (b.manual_at ? Date.parse(b.manual_at) : 0) - (a.manual_at ? Date.parse(a.manual_at) : 0) || coll.compare(a.title, b.title),
};
function adminOffers(p: URLSearchParams) {
  const shop = p.get('shop');
  const found = state.rows.filter(
    (o) => (!shop || o.shop_id === shop) && hasWords(`${o.title} ${o.seller} ${o.set_num ?? ''} ${o.set?.name ?? ''}`, p.get('q') ?? ''),
  );
  const counts = Object.fromEntries(Object.entries(FILTERS).map(([k, f]) => [k, found.filter(f).length]));
  const filter = FILTERS[p.get('filter') ?? ''] ? p.get('filter')! : 'all';
  const sort = SORTS[p.get('sort') ?? ''] ? p.get('sort')! : filter === 'manual' ? 'linked' : 'title';
  const items = found.filter(FILTERS[filter]).sort(SORTS[sort]);
  if (p.get('dir') === 'desc') items.reverse();
  const size = 50;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(Math.max(Number(p.get('page')) || 1, 1), pages);
  return {
    total: items.length, page, pages, size, sort, counts,
    items: items.slice((page - 1) * size, page * size).map(({ set, orig_set: _s, orig_method: _m, ...o }) => ({
      ...o, set_name: set?.name ?? null, set_image: set?.image_url ?? null, doubts: doubts(o),
    })),
  };
}

const ok = (body: unknown, status = 200) => ({ status, body });
const err = (status: number, error: string) => ({ status, body: { error } });

function filtersFrom(p: URLSearchParams): SearchFilters {
  const list = (k: string) => (p.get(k) ? p.get(k)!.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
  const num = (k: string) => (p.get(k) && /^\d+$/.test(p.get(k)!) ? Number(p.get(k)) : undefined);
  const flag = (k: string) => (p.get(k) === null ? undefined : p.get(k) === '1' || p.get(k) === 'true');
  return {
    q: p.get('q') ?? undefined,
    themes: list('theme'),
    shops: list('shop'),
    ages: list('age'),
    min: num('min'),
    max: num('max'),
    sale: flag('sale'),
    stock: flag('stock') ?? true,
    sort: p.get('sort') ?? undefined,
    page: num('page'),
    size: num('size'),
  };
}

/** lowercase, no diacritics or punctuation (like the server's normalizeText) */
const normWords = (s: string) =>
  s.toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const hasWords = (title: string, q: string) => {
  const n = ` ${normWords(title)} `;
  return normWords(q).split(' ').filter(Boolean).every((w) => n.includes(` ${w}`));
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Simplified copy of the server's news e-mail (server/src/mail/announce.ts), for the preview only */
function newsPreview(subject: string, body: string, name: string): string {
  const inline = (l: string) =>
    esc(l)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#1d5fd1">$1</a>');
  const blocks: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(`<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#333">${para.map(inline).join('<br>')}</p>`);
    if (list.length) blocks.push(`<ul style="padding-left:22px;font-size:15px;line-height:1.5;color:#333">${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`);
    para = [];
    list = [];
  };
  for (const line of (body.trim() || 'Ovde će biti tekst obaveštenja.').split('\n')) {
    if (!line.trim()) flush();
    else if (/^#{1,3}[ \t]+/.test(line)) {
      flush();
      blocks.push(`<div style="margin:18px 0 8px;font-size:17px;font-weight:800">${inline(line.replace(/^#{1,3}[ \t]+/, ''))}</div>`);
    } else if (/^[ \t]*[-*•][ \t]+/.test(line)) {
      if (para.length) flush();
      list.push(line.replace(/^[ \t]*[-*•][ \t]+/, ''));
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return `<!doctype html><html lang="sr"><body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a"><div style="padding:24px 12px"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">
<div style="background:#ffcf00;padding:20px 24px"><div style="font-size:22px;font-weight:800">Kockolov</div><div style="font-size:13px;color:#3a3a3a">Novosti na sajtu</div></div>
<div style="padding:24px 24px 4px"><div style="font-size:20px;font-weight:800">${esc(subject.trim() || 'Naslov obaveštenja')}</div><p style="margin:14px 0;font-size:15px;color:#333">${name ? `Ćao ${esc(name)},` : 'Ćao,'}</p>${blocks.join('')}</div>
<div style="padding:8px 24px 24px"><span style="display:inline-block;background:#1a1a1a;color:#ffcf00;font-weight:800;font-size:15px;padding:13px 20px;border-radius:12px">Otvori Kockolov</span></div>
<div style="padding:0 24px 24px;font-size:12px;color:#8a8a8a">Ovo je povremeno obaveštenje o novostima na Kockolovu. Ne želiš ih više? Odjavi se od novosti; jutarnji pregled ponuda ostaje kakav jeste.</div></div></div></body></html>`;
}

function handle(method: string, url: URL, body: Json | null): { status: number; body: unknown } {
  const path = url.pathname;
  const p = url.searchParams;

  if (path === '/api/health') return ok({ ok: true });
  if (path === '/api/auth/me' && method === 'GET')
    return ok({ user: state.user, publicMode: true, registrationOpen: false, fx: { eur: { rate: 117.2, day: null } } });
  if (path === '/api/auth/login' && method === 'POST') {
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || !body?.password) return err(400, 'Unesite ispravan e-mail i lozinku.');
    if (email !== DEMO_EMAIL || body.password !== DEMO_PASSWORD) return err(401, 'Pogrešan e-mail ili lozinka.');
    state.user = { ...snap.user };
    return ok({ ok: true });
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    state.user = null;
    return ok({ ok: true });
  }
  if (path === '/api/auth/register') return err(403, 'Registracija trenutno nije otvorena.');
  // no mail in the preview; pretend the link went out
  if ((path === '/api/auth/forgot' || path === '/api/auth/resend') && method === 'POST') return ok({ ok: true });

  // public mode: visitors may browse
  const audience: Audience = state.user ? 'members' : 'public';
  const catalog = catalogs[audience];
  if (path === '/api/stats') return ok(snap.stats[audience]);
  if (path === '/api/shops') return ok(snap.shops[audience]);
  if (path === '/api/themes') return ok(snap.themes[audience]);
  if (path === '/api/deals') {
    const limit = Math.min(Number(p.get('limit') ?? 40) || 40, 40);
    return ok({ day: snap.deals[audience].day, items: (snap.deals[audience].items as Json[]).slice(0, limit) });
  }
  if (path === '/api/sets') {
    const f = filtersFrom(p);
    return ok({ ...catalog.search(f), facets: catalog.facets(f) });
  }
  const setMatch = path.match(/^\/api\/sets\/([^/]+)$/);
  if (setMatch) {
    const num = decodeURIComponent(setMatch[1]);
    const d = (snap.details[num] as Json | undefined)?.[audience] as Json | undefined;
    if (!d) return err(404, 'Set nije pronađen');
    const related = d.set.theme_slug
      ? catalog
          .search({ themes: [d.set.theme_slug], stock: true, sort: 'deal', size: 9 })
          .items.filter((r) => r.set_num !== num)
          .slice(0, 8)
      : [];
    return ok({ ...d, related, watched: !!state.user && state.watchlist.has(num) });
  }

  // everything else needs a session
  if (!state.user) return err(401, 'Potrebna je prijava.');

  if (path === '/api/me' && method === 'PATCH') {
    if (typeof body?.name === 'string') state.user!.name = body.name;
    if (typeof body?.digestEnabled === 'boolean') state.user!.digest_enabled = body.digestEnabled;
    if (typeof body?.newsEnabled === 'boolean') state.user!.news_enabled = body.newsEnabled;
    if (body?.currency === 'RSD' || body?.currency === 'EUR') state.user!.currency = body.currency;
    return ok({ ok: true });
  }
  if (path === '/api/me/password' && method === 'POST') {
    if (String(body?.next ?? '').length < 8) return err(400, 'Nova lozinka mora imati bar 8 karaktera.');
    if (body?.current !== DEMO_PASSWORD) return err(400, 'Trenutna lozinka nije ispravna.');
    return ok({ ok: true });
  }
  // the preview has no service worker, so no notifications either
  if (path === '/api/me/push' && method === 'GET') return ok({ devices: 0 });
  if (path === '/api/me/watchlist' && method === 'GET') {
    const nums = [...state.watchlist];
    if (!nums.length) return ok({ items: [] });
    return ok({ items: catalog.search({ setNums: nums, stock: false, sort: 'price_asc', size: 96 }).items });
  }
  const watchMatch = path.match(/^\/api\/me\/watchlist\/([^/]+)$/);
  if (watchMatch) {
    const num = decodeURIComponent(watchMatch[1]);
    if (method === 'PUT') {
      if (!catalog.has(num)) return err(404, 'Set nije pronađen');
      state.watchlist.add(num);
      return ok({ ok: true, watched: true });
    }
    if (method === 'DELETE') {
      state.watchlist.delete(num);
      return ok({ ok: true, watched: false });
    }
  }

  // blog posts, exported with the snapshot
  if (path === '/api/blog') return ok({ items: snap.blog?.items ?? [] });
  const blogPost = path.match(/^\/api\/blog\/([a-z0-9-]+)$/);
  if (blogPost) {
    const post = snap.blog?.posts?.[blogPost[1]];
    return post ? ok(post) : err(404, 'Tekst nije pronađen.');
  }

  if (path.startsWith('/api/admin/')) {
    if (state.user!.role !== 'admin') return err(403, 'Samo za administratore.');
    if (path === '/api/admin/overview') {
      const ov = snap.admin.overview as Json;
      const shops = (ov.shops as Json[]).map((sh) => ({
        ...sh,
        unmatched: openRows().filter((o) => o.shop_id === sh.id).length,
        hidden: hiddenRows().filter((o) => o.shop_id === sh.id).length,
      }));
      return ok({ ...ov, shops, users: state.users.length });
    }
    // unmatched offers: search, hide one by one or by a phrase rule (kept while the page is open)
    if (path === '/api/admin/unmatched') {
      const shop = p.get('shop');
      const items = openRows().filter((o) => (!shop || o.shop_id === shop) && hasWords(String(o.title), p.get('q') ?? ''));
      return ok({ total: items.length, items: items.slice(0, 300) });
    }
    if (path === '/api/admin/hidden') {
      const items = hiddenRows().map(({ set: _s, ...o }) => o);
      return ok({ rules: state.rules, total: items.length, items });
    }
    if (path === '/api/admin/offers/hide' && method === 'POST') {
      const ids = new Set((body?.ids as number[]) ?? []);
      const moved = state.rows.filter((o) => ids.has(o.id as number));
      moved.forEach((o) => Object.assign(o, { set_num: null, set: undefined, match_method: 'hidden', manual_at: null, manual_by: null }));
      return ok({ ok: true, hidden: moved.length });
    }
    const restore = path.match(/^\/api\/admin\/offers\/(\d+)\/restore$/);
    if (restore && method === 'POST') {
      const o = state.rows.find((x) => x.id === Number(restore[1]));
      if (o?.match_method === 'hidden_rule') return err(409, 'Ovu ponudu sakriva pravilo; obriši pravilo da je vratiš.');
      if (o?.match_method === 'hidden') relink(o);
      return ok({ ok: true });
    }
    // every offer with its set: search, fix a wrong number, back to automatic
    if (path === '/api/admin/offers') return ok(adminOffers(p));
    const lookup = path.match(/^\/api\/admin\/sets\/(.+)$/);
    if (lookup) {
      const s = setByNum.get(decodeURIComponent(lookup[1]));
      if (!s) return { status: 404, body: { error: `Set ${decodeURIComponent(lookup[1])} nije u katalogu.`, code: 'unknown_set' } };
      const offers = state.rows.filter((o) => o.set_num === s.set_num).length;
      return ok({ set_num: s.set_num, name: s.name, image_url: s.image_url, theme_name: s.theme_name, rrp_rsd: s.rrp_rsd, offers });
    }
    const auto = path.match(/^\/api\/admin\/offers\/(\d+)\/auto$/);
    if (auto && method === 'POST') {
      const o = state.rows.find((x) => x.id === Number(auto[1]));
      if (!o) return err(404, 'Ponuda nije pronađena');
      const previous = o.set_num;
      relink(o);
      return ok({ ok: true, previous, setNum: o.set_num, method: o.match_method, dropped: [] });
    }
    if (path === '/api/admin/hide-rules' && method === 'POST') {
      const phrase = normWords(String(body?.phrase ?? ''));
      if (phrase.length < 3) return err(400, 'Pravilo mora imati bar 3 slova.');
      const rule = { id: state.rules.length + 1, phrase, shop_id: (body?.shopId as string) || null };
      state.rules.push(rule);
      const hits = state.rows.filter(
        (o) =>
          !['manual', ...HIDDEN].includes(o.match_method) &&
          (!rule.shop_id || o.shop_id === rule.shop_id) &&
          ` ${normWords(String(o.title))} `.includes(` ${phrase}`),
      );
      hits.forEach((o) => Object.assign(o, { set_num: null, set: undefined, match_method: 'hidden_rule' }));
      return ok({ ok: true, rule, hidden: hits.length });
    }
    const delRule = path.match(/^\/api\/admin\/hide-rules\/(\d+)$/);
    if (delRule && method === 'DELETE') {
      const rule = state.rules.find((r) => r.id === Number(delRule[1]));
      if (!rule) return err(404, 'Pravilo nije pronađeno');
      state.rules = state.rules.filter((r) => r !== rule);
      const back = hiddenRows().filter(
        (o) => o.match_method === 'hidden_rule' && (!rule.shop_id || o.shop_id === rule.shop_id) && ` ${normWords(String(o.title))} `.includes(` ${rule.phrase}`),
      );
      back.forEach(relink);
      return ok({ ok: true, restored: back.length });
    }
    if (path === '/api/admin/users' && method === 'GET') return ok(state.users);
    if (path === '/api/admin/users' && method === 'POST') {
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return err(400, 'Unesite ispravan e-mail.');
      if (state.users.some((u) => u.email === email)) return err(409, 'Korisnik sa ovim e-mailom već postoji.');
      const now = new Date().toISOString();
      state.users.push({
        id: Math.max(...state.users.map((u) => u.id as number)) + 1,
        email,
        name: body?.name ?? '',
        role: body?.role === 'admin' ? 'admin' : 'user',
        digest_enabled: true,
        created_at: now,
        last_login_at: null,
        accepted_at: null,
        invited_at: now,
      });
      return ok({ ok: true, email, kind: 'invite', emailSent: false, link: 'https://kockolov.rs/poziv/primer', error: 'u pregledu se e-mail ne šalje' });
    }
    const inviteUser = path.match(/^\/api\/admin\/users\/(\d+)\/invite$/);
    if (inviteUser && method === 'POST') {
      const u = state.users.find((x) => x.id === Number(inviteUser[1]));
      if (!u) return err(404, 'Korisnik ne postoji.');
      if (!u.accepted_at) u.invited_at = new Date().toISOString();
      return ok({ ok: true, email: u.email, kind: u.accepted_at ? 'reset' : 'invite', emailSent: false, link: 'https://kockolov.rs/poziv/primer', error: 'u pregledu se e-mail ne šalje' });
    }
    const delUser = path.match(/^\/api\/admin\/users\/(\d+)$/);
    if (delUser && method === 'DELETE') {
      const id = Number(delUser[1]);
      if (id === state.user!.id) return err(400, 'Ne možete obrisati sopstveni nalog.');
      state.users = state.users.filter((u) => u.id !== id);
      return ok({ ok: true });
    }
    const match = path.match(/^\/api\/admin\/offers\/(\d+)\/match$/);
    if (match && method === 'POST') {
      const o = state.rows.find((x) => x.id === Number(match[1]));
      if (!o) return err(404, 'Ponuda nije pronađena');
      const setNum = String(body?.setNum ?? '').trim();
      if (!/^\d{3,7}(-\w+)?$/.test(setNum)) return err(400, 'Upiši broj seta, npr. 60384 ili 71051-7.');
      if (!setByNum.has(setNum) && !body?.confirmNew) {
        return { status: 409, body: { error: `Set ${setNum} nije u katalogu. Proveri broj; ako je tačan, potvrdi povezivanje.`, code: 'unknown_set' } };
      }
      const previous = o.set_num;
      Object.assign(o, {
        set_num: setNum,
        set: setByNum.get(setNum) ?? { name: o.title, image_url: o.image_url },
        match_method: 'manual',
        manual_at: new Date().toISOString(),
        manual_by: state.user!.name || state.user!.email,
      });
      return ok({ ok: true, previous, setNum, dropped: [] });
    }
    if (path === '/api/admin/crawl') {
      return err(409, 'U ovom pregledu se cene ne preuzimaju: prikazane su cene sa sajtova prodavnica od 28. 9. 2026.');
    }
    if (path === '/api/admin/deals') return ok({ ok: true, count: (snap.deals.members.items as Json[]).length });
    // news e-mails: the form and its preview work, nothing is sent
    if (path === '/api/admin/announcements' && method === 'GET') {
      const recipients = state.users.filter((u) => u.accepted_at && u.news_enabled !== false).length;
      return ok({ recipients, mailConfigured: true, delayMs: 1500, adminEmail: state.user!.email, items: [] });
    }
    if (path === '/api/admin/announcements/preview') {
      return ok({ subject: String(body?.subject ?? ''), html: newsPreview(String(body?.subject ?? ''), String(body?.body ?? ''), String(state.user!.name ?? '')) });
    }
    if (path.startsWith('/api/admin/announcements')) return err(409, 'U ovom pregledu se mejlovi ne šalju.');
  }

  return err(404, 'Nije pronađeno');
}

export function installMockApi(): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, 'http://kockolov.local');
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: Json | null = null;
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    } catch {
      body = null;
    }
    // a short pause so loading states look the way they do on the real site
    await new Promise((r) => setTimeout(r, 90 + Math.random() * 110));
    const res = handle(method, url, body);
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  };
}
