import React, { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import { RequireSession, SessionStatus } from './features/auth';
import { AppShell } from './app/AppShell';
import { returnPath } from './app/returnPath';
import Dictionary from './pages/Dictionary';
import Learning from './pages/Learning';
import Translator from './pages/Translator';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LogIn';
import Register from './pages/Register';
import EmailVerification from './pages/EmailVerification';
import PasswordResetPage from './pages/PasswordResetPage';
import Profile from './pages/Profile';

function Landing() {
  const { user, isGuest, isLoading, sessionError, enterGuestMode } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  if (isLoading || sessionError) return <SessionStatus />;
  if (user || isGuest) return <Navigate to="/dictionary" replace />;
  return <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
    <div className="max-w-md w-full space-y-8 text-center">
      <h1 className="text-3xl font-extrabold">{t('app_title')}</h1>
      <p className="text-gray-600">{t('app_description')}</p>
      <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <h2 className="text-xl font-semibold">{t('welcome')}!</h2>
        <Link to="/login" className="block py-3 rounded-md bg-indigo-600 text-white">{t('login')}</Link>
        <Link to="/register" className="block py-3 rounded-md border">{t('register')}</Link>
        <p className="text-sm text-gray-500">{t('or_continue_as_guest')}</p>
        <button className="text-indigo-600" onClick={() => { enterGuestMode(); navigate('/dictionary'); }}>
          {t('continue_as_guest')} →
        </button>
      </div>
    </div>
  </main>;
}

function LoginRoute() {
  const { user, isLoading, sessionError, enterGuestMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const destination = returnPath(location.state);
  if (isLoading || sessionError) return <SessionStatus />;
  if (user) return <Navigate to={destination} replace />;
  return <main className="max-w-md mx-auto p-4">
    <LoginPage onClose={() => navigate('/')} onLoginSuccess={() => undefined}
      onGuestMode={() => { enterGuestMode(); navigate('/dictionary', { replace: true }); }} />
  </main>;
}

function PasswordResetWrapper() {
  const { token: pathToken } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [fragmentToken] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    if (fragmentToken) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [fragmentToken]);
  return <PasswordResetPage token={pathToken ?? fragmentToken} onBack={() => navigate('/')} />;
}

function ExitGuest() {
  const { exitGuestMode } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { exitGuestMode(); navigate('/', { replace: true }); }, [exitGuestMode, navigate]);
  return null;
}

function NotFound() {
  const { t } = useTranslation();
  return <main className="max-w-md mx-auto p-6 space-y-4">
    <h1 className="text-2xl font-semibold">{t('notFound')}</h1>
    <Link className="text-indigo-700" to="/dictionary">{t('dictionary')}</Link>
  </main>;
}

export default function App() {
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<LoginRoute />} />
    <Route element={<AppShell />}>
      <Route path="/dictionary" element={<Dictionary />} />
      <Route path="/learning" element={<RequireSession><Learning /></RequireSession>} />
      <Route path="/translator" element={<RequireSession><Translator /></RequireSession>} />
      <Route path="/admin" element={<RequireSession adminOnly><AdminPage /></RequireSession>} />
      <Route path="/admin/catalog" element={<RequireSession adminOnly><AdminPage catalog /></RequireSession>} />
    </Route>
    <Route path="/profile" element={<RequireSession><Profile /></RequireSession>} />
    <Route path="/register" element={<Register />} />
    <Route path="/verify-email" element={<EmailVerification />} />
    <Route path="/verify-email/:token" element={<EmailVerification />} />
    <Route path="/reset-password" element={<PasswordResetWrapper />} />
    <Route path="/reset-password/:token" element={<PasswordResetWrapper />} />
    <Route path="/exit-guest" element={<ExitGuest />} />
    <Route path="*" element={<NotFound />} />
  </Routes>;
}
