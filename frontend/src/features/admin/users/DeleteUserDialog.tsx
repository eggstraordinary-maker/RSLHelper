import React, { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '../../../types/api';

export function DeleteUserDialog({ user, pending, error, onCancel, onConfirm, restoreFocus }: {
  user: User; pending: boolean; error: string; onCancel: () => void; onConfirm: () => void; restoreFocus: () => void;
}) {
  const { t } = useTranslation('admin');
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const title = useId();
  const description = useId();
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    cancel.current?.focus();
    return () => { element.close(); restoreFocus(); };
  }, [restoreFocus]);
  return <dialog ref={dialog} aria-labelledby={title} aria-describedby={description}
    className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-lg p-6 backdrop:bg-black/50 space-y-4"
    onCancel={event => { event.preventDefault(); if (!pending) onCancel(); }}>
    <h3 id={title} className="text-lg font-semibold">{t('users.confirmTitle')}</h3>
    <p className="break-all">{user.username} — {user.email}</p>
    <p id={description}>{t('users.confirmDescription')}</p>
    {error && <p role="alert" className="text-red-700">{t(error)}</p>}
    {pending && <p role="status">{t('users.deleting')}</p>}
    <div className="flex flex-wrap gap-3">
      <button ref={cancel} type="button" disabled={pending} onClick={onCancel} className="border rounded px-4 py-2 disabled:opacity-50 focus-visible:outline-2">{t('users.cancel')}</button>
      <button type="button" disabled={pending} onClick={onConfirm} className="bg-red-700 text-white rounded px-4 py-2 disabled:opacity-50 focus-visible:outline-2">{t(pending ? 'users.deleting' : 'users.confirm')}</button>
    </div>
  </dialog>;
}
