/*
 * The site's box scanner (the apps use the phone's own scanner, native/scan.ts): reads the barcode on a
 * LEGO box from the camera in the browser (components/WebScanner.tsx, lib/webScanReader.ts). Pictures
 * never leave the device: only the code that was read goes to the server, to find the set.
 */

/** The browser can open a camera (https, a camera API) and this is a phone or tablet. */
export function canScanInBrowser(): boolean {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}
