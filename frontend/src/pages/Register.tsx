import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { AccountField, AccountFeedback, ResendVerification, useAccountAction, actionClass } from '../features/auth';

export default function Register() {
  const { t } = useTranslation('auth');
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [created, setCreated] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const action = useAccountAction();
  return <main className="max-w-md mx-auto p-6 space-y-4 bg-white rounded-lg shadow mt-8">
    <h1 className="text-2xl font-semibold">{t('registerTitle')}</h1>
    <AccountFeedback message={mismatch ? 'passwordMismatch' : action.message} failed={mismatch || action.failed} />
    {!created && <form className="space-y-4" onSubmit={event => {
      event.preventDefault(); setMismatch(password !== confirmation);
      if (password !== confirmation) return;
      void action.run(() => register(name, email, password), 'registerSuccess', 'identityConflict', error => {
        if (axios.isAxiosError(error) && error.response?.data?.detail?.account_created === true) {
          setCreated(true); setPassword(''); setConfirmation('');
        }
      }).then(saved => { if (saved) { setCreated(true); setPassword(''); setConfirmation(''); } });
    }}>
      <AccountField name="name" label={t('name')} value={name} onChange={setName} minLength={3} maxLength={50} />
      <AccountField name="email" type="email" label={t('email')} value={email} onChange={setEmail} />
      <AccountField name="password" type="password" label={t('password')} value={password} onChange={setPassword} minLength={8} maxLength={72} />
      <AccountField name="confirm-password" type="password" label={t('confirm_password')} value={confirmation} onChange={setConfirmation} minLength={8} maxLength={72} />
      <p className="text-sm text-gray-600">{t('passwordRules')}</p>
      <button disabled={action.pending} className={actionClass}>{t(action.pending ? 'sending' : 'registerSubmit')}</button>
    </form>}
    {created && <p role="status">{t('accountCreated')}</p>}
    <ResendVerification initialEmail={email} key={created ? email : 'initial'} />
    <Link className="block text-indigo-700" to="/">{t('home')}</Link>
  </main>;
}
