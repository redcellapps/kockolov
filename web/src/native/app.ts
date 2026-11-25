import { App } from '@capacitor/app';
import { startNativePush } from './push';

let opener: (path: string) => void = () => {};
let started = false;

/**
 * Once when the Android/iOS app starts: the Android back button walks back through the pages (and
 * leaves the app on the first one), and notification taps open their page.
 */
export async function startNativeApp(open: (path: string) => void): Promise<void> {
  // the router's navigate may be handed in again; listeners are added only once
  opener = open;
  if (started) return;
  started = true;
  open = (path) => opener(path);
  // an app screen, not a web page: no pinch zoom (a zoomed page moved the header under the clock on
  // iPhone) and content drawn edge to edge, with the safe areas kept free by CSS
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
  // a kockolov.rs link opened with the app (https://kockolov.rs/set/75192) shows that page
  const openLink = (url: string | undefined) => {
    try {
      const u = new URL(url ?? '');
      if (/(^|\.)kockolov\.rs$/.test(u.hostname) && u.pathname !== '/') open(`${u.pathname}${u.search}`);
    } catch {
      /* not a web address */
    }
  };
  await App.addListener('appUrlOpen', ({ url }) => openLink(url));
  // the app was started by the link itself (it wasn't running yet)
  void App.getLaunchUrl()
    .then((r) => openLink(r?.url))
    .catch(() => undefined);
  await startNativePush(open);
}
