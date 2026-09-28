import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import AccountPage from './pages/Account';
import AdminPage from './pages/Admin';
import Home from './pages/Home';
import LoginPage from './pages/Login';
import { DealsPage, NotFoundPage, ThemesPage, WatchlistPage } from './pages/Other';
import SearchPage from './pages/Search';
import SetDetail from './pages/SetDetail';

/** While the site is private, every page except login needs a session. */
function Gate({ children, needUser, needAdmin }: { children: ReactNode; needUser?: boolean; needAdmin?: boolean }) {
  const { user, publicMode, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!user && (needUser || needAdmin || !publicMode)) {
    return <Navigate to="/prijava" replace state={{ from: loc.pathname + loc.search }} />;
  }
  if (needAdmin && user?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Login/registration page; once signed in, continue to the page the user originally wanted. */
function LoginRoute() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (!loading && user) {
    const from = (loc.state as { from?: string } | null)?.from;
    return <Navigate to={from && !from.startsWith('/prijava') ? from : '/'} replace />;
  }
  return <LoginPage />;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/prijava" element={<LoginRoute />} />
        <Route path="/registracija" element={<LoginRoute />} />
        <Route path="/" element={<Gate><Home /></Gate>} />
        <Route path="/pretraga" element={<Gate><SearchPage /></Gate>} />
        <Route path="/ponude" element={<Gate><DealsPage /></Gate>} />
        <Route path="/teme" element={<Gate><ThemesPage /></Gate>} />
        <Route path="/set/:setNum" element={<Gate><SetDetail /></Gate>} />
        <Route path="/pracenje" element={<Gate needUser><WatchlistPage /></Gate>} />
        <Route path="/nalog" element={<Gate needUser><AccountPage /></Gate>} />
        <Route path="/admin" element={<Gate needAdmin><AdminPage /></Gate>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}
