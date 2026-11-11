import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { AccountField, AccountFeedback, useAccountAction, actionClass } from '../features/auth';
import type { ProgressStats } from '../types/api';

export default function Profile() {
  const { t } = useTranslation('auth');
  const { user, updateProfile, changePassword, deleteAccount, getProgressStats, logout } = useAuth();
  const [name, setName] = useState(user?.username ?? '');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const profile = useAccountAction();
  const security = useAccountAction();
  const deletion = useAccountAction();
  const [stats, setStats] = useState<{ owner: string; data: ProgressStats } | null>(null);
  const [progressState, setProgressState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [revision, setRevision] = useState(0);
  const owner = user?.public_id;
  useEffect(() => {
    let active = true;
    if (!owner) return;
    setProgressState('loading');
    getProgressStats().then(data => {
      if (active) { setStats({ owner, data }); setProgressState('ready'); }
    }, () => { if (active) setProgressState('error'); });
    return () => { active = false; };
  }, [owner, getProgressStats, revision]);
  const progress = stats?.owner === user?.public_id ? stats?.data : null;
  if (!user) return null;
  return <main className="max-w-2xl mx-auto p-4 space-y-6">
    <nav className="flex flex-wrap gap-4"><Link to="/">{t('home')}</Link><button onClick={logout}>{t('logout')}</button></nav>
    <h1 className="text-2xl font-semibold">{t('profileTitle')}</h1>
    <section aria-label={t('progressTitle')} className="p-4 border rounded-lg space-y-3">
      <h2 className="font-semibold">{t('progressTitle')}</h2>
      {progressState === 'loading' && <p role="status">{t('loading')}</p>}
      {progressState === 'error' && <><p role="alert">{t('progressError')}</p><button onClick={() => setRevision(value => value + 1)}>{t('retry')}</button></>}
      {progress && <><p>{t('progressCount', { completed: progress.completed_lessons, total: progress.total_lessons })}</p>
        <p>{t('progressPercent', { value: Math.round(progress.completed_percentage) })}</p>
        <ul>{progress.recent_lessons.map((lesson, index) => <li key={index}>{lesson}</li>)}</ul></>}
    </section>
    <section className="p-4 border rounded-lg space-y-4">
      <h2 className="font-semibold">{t('profileTitle')}</h2>
      <AccountFeedback message={profile.message} failed={profile.failed} />
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void profile.run(() => updateProfile({ username: name }), 'profileSaved', 'identityConflict'); }}>
        <AccountField name="username" label={t('name')} value={name} onChange={setName} minLength={3} maxLength={50} />
        <AccountField name="email" type="email" label={t('email')} value={user.email} readOnly />
        <button disabled={profile.pending} className={actionClass}>{t(profile.pending ? 'saving' : 'save')}</button>
      </form>
    </section>
    <section className="p-4 border rounded-lg space-y-4">
      <h2 className="font-semibold">{t('changePassword')}</h2>
      <AccountFeedback message={mismatch ? 'passwordMismatch' : security.message} failed={mismatch || security.failed} />
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault(); setMismatch(password !== confirmation);
        if (password !== confirmation) return;
        void security.run(() => changePassword(current, password), 'passwordChanged', 'passwordInvalid').then(saved => {
          if (saved) { setCurrent(''); setPassword(''); setConfirmation(''); }
        });
      }}>
        <AccountField name="current-password" type="password" label={t('currentPassword')} value={current} onChange={setCurrent} />
        <AccountField name="new-password" type="password" label={t('newPassword')} value={password} onChange={setPassword} minLength={8} maxLength={72} />
        <AccountField name="confirm-password" type="password" label={t('confirmNewPassword')} value={confirmation} onChange={setConfirmation} minLength={8} maxLength={72} />
        <p className="text-sm text-gray-600">{t('passwordRules')}</p>
        <button disabled={security.pending} className={actionClass}>{t(security.pending ? 'saving' : 'changePassword')}</button>
      </form>
    </section>
    <section className="p-4 border border-red-300 rounded-lg space-y-4">
      <h2 className="font-semibold">{t('deleteAccount')}</h2>
      <p>{t('deleteWarning')}</p>
      {!deleting ? <button onClick={() => setDeleting(true)}>{t('deleteAccount')}</button> : <form className="space-y-3" onSubmit={event => {
        event.preventDefault(); void deletion.run(() => deleteAccount(deletePassword), 'accountDeleted', 'passwordInvalid');
      }}>
        <AccountFeedback message={deletion.message} failed={deletion.failed} />
        <AccountField name="current-delete-password" type="password" label={t('confirmDeletePassword')} value={deletePassword} onChange={setDeletePassword} />
        <button disabled={deletion.pending} className={actionClass}>{t(deletion.pending ? 'saving' : 'confirmDelete')}</button>
        <button type="button" disabled={deletion.pending} onClick={() => { setDeleting(false); setDeletePassword(''); }}>{t('cancel')}</button>
      </form>}
    </section>
  </main>;
}
