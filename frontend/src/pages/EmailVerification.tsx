import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { authApi } from '../services/api';
import { AccountFeedback, ResendVerification, actionClass } from '../features/auth';

export default function EmailVerification() {
  const { t } = useTranslation('auth');
  const { token: pathToken } = useParams<{ token: string }>();
  const [fragment] = useState(() => window.location.hash.slice(1));
  const token = pathToken ?? fragment;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState('verifying');
  const flight = useRef<{ token: string; promise: Promise<unknown> }>();
  useEffect(() => {
    if (fragment) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [fragment]);
  useEffect(() => {
    let active = true;
    if (!token) { setState('invalidLink'); return; }
    setState('verifying');
    if (!flight.current || flight.current.token !== token) flight.current = { token, promise: authApi.verifyEmail(token) };
    flight.current.promise.then(() => { if (active) setState('verifySuccess'); }, error => {
      if (active) setState(axios.isAxiosError(error) && error.response?.status === 400 ? 'invalidLink' : 'networkError');
    });
    return () => { active = false; };
  }, [token, revision]);
  return <main className="max-w-md mx-auto p-6 space-y-4 bg-white rounded-lg shadow mt-8">
    <h1 className="text-2xl font-semibold">{t('verifyTitle')}</h1>
    <AccountFeedback message={state} failed={state === 'invalidLink' || state === 'networkError'} />
    {state === 'networkError' && <button className={actionClass} onClick={() => { flight.current = undefined; setRevision(value => value + 1); }}>{t('retry')}</button>}
    {state === 'invalidLink' && <ResendVerification />}
    <Link className="block text-indigo-700" to="/">{t('home')}</Link>
  </main>;
}
