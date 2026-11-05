import React from 'react';
import { Navigate } from 'react-router-dom';
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

export function RequireSession({ children }: { children: React.ReactNode }) {
  const { user, isLoading, sessionError } = useAuth();
  if (isLoading || sessionError) return <SessionStatus />;
  if (!user) return <Navigate to="/" replace />;
  return <React.Fragment key={user.public_id}>{children}</React.Fragment>;
}
