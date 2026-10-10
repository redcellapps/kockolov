import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, useNavigate } from 'react-router';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <NativeBridge />
        <AuthProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  </StrictMode>,
);
