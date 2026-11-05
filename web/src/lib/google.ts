// Sign-in with Google (Google Identity Services): the button hands back an ID token for the server to check.

interface GoogleId {
  initialize(opts: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Google'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Draws Google's button into `el`; `onCredential` gets the token when the person picks an account. */
export async function renderGoogleButton(el: HTMLElement, clientId: string, onCredential: (credential: string) => void): Promise<void> {
  await loadScript();
  const id = window.google!.accounts.id;
  id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential) });
  id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 320 });
}
