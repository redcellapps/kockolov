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
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
  // a kockolov.rs link opened with the app (https://kockolov.rs/set/75192) shows that page
  await App.addListener('appUrlOpen', ({ url }) => {
    try {
      const u = new URL(url);
      if (/(^|\.)kockolov\.rs$/.test(u.hostname)) open(`${u.pathname}${u.search}`);
    } catch {
      /* not a web address */
    }
  });
  await startNativePush(open);
}
