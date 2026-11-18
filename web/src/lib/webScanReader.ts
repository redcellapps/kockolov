/*
 * The barcode reader behind the site's camera view (components/WebScanner.tsx), in its own module so
 * only that view, loaded on demand, pulls in ZXing and its .wasm (the app and the preview never do):
 *  - Chrome and Edge on Android (and a few desktops) have a built-in BarcodeDetector;
 *  - Safari, Firefox and the rest get the same API from barcode-detector (ZXing in WebAssembly). Its
 *    ~1 MB .wasm is served from our own server and loaded only the first time someone scans there.
 */

export interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

// LEGO boxes carry EAN-13 (Europe) or UPC-A (America); EAN-8 for the smallest packs
const FORMATS = ['ean_13', 'upc_a', 'ean_8'];

let pending: Promise<Detector> | null = null;

/** A barcode reader for box codes: the browser's own when it has one, otherwise ZXing. */
export function boxDetector(): Promise<Detector> {
  pending ??= (async () => {
    const native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } })
      .BarcodeDetector;
    if (native) {
      try {
        const supported = await native.getSupportedFormats();
        if (supported.includes('ean_13')) return new native({ formats: FORMATS.filter((f) => supported.includes(f)) });
      } catch {
        /* fall back to ZXing */
      }
    }
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ]);
    // load the .wasm from this site instead of the CDN the library would use
    prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
    return new BarcodeDetector({ formats: FORMATS as never });
  })();
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

/** EAN-13, UPC-A or EAN-8 digits with a correct check digit (camera reads can be wrong). */
export function validBoxCode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
