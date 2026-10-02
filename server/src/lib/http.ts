import robotsParserModule from 'robots-parser';
import { config } from '../config.js';

interface Robots {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getCrawlDelay(ua?: string): number | undefined;
}
// robots-parser is CommonJS; normalise the default export for ESM + TypeScript
const robotsParser = ((robotsParserModule as any).default ?? robotsParserModule) as (url: string, txt: string) => Robots;

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

export class RobotsDisallowed extends Error {
  constructor(public url: string) {
    super(`robots.txt disallows ${url}`);
  }
}

export interface FetcherOptions {
  userAgent?: string;
  delayMs?: number;
  timeoutMs?: number;
  retries?: number;
  respectRobots?: boolean;
  log?: (msg: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Polite HTTP client: honours robots.txt, waits between requests to the same host,
 * retries transient failures with backoff and identifies itself with a clear User-Agent.
 */
export class PoliteFetcher {
  private robots = new Map<string, Promise<Robots | null>>();
  private lastHit = new Map<string, number>();
  /** Crawl-delay from robots.txt per host (ms), when longer than our own delay */
  private hostDelay = new Map<string, number>();
  private opts: Required<FetcherOptions>;
  public requests = 0;

  constructor(opts: FetcherOptions = {}) {
    this.opts = {
      userAgent: opts.userAgent ?? config.CRAWLER_USER_AGENT,
      delayMs: opts.delayMs ?? config.CRAWLER_DELAY_MS,
      timeoutMs: opts.timeoutMs ?? config.CRAWLER_TIMEOUT_MS,
      retries: opts.retries ?? 3,
      respectRobots: opts.respectRobots ?? true,
      log: opts.log ?? (() => {}),
    };
  }

  private async robotsFor(origin: string): Promise<Robots | null> {
    if (!this.robots.has(origin)) {
      const url = `${origin}/robots.txt`;
      this.robots.set(
        origin,
        (async () => {
          try {
            const res = await this.raw(url);
            if (!res.ok) return null; // no robots.txt -> everything allowed
            return robotsParser(url, await res.text());
          } catch {
            return null;
          }
        })(),
      );
    }
    return this.robots.get(origin)!;
  }

  private async throttle(host: string) {
    const last = this.lastHit.get(host) ?? 0;
    const wait = last + Math.max(this.opts.delayMs, this.hostDelay.get(host) ?? 0) - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastHit.set(host, Date.now());
  }

  private async raw(url: string): Promise<Response> {
    const host = new URL(url).host;
    await this.throttle(host);
    this.requests++;
    return fetch(url, {
      headers: {
        'User-Agent': this.opts.userAgent,
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'sr-RS,sr;q=0.9,en;q=0.6',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
  }

  async get(url: string, { allow404 = false } = {}): Promise<{ status: number; text: string } > {
    const u = new URL(url);
    if (this.opts.respectRobots) {
      const robots = await this.robotsFor(u.origin);
      if (robots && robots.isAllowed(url, this.opts.userAgent) === false) throw new RobotsDisallowed(url);
      const crawlDelay = robots?.getCrawlDelay(this.opts.userAgent);
      if (crawlDelay && crawlDelay > 0) this.hostDelay.set(u.host, Math.min(crawlDelay, 30) * 1000);
    }
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        const res = await this.raw(url);
        if (res.status === 404 && allow404) return { status: 404, text: '' };
        if (res.status === 429 || res.status >= 500) {
          if (attempt > this.opts.retries) throw new HttpError(res.status, url);
          const retryAfter = Number(res.headers.get('retry-after'));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt ** 2;
          this.opts.log(`retry ${attempt} after ${wait}ms (${res.status}) ${url}`);
          await sleep(Math.min(wait, 60_000));
          continue;
        }
        if (!res.ok) throw new HttpError(res.status, url);
        return { status: res.status, text: await res.text() };
      } catch (err) {
        if (err instanceof HttpError) throw err;
        if (attempt > this.opts.retries) throw err;
        this.opts.log(`retry ${attempt} after network error: ${(err as Error).message} ${url}`);
        await sleep(2000 * attempt ** 2);
      }
    }
  }

  async getJson<T = unknown>(url: string): Promise<T> {
    const { text } = await this.get(url);
    return JSON.parse(text) as T;
  }
}
