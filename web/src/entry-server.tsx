import { dehydrate, QueryClient, QueryClientProvider, type DehydratedState, type Query } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './lib/auth';
import { freezeClock } from './lib/format';

export { setServerFetch } from './lib/api';

/*
 * The page drawn on the server (server/src/seo/ssr.ts), so search engines, link previews and slow phones
 * get the whole page in the HTML. The browser then takes it over with hydrateRoot (main.tsx), starting
 * from the same data (window.__KQ__), so nothing is fetched twice and nothing jumps.
 *
 * Data: every useQuery a page renders lands in the query cache without fetching (no effects run on the
 * server). After each pass the pending ones are fetched through the server's own API and the page is
 * drawn again, until nothing new is asked for (queries that wait for another one need a second pass).
 *
 * A page that is still waiting for data, or shows a failed request, is not sent: render() throws and the
 * server sends its crawler copy instead (search engines never get a loading skeleton). Past `until` it
 * stops too: the server has already answered without it.
 */

const enabled = (q: Query) => {
  const e = (q.options as { enabled?: boolean | ((q: Query) => boolean) }).enabled;
  return typeof e === 'function' ? e(q) : e !== false;
};

/** what the browser needs to take the page over: the data, and the time the page was drawn at */
export interface PageState {
  q: DehydratedState;
  now: number;
}

export async function render(url: string, until = Infinity): Promise<{ html: string; state: PageState }> {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: false } } });
  const tree = (
    <StrictMode>
      <QueryClientProvider client={client}>
        <StaticRouter location={url}>
          <AuthProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </AuthProvider>
        </StaticRouter>
      </QueryClientProvider>
    </StrictMode>
  );
  // relative times ("pre 3 sata") from one moment, which the browser uses while taking the page over;
  // renderToString is synchronous, so pages drawn side by side never see each other's clock
  const draw = () => {
    const now = Date.now();
    freezeClock(now);
    try {
      return { html: renderToString(tree), now };
    } finally {
      freezeClock(null);
    }
  };
  const queries = () => client.getQueryCache().getAll().filter(enabled);
  let page = draw();
  for (let pass = 0; pass < 4; pass++) {
    const pending = queries().filter((q) => q.state.status === 'pending' && q.state.fetchStatus === 'idle');
    if (!pending.length) break;
    if (Date.now() > until) throw new Error(`${url}: out of time`);
    // one try each; a failure is caught below
    await Promise.all(pending.map((q) => q.fetch({ ...q.options, retry: false }).catch(() => undefined)));
    page = draw();
  }
  const unfinished = queries().filter((q) => q.state.status !== 'success');
  if (unfinished.length) {
    throw new Error(`${url}: no data for ${unfinished.map((q) => `${JSON.stringify(q.queryKey)} (${q.state.error?.message ?? 'waiting'})`).join(', ')}`);
  }
  return { html: page.html, state: { q: dehydrate(client), now: page.now } };
}
