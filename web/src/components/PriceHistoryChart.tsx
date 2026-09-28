import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n';
import type { HistoryPoint, Offer } from '../lib/api';
import { dateShort, num, rsd, shopLabel } from '../lib/format';

// Step-line chart: prices only change when a shop changes them, so lines stay flat between changes.
// Colors follow the offer (fixed categorical order by shop, then seller) — never re-assigned by rank.

const SHOP_ORDER = ['lstore', 'kockarium', 'ananas'];
const MAX_SERIES = 8;
const DAY = 86_400_000;

interface Seg {
  x0: number;
  x1: number;
  price: number;
}
interface Series {
  id: number;
  label: string;
  color: string;
  segs: Seg[]; // in-stock stretches only (gaps = out of stock)
  current: number | null;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || max || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step * 0.01; v += step) out.push(Math.round(v));
  return out;
}

function buildSeries(offers: Offer[], history: HistoryPoint[], now: number): Series[] {
  const ordered = [...offers]
    .sort((a, b) => SHOP_ORDER.indexOf(a.shop_id) - SHOP_ORDER.indexOf(b.shop_id) || a.seller.localeCompare(b.seller))
    .slice(0, MAX_SERIES);
  return ordered.map((o, i) => {
    const pts = history
      .filter((h) => h.offer_id === o.id)
      .map((h) => ({ x: new Date(h.recorded_at).getTime(), price: h.price_rsd, inStock: h.in_stock }))
      .sort((a, b) => a.x - b.x);
    const segs: Seg[] = [];
    pts.forEach((p, k) => {
      const x1 = k < pts.length - 1 ? pts[k + 1].x : now;
      if (p.inStock && x1 > p.x) segs.push({ x0: p.x, x1, price: p.price });
    });
    return {
      id: o.id,
      label: shopLabel(o.shop_id, o.seller),
      color: `var(--series-${i + 1})`,
      segs,
      current: o.in_stock ? o.price_rsd : null,
    };
  });
}

export function PriceHistoryChart({ offers, history }: { offers: Offer[]; history: HistoryPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const now = useMemo(() => Date.now(), []);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const series = useMemo(() => buildSeries(offers, history, now), [offers, history, now]);
  const allSegs = series.flatMap((s) => s.segs);
  const firstX = allSegs.length ? Math.min(...allSegs.map((s) => s.x0)) : now;
  const spanDays = (now - firstX) / DAY;

  if (!allSegs.length || spanDays < 1.5) {
    return <p className="rounded-2xl bg-surface-2 px-5 py-6 text-sm text-ink-2">{t('set.history.empty')}</p>;
  }

  const showEndLabels = series.length <= 4 && width >= 520;
  const m = { top: 16, right: showEndLabels ? 104 : 16, bottom: 28, left: 64 };
  const height = 280;
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const x0 = Math.min(firstX, now - 7 * DAY);
  const prices = allSegs.map((s) => s.price);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const pad = Math.max((pMax - pMin) * 0.15, pMax * 0.04);
  const yTicks = niceTicks(Math.max(0, pMin - pad), pMax + pad);
  const yLo = yTicks[0];
  const yHi = yTicks[yTicks.length - 1];
  const sx = (x: number) => m.left + ((x - x0) / (now - x0)) * iw;
  const sy = (p: number) => m.top + ih - ((p - yLo) / (yHi - yLo || 1)) * ih;

  const xTicks: number[] = [];
  const tickCount = Math.max(2, Math.min(6, Math.floor(iw / 110)));
  for (let i = 0; i <= tickCount; i++) xTicks.push(x0 + ((now - x0) * i) / tickCount);

  // value of each series at time x
  const valueAt = (s: Series, x: number) => s.segs.find((g) => x >= g.x0 && x <= g.x1)?.price ?? null;

  // direct labels at the right edge, nudged apart so they never overlap
  const ends = series
    .filter((s) => s.current !== null)
    .map((s) => ({ s, y: sy(s.current!) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;

  const hx = hoverX === null ? null : Math.min(now, Math.max(x0, x0 + ((hoverX - m.left) / iw) * (now - x0)));
  const hoverRows =
    hx === null
      ? []
      : series
          .map((s) => ({ s, v: valueAt(s, hx) }))
          .filter((r) => r.v !== null)
          .sort((a, b) => a.v! - b.v!);

  return (
    <div ref={wrap} className="relative">
      <svg
        width={width}
        height={height}
        className="block touch-none select-none"
        role="img"
        aria-label={t('set.history.title')}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = e.clientX - r.left;
          setHoverX(px >= m.left && px <= m.left + iw ? px : null);
        }}
        onPointerLeave={() => setHoverX(null)}
      >
        {/* grid + y axis */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.left} x2={m.left + iw} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={m.left - 10} y={sy(v)} dy="0.32em" textAnchor="end" className="tabular fill-ink-3 text-[11px]">
              {num(v)}
            </text>
          </g>
        ))}
        {xTicks.map((x, i) => (
          <text
            key={x}
            x={sx(x)}
            y={height - 8}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            className="fill-ink-3 text-[11px]"
          >
            {dateShort(new Date(x))}
          </text>
        ))}
        {/* series */}
        {series.map((s) => (
          <g key={s.id}>
            {s.segs.map((g, k) => {
              const next = s.segs[k + 1];
              const joined = next && Math.abs(next.x0 - g.x1) < 1000;
              const d = `M${sx(Math.max(g.x0, x0))},${sy(g.price)} H${sx(g.x1)}${joined ? ` V${sy(next.price)}` : ''}`;
              return <path key={k} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
            })}
            {s.current !== null && (
              <circle cx={sx(now)} cy={sy(s.current)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            )}
          </g>
        ))}
        {showEndLabels &&
          ends.map(({ s, y }) => (
            <g key={s.id}>
              <line x1={sx(now) + 6} x2={sx(now) + 14} y1={y} y2={y} stroke={s.color} strokeWidth={2} />
              <text x={sx(now) + 18} y={y} dy="0.32em" className="tabular fill-ink text-[12px] font-bold">
                {num(s.current)}
              </text>
            </g>
          ))}
        {/* crosshair */}
        {hx !== null && (
          <g pointerEvents="none">
            <line x1={sx(hx)} x2={sx(hx)} y1={m.top} y2={m.top + ih} stroke="var(--ink-3)" strokeWidth={1} />
            {hoverRows.map(({ s, v }) => (
              <circle key={s.id} cx={sx(hx)} cy={sy(v!)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hx !== null && hoverRows.length > 0 && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-48 rounded-xl border border-line bg-surface px-3 py-2 shadow-lift"
          style={sx(hx) > width / 2 ? { right: width - sx(hx) + 12 } : { left: sx(hx) + 12 }}
        >
          <div className="mb-1 text-xs font-semibold text-ink-3">{dateShort(new Date(hx))}</div>
          {hoverRows.map(({ s, v }) => (
            <div key={s.id} className="flex items-center gap-2 py-0.5 text-sm">
              <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: s.color }} />
              <span className="tabular font-extrabold text-ink">{rsd(v)}</span>
              <span className="truncate text-ink-2">{s.label}</span>
            </div>
          ))}
        </div>
      )}
      {/* legend */}
      {series.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
