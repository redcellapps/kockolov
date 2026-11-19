import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { t, type TKey } from '../i18n';
import { trackEvent } from '../lib/analytics';
import { cx } from './ui';

/*
 * The 404 page's little game: the Kockolov logo (a 2x2 brick with a magnifying lens, components/Logo.tsx)
 * lies in pieces around its outline on a baseplate; drag each piece onto its place (or Tab to it and press
 * Enter). Pieces snap when close. Time from the first touch, best time kept in this browser.
 */

type Id = 'body' | 'studL' | 'studR' | 'lens' | 'handle';
const IDS: Id[] = ['body', 'studL', 'studR', 'lens', 'handle'];
const LABEL: Record<Id, TKey> = {
  body: 'game.piece.body',
  studL: 'game.piece.studL',
  studR: 'game.piece.studR',
  lens: 'game.piece.lens',
  handle: 'game.piece.handle',
};

/** each piece in the logo's own 40×40 units, and its box there (stroke included) */
const BOX: Record<Id, [x: number, y: number, w: number, h: number]> = {
  body: [2, 11, 30, 23],
  studL: [7, 5, 8, 7],
  studR: [19, 5, 8, 7],
  lens: [19.3, 18.3, 17.4, 17.4],
  handle: [31.4, 30.4, 8.4, 8.4],
};

function Shape({ id }: { id: Id }) {
  switch (id) {
    case 'body':
      return (
        <>
          <rect x="2" y="11" width="30" height="23" rx="5" fill="var(--brand)" />
          <rect x="2" y="27" width="30" height="7" rx="3.5" fill="rgba(0,0,0,0.12)" />
        </>
      );
    case 'studL':
      return <rect x="7" y="5" width="8" height="7" rx="2.2" fill="var(--brand)" />;
    case 'studR':
      return <rect x="19" y="5" width="8" height="7" rx="2.2" fill="var(--brand)" />;
    case 'lens':
      return <circle cx="28" cy="27" r="7.2" fill="var(--surface)" stroke="var(--ink)" strokeWidth="3" />;
    case 'handle':
      return <path d="M33.2 32.2 38 37" stroke="var(--ink)" strokeWidth="3.6" strokeLinecap="round" />;
  }
}

/** The outline the pieces go into */
function Ghost({ id }: { id: Id }) {
  const common = { fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 0.45, strokeDasharray: '1.4 1.1' };
  switch (id) {
    case 'body':
      return <rect x="2" y="11" width="30" height="23" rx="5" {...common} />;
    case 'studL':
      return <rect x="7" y="5" width="8" height="7" rx="2.2" {...common} />;
    case 'studR':
      return <rect x="19" y="5" width="8" height="7" rx="2.2" {...common} />;
    case 'lens':
      return <circle cx="28" cy="27" r="8.7" {...common} />;
    case 'handle':
      return <path d="M33.2 32.2 38 37" {...common} strokeWidth={0.6} />;
  }
}

const S = 4; // logo units -> board units
const SNAP = 22;

interface Layout {
  w: number;
  h: number;
  /** where the logo goes */
  ox: number;
  oy: number;
  /** where pieces start: [x, y, w, h]; the first `big` ones fit the brick itself */
  slots: [number, number, number, number][];
  big: number;
}
// wide screens: pieces left and right of the outline; phones: above and below
const WIDE: Layout = {
  w: 520,
  h: 300,
  ox: 180,
  oy: 70,
  slots: [
    [12, 12, 156, 134],
    [12, 154, 156, 134],
    [352, 12, 156, 88],
    [352, 106, 156, 88],
    [352, 200, 156, 88],
  ],
  big: 2,
};
const TALL: Layout = {
  w: 340,
  h: 420,
  ox: 90,
  oy: 126,
  slots: [
    [12, 12, 156, 104],
    [172, 12, 156, 104],
    [12, 298, 101, 110],
    [119, 298, 101, 110],
    [226, 298, 102, 110],
  ],
  big: 2,
};

interface Piece {
  dx: number;
  dy: number;
  rot: number;
  placed: boolean;
}

function scatter(l: Layout): Record<Id, Piece> {
  const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
  // the brick into one of the big slots, the rest anywhere left
  const bigSlot = Math.floor(Math.random() * l.big);
  const rest = shuffle(l.slots.filter((_, i) => i !== bigSlot));
  const out = {} as Record<Id, Piece>;
  IDS.forEach((id) => {
    const slot = id === 'body' ? l.slots[bigSlot] : rest.pop()!;
    const [bx, by, bw, bh] = BOX[id];
    const pw = bw * S;
    const ph = bh * S;
    const x = slot[0] + Math.random() * Math.max(0, slot[2] - pw);
    const y = slot[1] + Math.random() * Math.max(0, slot[3] - ph);
    out[id] = { dx: x - (l.ox + bx * S), dy: y - (l.oy + by * S), rot: Math.round((Math.random() - 0.5) * 24), placed: false };
  });
  return out;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const BEST_KEY = 'kockolov.404.best';
const readBest = () => {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};

export function BrickGame({ className, after }: { className?: string; after?: ReactNode }) {
  const [layout] = useState<Layout>(() => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? TALL : WIDE));
  const [pieces, setPieces] = useState<Record<Id, Piece>>(() => scatter(layout));
  const [drag, setDrag] = useState<{ id: Id; px: number; py: number; dx: number; dy: number } | null>(null);
  const [focus, setFocus] = useState<Id | null>(null);
  const [started, setStarted] = useState<number | null>(null);
  const [result, setResult] = useState<{ ms: number; best: number | null; record: boolean } | null>(null);
  const [said, setSaid] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const placedCount = IDS.filter((id) => pieces[id].placed).length;

  // all five on their place: the time, the best one, and one cheer
  useEffect(() => {
    if (placedCount < IDS.length || result || started == null) return;
    const ms = Date.now() - started;
    const best = readBest();
    const record = best == null || ms < best;
    try {
      if (record) localStorage.setItem(BEST_KEY, String(ms));
    } catch {
      /* private window: no best time */
    }
    setResult({ ms, best: record ? ms : best, record });
    setSaid(t('game.done', { time: seconds(ms) }));
    trackEvent('igra_404', { sekundi: Math.round(ms / 100) / 10 });
  }, [placedCount, result, started]);

  const toBoard = (e: PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const start = () => setStarted((s) => s ?? Date.now());
  const place = (id: Id) => {
    setPieces((ps) => ({ ...ps, [id]: { dx: 0, dy: 0, rot: 0, placed: true } }));
    setSaid(t('game.placed', { piece: t(LABEL[id]) }));
  };

  const down = (id: Id) => (e: PointerEvent<SVGGElement>) => {
    if (pieces[id].placed || result) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toBoard(e);
    start();
    setDrag({ id, px: p.x, py: p.y, dx: pieces[id].dx, dy: pieces[id].dy });
  };
  const move = (e: PointerEvent<SVGGElement>) => {
    if (!drag) return;
    const p = toBoard(e);
    const [bx, by, bw, bh] = BOX[drag.id];
    const x0 = layout.ox + bx * S;
    const y0 = layout.oy + by * S;
    // kept on the baseplate
    const dx = Math.min(Math.max(drag.dx + p.x - drag.px, -x0), layout.w - x0 - bw * S);
    const dy = Math.min(Math.max(drag.dy + p.y - drag.py, -y0), layout.h - y0 - bh * S);
    setPieces((ps) => ({ ...ps, [drag.id]: { ...ps[drag.id], dx, dy } }));
  };
  const up = () => {
    if (!drag) return;
    const p = pieces[drag.id];
    if (Math.hypot(p.dx, p.dy) < SNAP) place(drag.id);
    setDrag(null);
  };
  const key = (id: Id) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (pieces[id].placed || result) return;
    start();
    place(id);
    // on to the next piece still lying around
    const next = IDS.find((x) => x !== id && !pieces[x].placed);
    if (next) requestAnimationFrame(() => svg.current?.querySelector<SVGGElement>(`[data-piece="${next}"]`)?.focus());
  };
  const again = () => {
    setPieces(scatter(layout));
    setStarted(null);
    setResult(null);
    setSaid('');
  };

  // the one being dragged on top, the placed ones in the logo's own order
  const order = [...IDS].sort((a, b) => Number(a === drag?.id) - Number(b === drag?.id));

  return (
    <div className={className}>
      <svg
        ref={svg}
        viewBox={`0 0 ${layout.w} ${layout.h}`}
        className="block w-full select-none"
        role="group"
        aria-label={t('game.label')}
        aria-describedby="brick-game-help"
      >
        <defs>
          <pattern id="brick-game-studs" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="5.2" fill="var(--line)" />
            <circle cx="9" cy="9" r="2.2" fill="var(--surface)" opacity="0.35" />
          </pattern>
        </defs>
        {/* the baseplate */}
        <rect x="0.5" y="0.5" width={layout.w - 1} height={layout.h - 1} rx="22" fill="var(--surface-2)" stroke="var(--line)" />
        <rect x="0" y="0" width={layout.w} height={layout.h} rx="22" fill="url(#brick-game-studs)" opacity="0.55" />
        <g transform={`translate(${layout.ox} ${layout.oy}) scale(${S})`}>
          {IDS.filter((id) => !pieces[id].placed).map((id) => (
            <Ghost key={id} id={id} />
          ))}
        </g>
        <g className={cx(result && 'brick-game-win')}>
          {order.map((id) => {
            const p = pieces[id];
            const [bx, by, bw, bh] = BOX[id];
            const moving = drag?.id === id;
            return (
              <g
                key={id}
                data-piece={id}
                role="button"
                aria-label={t(LABEL[id])}
                aria-disabled={p.placed || undefined}
                tabIndex={p.placed || result ? -1 : 0}
                onPointerDown={down(id)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onKeyDown={key(id)}
                onFocus={() => setFocus(id)}
                onBlur={() => setFocus((f) => (f === id ? null : f))}
                className={cx('brick-game-piece', !p.placed && !result && (moving ? 'cursor-grabbing' : 'cursor-grab'))}
                style={{
                  touchAction: 'none',
                  transform: `translate(${layout.ox + p.dx}px, ${layout.oy + p.dy}px) scale(${S})`,
                  transition: moving ? 'none' : 'transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1.25)',
                  filter: moving ? 'drop-shadow(0 6px 6px rgba(0,0,0,0.25))' : undefined,
                }}
              >
                <g
                  style={{
                    transform: `rotate(${p.rot}deg)`,
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    transition: 'transform 260ms ease-out',
                  }}
                >
                  {/* a bigger, invisible area to grab the small pieces by */}
                  <rect x={bx - 4} y={by - 4} width={bw + 8} height={bh + 8} fill="transparent" />
                  <Shape id={id} />
                  {focus === id && !p.placed && (
                    <rect x={bx - 1.5} y={by - 1.5} width={bw + 3} height={bh + 3} rx="2" fill="none" stroke="var(--accent)" strokeWidth="0.8" />
                  )}
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="mt-4 flex min-h-11 flex-wrap items-center justify-between gap-3">
        {result ? (
          <p className="text-lg font-extrabold">
            {t('game.done', { time: seconds(result.ms) })}{' '}
            <span className="text-base font-semibold text-ink-2">
              {result.record ? t('game.record') : t('game.best', { time: seconds(result.best!) })}
            </span>
          </p>
        ) : (
          <p id="brick-game-help" className="text-sm text-ink-2">
            {t('game.help')} <span className="tabular font-semibold text-ink">{t('game.progress', { n: placedCount, total: IDS.length })}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {result && (
            <button type="button" onClick={again} className="h-11 cursor-pointer rounded-xl border border-line bg-surface px-4 text-[15px] font-bold hover:border-ink">
              {t('game.again')}
            </button>
          )}
          {after}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
