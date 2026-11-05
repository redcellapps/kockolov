/** A notification that arrived while the app was open (native/push.ts → components/InAppNotice) */
export const IN_APP_PUSH = 'kl-in-app-push';
export interface InAppPush {
  title: string;
  body: string;
  /** page to open on a tap */
  url?: string;
}
