import { useState } from 'react';
import { t } from '../i18n';
import { trackEvent } from '../lib/analytics';
import { isApp } from '../lib/platform';
import { SITE_URL } from '../lib/site';
import { CheckIcon, ShareIcon } from './icons';
import { buttonClasses } from './ui';

/** Copies text where the browser has no share sheet. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  }
}

/**
 * "Podeli": the phone's share sheet (Viber, WhatsApp, …); on a computer the link is copied. The link always
 * points to kockolov.rs (also from the app) and carries utm_source=share, so the statistics show visits from shares.
 */
export function ShareButton({ path, title, text, className }: { path: string; title: string; text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${SITE_URL}${path}?utm_source=share`;
    trackEvent('podeli', { putanja: path });
    try {
      if (isApp) {
        // the share plugin arrived with app 1.1: older builds fall through to copying
        const { Share } = await import('@capacitor/share');
        await Share.share({ title, text, url, dialogTitle: t('share.title') });
        return;
      }
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (err) {
      // the person closed the share sheet: nothing more to do
      if ((err as Error).name === 'AbortError' || /cancel/i.test((err as Error).message ?? '')) return;
    }
    if (await copy(`${title}\n${text}\n${url}`)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  };
  return (
    <button type="button" onClick={() => void share()} className={buttonClasses('outline', 'lg', className)} aria-live="polite">
      {copied ? <CheckIcon size={18} /> : <ShareIcon size={18} />}
      {copied ? t('share.copied') : t('set.share')}
    </button>
  );
}
