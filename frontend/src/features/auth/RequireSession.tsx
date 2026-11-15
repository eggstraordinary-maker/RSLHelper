import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

export function SessionStatus() {
  const { isLoading, retrySession, logout } = useAuth();
  const { t } = useTranslation('auth');
  return <div className="p-6 space-y-4">
    <p role={isLoading ? 'status' : 'alert'}>{t(isLoading ? 'loading' : 'sessionError')}</p>
    {!isLoading && <><button onClick={retrySession}>{t('retry')}</button><button onClick={logout}>{t('logout')}</button></>}
  </div>;
}

export function RequireSession({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isLoading, sessionError } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  if (isLoading || sessionError) return <SessionStatus />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (adminOnly && user.role !== 'admin') return <section className="space-y-4">
    <p role="alert">{t('accessDenied')}</p>
    <Link className="text-indigo-700" to="/dictionary">{t('dictionary')}</Link>
  </section>;
  return <React.Fragment key={user.public_id}>{children}</React.Fragment>;
}
