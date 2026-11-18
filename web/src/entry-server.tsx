import { dehydrate, QueryClient, QueryClientProvider, type Query } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './lib/auth';

export { setServerFetch } from './lib/api';

/*
 * The page drawn on the server (server/src/seo/ssr.ts), so search engines, link previews and slow phones
 * get the whole page in the HTML. The browser then takes it over with hydrateRoot (main.tsx), starting
 * from the same data (window.__KQ__), so nothing is fetched twice and nothing jumps.
 *
 * Data: every useQuery a page renders lands in the query cache without fetching (no effects run on the
 * server). After each pass the pending ones are fetched through the server's own API and the page is
 * drawn again, until nothing new is asked for (queries that wait for another one need a second pass).
 */

const enabled = (q: Query) => {
  const e = (q.options as { enabled?: boolean | ((q: Query) => boolean) }).enabled;
  return typeof e === 'function' ? e(q) : e !== false;
};

export async function render(url: string): Promise<{ html: string; state: unknown }> {
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
  let html = renderToString(tree);
  for (let pass = 0; pass < 4; pass++) {
    const pending = client
      .getQueryCache()
      .getAll()
      .filter((q) => q.state.status === 'pending' && q.state.fetchStatus === 'idle' && enabled(q));
    if (!pending.length) break;
    // one try each: a failing call shows the page's error state, like a failed request in the browser
    await Promise.all(pending.map((q) => q.fetch({ ...q.options, retry: false }).catch(() => undefined)));
    html = renderToString(tree);
  }
  return { html, state: dehydrate(client) };
}
