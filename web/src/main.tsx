import { hydrate, QueryClient, QueryClientProvider, type DehydratedState } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, useLocation, useNavigate } from 'react-router';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { ApiError } from './lib/api';
import { trackPage } from './lib/analytics';
import { AuthProvider } from './lib/auth';
import { freezeClock } from './lib/format';
import { isApp, loadAppToken } from './lib/platform';
import { startPwa } from './lib/pwa';

// The in-browser preview (npm run build:demo) has no server for deep links, so it routes by #hash
const Router = import.meta.env.VITE_DEMO ? HashRouter : BrowserRouter;

// installable site: service worker (real build only) and the install offer
startPwa();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2,
    },
  },
});

/** One statistics page view for every page the visitor opens (the app never reloads) */
function PageTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    trackPage();
  }, [pathname, search]);
  return null;
}

/** Inside the Android/iOS app: back button, notification taps and kockolov.rs links open pages here */
function NativeBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    if (isApp) void import('./native/app').then((m) => m.startNativeApp((path) => navigate(path)));
  }, [navigate]);
  return null;
}

// the app reads its sign-in token from the phone before the first request
await loadAppToken();

// A page the server already drew (entry-server.tsx): start from the same data and take over its HTML.
// Everything else (the app, the preview, private pages, a page the server couldn't draw) starts empty.
const root = document.getElementById('root')!;
const ssr = (window as { __KQ__?: { q?: DehydratedState; now?: number } }).__KQ__;
const fromServer = root.dataset.ssr === 'page' && !!ssr?.q && typeof ssr.now === 'number';
if (fromServer) {
  // The server fetched the data a moment ago: date it by this browser's clock, so a clock running ahead
  // doesn't make it look old and refetch while the page is taken over.
  const shift = Date.now() - ssr.now!;
  for (const q of ssr.q!.queries) if (q.state.dataUpdatedAt) q.state.dataUpdatedAt += shift;
  hydrate(queryClient, ssr.q!);
  // the server's clock until the page is taken over (ClockRelease), so relative times match its HTML
  freezeClock(ssr.now!);
}

/** Back to the real clock once the server's page has been taken over */
function ClockRelease() {
  useEffect(() => {
    freezeClock(null);
  }, []);
  return null;
}

const tree = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <NativeBridge />
        <PageTracker />
        <ClockRelease />
        <AuthProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  </StrictMode>
);
if (fromServer) hydrateRoot(root, tree);
else createRoot(root).render(tree);
