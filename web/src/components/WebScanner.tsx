import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { boxDetector, validBoxCode } from '../lib/webScanReader';
import { XIcon } from './icons';
import { Button } from './ui';

type State = 'starting' | 'scanning' | 'denied' | 'noCamera' | 'failed';

/**
 * Full-screen camera view on the site: reads the barcode on a LEGO box and hands the code over.
 * The set number printed on the box can be typed instead, also when the camera is off or missing.
 */
export function WebScanner({ onCode, onTyped, onClose }: { onCode: (code: string) => void; onTyped: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<State>('starting');
  const [num, setNum] = useState('');
  // the latest callbacks without restarting the camera when they change
  const cb = useRef({ onCode, onClose });
  cb.current = { onCode, onClose };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const detector = await boxDetector();
        if (stopped) return;
        setState('scanning');
        const tick = async () => {
          if (stopped) return;
          try {
            if (v.readyState >= 2) {
              const found = await detector.detect(v);
              const code = found.map((f) => f.rawValue.replace(/\D/g, '')).find(validBoxCode);
              if (code && !stopped) {
                stopped = true;
                navigator.vibrate?.(40);
                cb.current.onCode(code);
                return;
              }
            }
          } catch {
            /* a frame that couldn't be read; try the next one */
          }
          timer = setTimeout(() => void tick(), 180);
        };
        void tick();
      } catch (err) {
        if (stopped) return;
        const name = (err as DOMException)?.name;
        setState(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'denied'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'noCamera'
              : 'failed',
        );
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Esc closes; the page behind doesn't scroll while the camera is open
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && cb.current.onClose();
    window.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
    };
  }, []);

  const typed = (e: FormEvent) => {
    e.preventDefault();
    const q = num.trim();
    if (q) onTyped(q);
  };

  const message =
    state === 'scanning' ? t('scan.web.hint') : state === 'starting' ? t('scan.web.starting') : t(`scan.web.${state}`);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('scan.web.title')} className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="safe-top flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="text-lg font-extrabold">{t('scan.web.title')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('scan.close')}
          className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <XIcon size={20} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        {/* the aiming frame; everything around it is dimmed */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative aspect-[3/2] w-[78%] max-w-sm rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
            {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'].map(
              (c) => (
                <span key={c} className={`absolute h-9 w-9 border-brand ${c}`} />
              ),
            )}
            {state === 'scanning' && <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse rounded bg-brand/80" />}
          </div>
        </div>
      </div>

      <div className="safe-bottom bg-black px-4 pb-4 pt-3">
        <p role="status" className="text-center text-[15px] font-semibold text-white/90">
          {message}
        </p>
        <form onSubmit={typed} className="mx-auto mt-3 flex max-w-md gap-2">
          <input
            value={num}
            onChange={(e) => setNum(e.target.value)}
            inputMode="numeric"
            placeholder={t('scan.typeNumber')}
            aria-label={t('scan.web.typeLabel')}
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-3.5 text-[15px] text-white outline-none placeholder:text-white/50 focus:border-white"
          />
          <Button type="submit">{t('scan.open')}</Button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
