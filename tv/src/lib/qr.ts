import QRCode from 'qrcode'

const made = new Map<string, Promise<string>>()

/** A QR code for `text` as a PNG data URL (drawn once per text, on a hidden canvas) */
export function qrDataUrl(text: string, size = 240): Promise<string> {
  const key = `${size}|${text}`
  let p = made.get(key)
  if (!p) {
    p = QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#16150fff', light: '#ffffffff' },
    })
    made.set(key, p)
  }
  return p
}
