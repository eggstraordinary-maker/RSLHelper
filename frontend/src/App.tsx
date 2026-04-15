import React, { useState, useEffect } from 'react';
import BottomNav from './components/BottomNav';
import Dictionary from './pages/Dictionary';
import Translator from './pages/Translator';
import Learning from './pages/Learning';
import LoginPage from './pages/LogIn';
import { useAuth } from './contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './components/LanguageSwitcher';

type Tab = 'dictionary' | 'translator' | 'learning';

// Компонент страницы выбора
const AuthChoicePage: React.FC<{ onShowLogin: () => void }> = ({ onShowLogin }) => {
  const { enterGuestMode } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-20 w-20 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-2xl">
            РЖЯ
          </div>
          <h1 className="mt-6 text-3xl font-extrabold text-gray-900">
            {t('app_title')}
          </h1>
          <p className="mt-2 text-gray-600">
            {t('app_description')}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <h2 className="text-xl font-semibold text-center">{t('welcome')}!</h2>

          <div className="space-y-4">
            <button
              onClick={onShowLogin}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              {t('login')}
            </button>

            <button
              onClick={() => {
                window.location.href = '/register';
              }}
              className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              {t('register')}
            </button>
          </div>

          <div className="text-center text-sm text-gray-500">
            <p>{t('or_continue_as_guest')}</p>
            <button
              onClick={() => {
                enterGuestMode();
                // window.location.reload();
              }}
              className="mt-2 text-indigo-600 hover:text-indigo-500 font-medium"
            >
              {t('continue_as_guest')} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Основной компонент приложения
const MainApp: React.FC<{ initialTab?: Tab }> = ({ initialTab = 'dictionary' }) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [showLogin, setShowLogin] = useState(false);
  const { user, logout, isGuest } = useAuth();
  const { t } = useTranslation();

  // Если гость пытается перейти на недоступную вкладку, перенаправляем на словарь
  useEffect(() => {
    if (isGuest && tab !== 'dictionary') {
      setTab('dictionary');
    }
  }, [isGuest, tab]);

  // Определяем доступные вкладки
  const availableTabs: Tab[] = isGuest ? ['dictionary'] : ['dictionary', 'translator', 'learning'];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 flex flex-col">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold">
              РЖЯ
            </div>
            <div className="text-lg font-semibold">{t('app_title')}</div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {isGuest ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                  {t('guest_mode')}
                </span>
                <button
                  onClick={() => setShowLogin(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  {t('login')}
                </button>
                <button
                  onClick={() => {
                    logout();
                    // Выходим из гостевого режима
                    localStorage.removeItem('guest_mode');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
                >
                  {t('exit_guest_mode') || 'Выйти'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 hidden sm:inline">
                  {user?.username}
                </span>
                <button
                  onClick={logout}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
                >
                  {t('logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 pb-20">
        {isGuest && (
          <div className="mb-4 bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-400 p-4 rounded">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-amber-800">
                  <span className="font-medium">{t('guest_mode_warning')}</span>
                  <button
                    onClick={() => setShowLogin(true)}
                    className="ml-2 font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    {t('register_for_full_access')}
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <h2 className="text-xl font-bold capitalize">
            {tab === 'dictionary' && t('dictionary')}
            {tab === 'translator' && t('translator')}
            {tab === 'learning' && t('learning')}
          </h2>
        </div>

        <div className="w-full">
          {tab === 'dictionary' && <Dictionary />}
          {tab === 'translator' && !isGuest && <Translator />}
          {tab === 'learning' && !isGuest && <Learning />}
        </div>
      </main>

      <footer className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-30">
        <BottomNav
          active={tab}
          availableTabs={availableTabs}
          onChange={(t) => {
            if (isGuest && t !== 'dictionary') {
              setShowLogin(true);
              return;
            }
            setTab(t);
          }}
        />
      </footer>

      {showLogin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <LoginPage
              onClose={() => setShowLogin(false)}
              onLoginSuccess={() => {
                setShowLogin(false);
                // window.location.reload();
              }}
              onGuestMode={() => {
                // Пользователь уже в гостевом режиме, ничего не делаем
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Обёртка App
const App: React.FC = () => {
  const { user, isGuest, isLoading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="mt-4 text-lg text-gray-600">Загрузка...</div>
      </div>
    );
  }

  // 1. Авторизованный пользователь
  if (user) {
    return <MainApp />;
  }

  // 2. Гостевой режим
  if (isGuest) {
    return <MainApp initialTab="dictionary" />;
  }

  // 3. Страница выбора (не авторизован и не гость)
  return (
    <>
      <AuthChoicePage onShowLogin={() => setShowLogin(true)} />
      
      {showLogin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <LoginPage
              onClose={() => setShowLogin(false)}
              onLoginSuccess={() => {
                setShowLogin(false);
                // Успешный вход - состояние обновится автоматически через AuthContext
              }}
              onGuestMode={() => {
                // В гостевой режим из начальной страницы
                const { enterGuestMode } = useAuth();
                enterGuestMode();
                setShowLogin(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default App;