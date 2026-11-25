import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// Runs the real service worker (web/public/sw.js) against a stub of the worker environment
const source = readFileSync(path.join(import.meta.dirname, '../../web/public/sw.js'), 'utf8');

function boot(windows: { url: string; postMessage: (m: unknown) => void; focus: () => Promise<unknown> }[]) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const cachePuts: Record<string, string> = {};
  const opened: string[] = [];
  const self = {
    location: { origin: 'https://kockolov.rs' },
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => opened.push(url),
      claim: async () => undefined,
    },
    registration: { showNotification: async () => undefined },
    skipWaiting: async () => undefined,
  };
  const caches = {
    open: async () => ({ put: async (k: string, r: Response) => void (cachePuts[k] = await r.text()), addAll: async () => undefined }),
    keys: async () => [],
    delete: async () => true,
    match: async () => undefined,
  };
  vm.runInNewContext(source, { self, caches, URL, Response, Date, JSON, fetch: async () => ({ ok: false }), atob, Uint8Array, console });
  const click = async (url: string) => {
    const waits: Promise<unknown>[] = [];
    handlers.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  return { click, cachePuts, opened };
}

describe('tapping a push notification', () => {
  it('tells a running page where to go (iOS ignores WindowClient.navigate)', async () => {
    const messages: unknown[] = [];
    let focused = 0;
    const sw = boot([{ url: 'https://kockolov.rs/', postMessage: (m) => messages.push(m), focus: async () => void focused++ }]);
    await sw.click('/set/71043');
    expect(messages).toEqual([{ type: 'open-url', url: 'https://kockolov.rs/set/71043' }]);
    expect(focused).toBe(1);
    expect(sw.opened).toEqual([]);
  });

  it('opens the target and leaves it for the page when the app was closed (iOS may start on "/")', async () => {
    const sw = boot([]);
    await sw.click('/set/71043');
    expect(sw.opened).toEqual(['https://kockolov.rs/set/71043']);
    const pending = JSON.parse(sw.cachePuts['/__pending-nav']);
    expect(pending.url).toBe('https://kockolov.rs/set/71043');
    expect(Date.now() - pending.t).toBeLessThan(5000);
  });

  it('falls back to the home page when the notification carries no link', async () => {
    const sw = boot([]);
    await sw.click('');
    expect(sw.opened).toEqual(['https://kockolov.rs/']);
  });
});
