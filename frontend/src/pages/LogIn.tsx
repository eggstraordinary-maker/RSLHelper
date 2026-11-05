import React, { useState } from "react";
import PasswordReset from "./PasswordReset";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from 'react-i18next';
import { AccountFeedback, useAccountAction, ResendVerification } from '../features/auth';

interface LoginProps {
  onClose: () => void;
  onLoginSuccess: () => void;
  onGuestMode: () => void;
}

const LoginPage: React.FC<LoginProps> = ({ onClose, onLoginSuccess, onGuestMode }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const action = useAccountAction();
  const { login } = useAuth();
  const { t } = useTranslation(['auth', 'common']);

  if (showForgot) return <PasswordReset onBack={() => setShowForgot(false)} />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await action.run(() => login(username, password), '', 'loginInvalid')) onLoginSuccess();
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 rounded-xl shadow-lg bg-white">
      <h2 className="text-2xl font-semibold mb-4">{t('auth:login_title')}</h2>

      <AccountFeedback message={action.message} failed={action.failed} />

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block mb-1">{t('auth:email')}</label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="username"
            className="w-full p-2 border rounded-md"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('auth:email')}
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block mb-1">{t('auth:password')}</label>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full p-2 border rounded-md"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth:password')}
          />
        </div>

        <button
          type="submit"
          disabled={action.pending}
          className="w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition"
        >
          {t(action.pending ? 'auth:sending' : 'common:login')}
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowForgot(true)}
            className="w-full py-2 bg-gray-200 text-black rounded-md hover:bg-gray-300 transition"
          >
            {t('auth:forgot_password') || "Забыли пароль?"}
          </button>
          
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-gray-200 text-black rounded-md hover:bg-gray-300 transition"
          >
            {t('common:cancel') || "Отмена"}
          </button>
        </div>
      </form>
      <ResendVerification initialEmail={username} />
      <button type="button" onClick={onGuestMode} className="mt-4 text-indigo-700">{t('common:continue_as_guest')}</button>

      <div className="mt-6 text-center space-y-3">
        <div className="text-sm text-gray-600">
          {t('auth:no_account')}{' '}
          <button
            type="button"
            onClick={() => {
              onClose();
              window.location.href = '/register';
            }}
            className="text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {t('auth:register_here')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
