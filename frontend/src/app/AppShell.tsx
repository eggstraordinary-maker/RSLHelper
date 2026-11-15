import React, { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BottomNav, { type Tab } from '../components/BottomNav';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useAuth } from '../contexts/AuthContext';
import { SessionStatus } from '../features/auth';

const labels = { dictionary: 'dictionary', learning: 'learning', translator: 'translator', admin: 'admin_panel' };

export function AppShell() {
  const { user, logout, isLoading, sessionError } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const active = location.pathname.split('/')[1].toLowerCase() as Tab;
  useEffect(() => { heading.current?.focus(); }, [location.pathname, isLoading, sessionError]);
  if (isLoading || sessionError) return <SessionStatus />;
  const availableTabs: Tab[] = user ? ['dictionary', 'translator', 'learning'] : ['dictionary'];
  if (user?.role === 'admin') availableTabs.push('admin');
  const leave = () => { logout(); navigate(user ? '/login' : '/', { replace: true }); };
  return <div className="min-h-screen bg-gray-50 text-gray-800 flex flex-col">
    <header className="bg-white shadow-xs"><div className="container mx-auto px-4 py-4 flex flex-wrap justify-between gap-3">
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center text-white font-bold">РЖЯ</div>
        <Link to="/dictionary" className="text-lg font-semibold">{t('app_title')}</Link>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <LanguageSwitcher />
        {user ? <>
          <Link to="/profile" className="max-w-44 truncate text-indigo-600" title={user.username}>{user.username}</Link>
          <button className="px-4 py-2 rounded-md bg-gray-200" onClick={leave}>{t('logout')}</button>
        </> : <>
          <span className="text-sm text-amber-600">{t('guest_mode')}</span>
          <Link className="px-4 py-2 rounded-md bg-indigo-600 text-white" to="/login" state={{ from: location.pathname }}>{t('login')}</Link>
          <button className="px-4 py-2 rounded-md bg-gray-200" onClick={leave}>{t('exit_guest_mode')}</button>
        </>}
      </div>
    </div></header>
    <main className="flex-1 container mx-auto px-4 py-6 pb-24">
      {!user && <p className="mb-4 p-4 rounded bg-amber-50 text-amber-800"><span>{t('guest_mode_warning')}</span>{' '}
        <Link to="/register" className="text-indigo-600">{t('register_for_full_access')}</Link>
      </p>}
      <h1 ref={heading} tabIndex={-1} className="text-xl font-bold mb-4 focus:outline-none">{t(labels[active])}</h1>
      <Outlet />
    </main>
    <footer className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-30">
      <BottomNav availableTabs={availableTabs} />
    </footer>
  </div>;
}
