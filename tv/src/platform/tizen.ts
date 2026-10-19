import type { Platform } from './index'

// Samsung Tizen TV. Arrows, Enter and Back (10009) arrive without registration; the number keys
// must be registered through tizen.tvinputdevice (privilege http://tizen.org/privilege/tv.inputdevice
// in config.xml), otherwise the TV keeps them for channel switching.
// Reference: Samsung Developers → Smart TV → Remote Control (key codes), Web API → TVInputDevice.

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
