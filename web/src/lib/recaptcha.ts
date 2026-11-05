// Google reCAPTCHA v3: an invisible score checked by the server on sign-up and password requests.
// The site key comes from /api/auth/me; without it nothing is loaded and the server decides on its own.

interface Grecaptcha {
  ready(cb: () => void): void;
  execute(siteKey: string, opts: { action: string }): Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

let loading: Promise<void> | null = null;

function loadScript(siteKey: string): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    s.async = true;
    s.onload = () => (window.grecaptcha ? window.grecaptcha.ready(resolve) : reject(new Error('reCAPTCHA')));
    s.onerror = () => reject(new Error('reCAPTCHA'));
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Token for the server to check. Undefined when the check is off or the script can't load
 * (blocked by a browser extension, say); the server then refuses the request with a clear message.
 */
export async function recaptchaToken(siteKey: string | null | undefined, action: string): Promise<string | undefined> {
  if (!siteKey) return undefined;
  try {
    await loadScript(siteKey);
    return await window.grecaptcha!.execute(siteKey, { action });
  } catch {
    loading = null;
    return undefined;
  }
}
