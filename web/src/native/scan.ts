import { BarcodeFormat, BarcodeScanner, GoogleBarcodeScannerModuleInstallState } from '@capacitor-mlkit/barcode-scanning';
import { appPlatform } from '../lib/platform';

/*
 * The app's box scanner: the phone's own scanner screen (Google's on Android, the camera on iPhone)
 * reads the barcode on a LEGO box. Loaded only inside the app.
 */

export type ScanOutcome = { code: string } | { error: 'denied' | 'preparing' | 'unsupported' } | null;

/** Android downloads Google's scanner module the first time; waits up to ~20 s for it. */
async function androidModuleReady(): Promise<boolean> {
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (available) return true;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 20_000);
    void BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', (e) => {
      if (e.state === GoogleBarcodeScannerModuleInstallState.COMPLETED) {
        clearTimeout(timer);
        resolve(true);
      } else if (e.state === GoogleBarcodeScannerModuleInstallState.FAILED || e.state === GoogleBarcodeScannerModuleInstallState.CANCELED) {
        clearTimeout(timer);
        resolve(false);
      }
    });
    void BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/** Opens the scanner; the code read, a reason it couldn't, or null when the person closed it. */
export async function scanBox(): Promise<ScanOutcome> {
  try {
    if (!(await BarcodeScanner.isSupported()).supported) return { error: 'unsupported' };
    if (appPlatform === 'android') {
      if (!(await androidModuleReady())) return { error: 'preparing' };
    } else {
      let { camera } = await BarcodeScanner.checkPermissions();
      if (camera !== 'granted') camera = (await BarcodeScanner.requestPermissions()).camera;
      if (camera !== 'granted') return { error: 'denied' };
    }
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.Ean13, BarcodeFormat.UpcA, BarcodeFormat.Ean8, BarcodeFormat.UpcE],
      autoZoom: true,
    });
    const code = barcodes[0]?.rawValue ?? barcodes[0]?.displayValue;
    return code ? { code } : null;
  } catch (err) {
    // closing the scanner without a result rejects with "canceled"
    return /cancel/i.test(String((err as Error)?.message ?? err)) ? null : { error: 'unsupported' };
  }
}
