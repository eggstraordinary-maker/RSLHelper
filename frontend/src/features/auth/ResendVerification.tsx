import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../services/api';
import { useAccountAction } from './useAccountAction';
import { AccountFeedback, AccountField, actionClass } from './FormUI';

export function ResendVerification({ initialEmail = '' }: { initialEmail?: string }) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState(initialEmail);
  const action = useAccountAction();
  return <section aria-label={t('resendTitle')} className="space-y-3 border-t pt-4 mt-4">
    <h2 className="font-semibold">{t('resendTitle')}</h2>
    <AccountFeedback message={action.message} failed={action.failed} />
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); void action.run(() => authApi.resendVerification(email), 'mailSent', 'resendInvalid'); }}>
      <AccountField name="resend-email" type="email" label={t('resendEmail')} value={email} onChange={setEmail} />
      <button disabled={action.pending} className={actionClass}>{t(action.pending ? 'sending' : 'resend')}</button>
    </form>
  </section>;
}
