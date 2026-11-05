import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '../services/api';
import { AccountField, AccountFeedback, useAccountAction, actionClass } from '../features/auth';

export default function PasswordReset({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const action = useAccountAction();
  return <section className="max-w-md mx-auto p-6 space-y-4">
    <h1 className="text-2xl font-semibold">{t('forgotTitle')}</h1>
    <AccountFeedback message={action.message} failed={action.failed} />
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void action.run(() => authApi.requestPasswordReset(email), 'resetRequested'); }}>
      <AccountField name="reset-email" type="email" label={t('email')} value={email} onChange={setEmail} />
      <button disabled={action.pending} className={actionClass}>{t(action.pending ? 'sending' : 'requestReset')}</button>
    </form>
    <button type="button" onClick={onBack}>{t('back')}</button>
  </section>;
}
