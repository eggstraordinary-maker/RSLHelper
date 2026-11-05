import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '../services/api';
import { AccountField, AccountFeedback, useAccountAction, actionClass } from '../features/auth';
import PasswordReset from './PasswordReset';

export default function PasswordResetPage({ token, onBack }: { token?: string; onBack: () => void }) {
  const { t } = useTranslation('auth');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState(false);
  const [newLink, setNewLink] = useState(false);
  const action = useAccountAction();
  if (newLink) return <PasswordReset onBack={() => setNewLink(false)} />;
  return <main className="max-w-md mx-auto p-6 space-y-4 bg-white rounded-lg shadow mt-8">
    <h1 className="text-2xl font-semibold">{t('resetTitle')}</h1>
    <AccountFeedback message={!token ? 'invalidLink' : mismatch ? 'passwordMismatch' : action.message} failed={!token || mismatch || action.failed} />
    {token && !done && <form className="space-y-4" onSubmit={event => {
      event.preventDefault(); setMismatch(password !== confirmation);
      if (password !== confirmation) return;
      void action.run(() => authApi.resetPassword(token, password), 'resetSuccess', 'resetInvalid')
        .then(saved => { if (saved) { setDone(true); setPassword(''); setConfirmation(''); } });
    }}>
      <AccountField name="new-password" type="password" label={t('newPassword')} value={password} onChange={setPassword} minLength={8} maxLength={72} />
      <AccountField name="confirm-password" type="password" label={t('confirmNewPassword')} value={confirmation} onChange={setConfirmation} minLength={8} maxLength={72} />
      <p className="text-sm text-gray-600">{t('passwordRules')}</p>
      <button disabled={action.pending} className={actionClass}>{t(action.pending ? 'saving' : 'changePassword')}</button>
    </form>}
    {!done && <button type="button" onClick={() => setNewLink(true)}>{t('requestNewLink')}</button>}
    <button type="button" onClick={onBack}>{t('home')}</button>
  </main>;
}
