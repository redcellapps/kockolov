import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, cx, Spinner } from '../components/ui';
import { Field } from '../pages/Login';
import { t } from '../i18n';
import { api, type SearchResponse, type SetDetail, type Theme } from '../lib/api';
import { usePageTitle } from '../lib/title';
import { ProtoBanner } from './ListingsPage';
import { useAuth } from '../lib/auth';
import { addListing, changePrice, CONDITIONS, loadCatalog, PHOTO_H, PHOTO_W, processPhoto, setPhone, updateListing, useListings, usePhone, type Condition, type Listing } from './store';

const area = 'w-full rounded-xl border border-line bg-surface p-3 text-[15px] outline-none transition focus:border-ink';

export default function NewListing() {
  const { id } = useParams();
  const l = useListings().find((x) => x.id === id);
  if (id && (!l || !l.mine)) return <div className="mx-auto max-w-2xl px-4 py-16 text-center font-bold">{t('ads.detail.notFound')}</div>;
  return <ListingForm key={id ?? 'new'} edit={l} />;
}

function ListingForm({ edit }: { edit?: Listing }) {
  usePageTitle(edit ? t('title.adEdit') : t('title.adNew'));
  const nav = useNavigate();
  const { user } = useAuth();
  const savedPhone = usePhone();
  const [step, setStep] = useState(0);
  const [setNum, setSetNum] = useState(edit?.set_num ?? '');
  const [found, setFound] = useState<SetDetail['set'] | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'busy' | 'none'>('idle');
  const themes = useQuery({ queryKey: ['themes'], queryFn: () => api<Theme[]>('/api/themes'), staleTime: 600_000 });
  const [setName, setSetName] = useState('');
  const [theme, setTheme] = useState(edit?.theme_name ?? '');
  const [year, setYear] = useState(edit?.year ? String(edit.year) : '');
  const [pieces, setPieces] = useState(edit?.pieces ? String(edit.pieces) : '');
  const [minifigs, setMinifigs] = useState(edit?.minifigs != null ? String(edit.minifigs) : '');
  const [fromCatalog, setFromCatalog] = useState(false);
  const [shipping, setShipping] = useState<'pickup' | 'ships'>(edit?.shipping ?? 'pickup');
  const [title, setTitle] = useState(edit?.title ?? '');
  const [desc, setDesc] = useState(edit?.description ?? '');
  const [cond, setCond] = useState<Condition>(edit?.condition ?? 'used_complete');
  const [box, setBox] = useState(edit?.has_box ?? true);
  const [manual, setManual] = useState(edit?.has_manual ?? true);
  const [images, setImages] = useState<string[]>(edit?.images ?? []);
  const [price, setPrice] = useState(edit ? String(edit.price_rsd) : '');
  const [negotiable, setNegotiable] = useState(edit?.negotiable ?? true);
  const [city, setCity] = useState(edit?.city ?? '');
  const [phone, setPh] = useState(edit?.seller_phone || savedPhone);
  const [err, setErr] = useState<string | null>(null);

  const [sugg, setSugg] = useState<{ num: string; name: string; theme: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const q = setNum.trim();
    if (q.length < 2 || found) return setSugg([]);
    const h = setTimeout(async () => {
      const out: { num: string; name: string; theme: string }[] = [];
      try {
        const r = await api<SearchResponse>(`/api/sets?q=${encodeURIComponent(q)}&size=6`);
        for (const x of r.items) out.push({ num: x.set_num, name: x.name, theme: x.theme_name ?? '' });
      } catch {
        /* the catalog below may still match */
      }
      const cat = await loadCatalog();
      if (cat) {
        const ql = q.toLowerCase();
        for (const [num, e] of Object.entries(cat)) {
          if (out.length >= 8) break;
          if (out.some((o) => o.num === num)) continue;
          if (num.startsWith(ql) || e[0].toLowerCase().includes(ql)) out.push({ num, name: e[0], theme: e[3] });
        }
      }
      setSugg(out);
    }, 250);
    return () => clearTimeout(h);
  }, [setNum, found]);

  async function find(override?: string) {
    const n = (override ?? setNum).trim();
    if (!n) return;
    setLookup('busy');
    setFromCatalog(false);
    try {
      const d = await api<SetDetail>(`/api/sets/${encodeURIComponent(n)}`);
      setFound(d.set);
      setSetName(d.set.name);
      setTheme(d.set.theme_name ?? '');
      setYear(d.set.year ? String(d.set.year) : '');
      setPieces(d.set.pieces ? String(d.set.pieces) : '');
      if (!title) setTitle(`LEGO ${d.set.set_num} ${d.set.name}`);
      setLookup('idle');
      return;
    } catch {
      setFound(null);
    }
    // not among the sets we track: try the catalog of every LEGO set (if it was built)
    const hit = (await loadCatalog())?.[n];
    if (hit) {
      const [name, y, p, th] = hit;
      setSetName(name);
      setTheme(th);
      setYear(y ? String(y) : '');
      setPieces(p ? String(p) : '');
      setFromCatalog(true);
      if (!title) setTitle(`LEGO ${n} ${name}`);
      setLookup('idle');
    } else setLookup('none');
  }

  const [pending, setPending] = useState(0); // photos still being processed (loader tiles)
  async function addPhotos(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []).slice(0, Math.max(0, 8 - images.length));
    input.value = ''; // the same file can be picked again
    if (!files.length) return;
    setPending((n) => n + files.length);
    for (const f of files) {
      const src = await processPhoto(f).catch(() => '');
      setPending((n) => n - 1);
      if (src) setImages((prev) => (prev.length < 8 ? [...prev, src] : prev));
      else setErr(t('ads.new.errPhotoRead'));
    }
  }

  function check(): string | null {
    if (step === 2 && !images.length) return t('ads.new.errPhoto');
    if (step === 1 && title.trim().length < 6) return t('ads.new.errTitle');
    return null;
  }
  const go = (n: number) => {
    const e = n > step ? check() : null;
    setErr(e);
    if (!e) setStep(n);
  };

  function publish() {
    const p = Number(price);
    const e = !(p > 0) ? t('ads.new.errPrice') : !city.trim() ? t('ads.new.errCity') : phone.replace(/\D/g, '').length < 8 ? t('ads.new.errPhone') : null;
    setErr(e);
    if (e) return;
    setPhone(phone.trim());
    const fields = {
      title: title.trim(),
      description: desc.trim(),
      set_num: found?.set_num ?? (setNum.trim() || null),
      theme_slug: found?.theme_slug ?? themes.data?.find((x) => x.name === theme)?.slug ?? edit?.theme_slug ?? null,
      theme_name: theme || null,
      year: Number(year) || null,
      pieces: Number(pieces) || null,
      minifigs: minifigs === '' ? null : Number(minifigs),
      shipping,
      condition: cond,
      has_box: box,
      has_manual: manual,
      negotiable,
      city: city.trim(),
      images,
      seller_phone: phone.trim(),
    };
    if (edit) {
      updateListing(edit.id, fields);
      changePrice(edit.id, p); // keeps the old price in the history, so followers get the "price dropped" notice
      nav(`/oglasi/${edit.id}`);
      return;
    }
    const newId = addListing({
      ...fields,
      price_rsd: p,
      price_history: [],
      seller: user?.name || user?.email.split('@')[0] || 'Ja',
      seller_since: new Date().toISOString(),
    });
    nav(`/oglasi/${newId}`);
  }

  const steps = [t('ads.new.step1'), t('ads.new.step2'), t('ads.new.step3'), t('ads.new.step4')];
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <ProtoBanner />
      <h1 className="text-3xl font-extrabold tracking-tight">{edit ? t('ads.edit.title') : t('ads.new.title')}</h1>
      <ol className="mt-5 flex gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex-1">
            <div className={cx('h-1.5 rounded-full', i <= step ? 'bg-brand' : 'bg-line')} />
            <div className={cx('mt-1.5 text-xs font-bold', i === step ? 'text-ink' : 'text-ink-3')}>{i + 1}. {s}</div>
          </li>
        ))}
      </ol>

      <div className="mt-6 space-y-5 rounded-3xl border border-line bg-surface p-6 sm:p-7">
        {step === 0 && (
          <>
            <div>
              <div className="relative">
                <Field label={t('ads.new.setLabel')} value={setNum} autoComplete="off" onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => (setSetNum(e.target.value), setFound(null), setLookup('idle'), setOpen(true))} placeholder="75192" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void find())} />
                {open && sugg.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-2xl border border-line bg-surface p-1 shadow-lg">
                    {sugg.map((x) => (
                      <li key={x.num}>
                        <button type="button" className="flex w-full items-baseline gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2" onMouseDown={(e) => e.preventDefault()} onClick={() => { setSetNum(x.num); setOpen(false); setSugg([]); void find(x.num); }}>
                          <span className="tabular font-extrabold">{x.num}</span>
                          <span className="min-w-0 flex-1 truncate">{x.name}</span>
                          <span className="shrink-0 text-xs text-ink-3">{x.theme}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="mt-1.5 text-xs text-ink-3">{t('ads.new.setHint')}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void find()} disabled={lookup === 'busy'}>{t('ads.new.lookup')}</Button>
            </div>
            {found && (
              <div className="flex items-center gap-4 rounded-2xl bg-save-soft p-3">
                {found.image_url && <img src={found.image_url} alt="" className="h-16 w-16 rounded-xl bg-white object-contain p-1" />}
                <div className="text-sm">
                  <div className="font-extrabold text-save">{t('ads.new.setFound', { name: found.name })}</div>
                  <div className="text-ink-2">{found.theme_name} · {found.year ?? '—'}</div>
                </div>
              </div>
            )}
            {fromCatalog && <p className="rounded-xl bg-save-soft px-3 py-2 text-sm font-semibold text-save">{t('ads.new.fromCatalog', { name: setName })}</p>}
            {lookup === 'none' && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">{t('ads.new.setNotFound')}</p>}
            <div className="space-y-4 border-t border-line pt-5">
              <div>
                <h3 className="font-extrabold">{t('ads.new.moreInfo')}</h3>
                <p className="text-xs text-ink-3">{t('ads.new.moreInfoHint')}</p>
              </div>
              <Field label={t('ads.new.setName')} value={setName} onChange={(e) => setSetName(e.target.value)} maxLength={90} />
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-ink-2">{t('ads.new.theme')}</span>
                <select className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] outline-none focus:border-ink" value={theme} onChange={(e) => setTheme(e.target.value)}>
                  <option value="">{t('ads.new.themeNone')}</option>
                  {theme && !themes.data?.some((x) => x.name === theme) && <option value={theme}>{theme}</option>}
                  {themes.data?.map((x) => (
                    <option key={x.slug} value={x.name}>{x.name}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-3 gap-3">
                <Field label={t('ads.new.year')} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="2021" />
                <Field label={t('ads.new.pieces')} value={pieces} onChange={(e) => setPieces(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" />
                <Field label={t('ads.new.minifigs')} value={minifigs} onChange={(e) => setMinifigs(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" />
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Field label={t('ads.new.titleLabel')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={90} />
            <div>
              <span className="mb-2 block text-sm font-bold text-ink-2">{t('ads.new.conditionLabel')}</span>
              <div className="grid gap-2">
                {CONDITIONS.map((c) => (
                  <label key={c} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold', cond === c ? 'border-ink bg-surface-2' : 'border-line')}>
                    <input type="radio" name="cond" checked={cond === c} onChange={() => setCond(c)} /> {t(`cond.${c}`)}
                  </label>
                ))}
                <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-ink-2">{t('ads.new.usedOnly')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-6 text-sm font-semibold">
              <label className="flex items-center gap-2"><input type="checkbox" checked={box} onChange={(e) => setBox(e.target.checked)} /> {t('ads.new.hasBox')}</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> {t('ads.new.hasManual')}</label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-ink-2">{t('ads.new.descLabel')}</span>
              <textarea rows={5} className={area} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} />
              <span className="mt-1 block text-xs text-ink-3">{t('ads.new.descHint')}</span>
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <span className="mb-1 block text-sm font-bold text-ink-2">{t('ads.new.photosLabel')}</span>
              <p className="text-xs text-ink-3">{t('ads.new.photosHint')}</p>
            </div>
            <div className="rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">
              <div className="font-extrabold text-ink">{t('ads.new.photoIdeal', { w: PHOTO_W, h: PHOTO_H })}</div>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed">
                <li>{t('ads.new.photoTip1')}</li>
                <li>{t('ads.new.photoTip2')}</li>
                <li>{t('ads.new.photoTip3')}</li>
              </ul>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {images.map((src, i) => (
                <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  {i === 0 && <span className="absolute left-1 top-1 rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-extrabold text-bg">1</span>}
                  <button aria-label={t('ads.new.removePhoto')} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink/80 text-xs text-bg" onClick={() => setImages(images.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {Array.from({ length: pending }, (_, i) => (
                <div key={`p${i}`} className="grid aspect-[4/3] place-items-center rounded-xl border border-line bg-surface-2 text-center text-xs font-bold text-ink-3" role="status" aria-live="polite">
                  <span className="grid justify-items-center gap-2"><Spinner />{t('ads.new.photoBusy')}</span>
                </div>
              ))}
              {images.length + pending < 8 && (
                <label className="grid aspect-[4/3] cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line text-center text-xs font-bold text-ink-2 hover:border-ink-3">
                  <span>＋<br />{t('ads.new.addPhoto')}</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addPhotos(e.target)} />
                </label>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Field label={t('ads.new.priceLabel')} value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="12000" />
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} /> {t('ads.new.negotiable')}</label>
            <div>
              <span className="mb-2 block text-sm font-bold text-ink-2">{t('ads.new.shippingLabel')}</span>
              <div className="grid grid-cols-2 gap-2">
                {(['pickup', 'ships'] as const).map((v) => (
                  <label key={v} className={cx('flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold', shipping === v ? 'border-ink bg-surface-2' : 'border-line')}>
                    <input type="radio" name="ship" checked={shipping === v} onChange={() => setShipping(v)} /> {t(`ship.${v}`)}
                  </label>
                ))}
              </div>
            </div>
            <Field label={t('ads.new.cityLabel')} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
            <div>
              <Field label={t('ads.new.phoneLabel')} value={phone} onChange={(e) => setPh(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="+381 6x xxx xxxx" />
              <p className="mt-1.5 text-xs text-ink-3">{savedPhone ? t('ads.new.phoneHint') : `${t('ads.new.phoneNeeded')} ${t('ads.new.phoneHint')}`}</p>
            </div>
            <p className="text-xs text-ink-3">{t('ads.new.rules')}</p>
          </>
        )}

        {err && <p role="alert" className="rounded-xl bg-deal-soft px-3 py-2 text-sm font-semibold text-deal">{err}</p>}
        <div className="flex justify-between gap-3 pt-1">
          {step > 0 ? <Button variant="ghost" onClick={() => go(step - 1)}>{t('ads.new.back')}</Button> : <Link to={edit ? `/oglasi/${edit.id}` : '/oglasi'} className="inline-flex h-11 items-center px-4 text-sm font-bold text-ink-2">{t('ads.detail.back')}</Link>}
          {step < 3 ? <Button onClick={() => go(step + 1)} disabled={step === 2 && pending > 0}>{t('ads.new.next')}</Button> : <Button onClick={publish}>{edit ? t('ads.edit.save') : t('ads.new.publish')}</Button>}
        </div>
      </div>
    </div>
  );
}
