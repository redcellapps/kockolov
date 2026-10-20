import type { Platform } from './index'

// Samsung Tizen TV (developer.samsung.com → Smart TV → Remote Control, Terminating Applications):
// - arrows (37–40), Enter (13) and Back (10009) arrive without registration
// - the number keys (48–57) must be registered through tizen.tvinputdevice, otherwise the TV keeps
//   them for channel switching; needs http://tizen.org/privilege/tv.inputdevice in config.xml
// - Exit (10182) is sent to the app; a long press of Return/Exit always terminates the app
// - Back on the first page shows our own dialog, "Izađi" calls tizen.application…exit()

declare const tizen: {
  tvinputdevice?: { registerKeyBatch(keys: string[], ok?: () => void, err?: (e: unknown) => void): void }
  application?: { getCurrentApplication(): { exit(): void } }
}

const BACK = 10009
const EXIT = 10182

export default function tizenPlatform(digits: Record<number, string>): Platform {
  return {
    id: 'tizen',
    pointer: false,
    keymap: { ...digits, [BACK]: 'back', [EXIT]: 'exit' },
    init() {
      try {
        const names = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
        tizen.tvinputdevice?.registerKeyBatch(names, undefined, (e) => console.warn('tvinputdevice', e))
      } catch (e) {
        console.warn('tvinputdevice unavailable', e)
      }
    },
    exit() {
      try {
        tizen.application?.getCurrentApplication().exit()
      } catch (e) {
        console.warn('exit failed', e)
        window.close()
      }
    },
  }
}
