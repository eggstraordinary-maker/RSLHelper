import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../contexts/AuthContext';
import { useAdminUsers } from './useAdminUsers';
import { DeleteUserDialog } from './DeleteUserDialog';

function AuthorizedUsers({ currentUserId }: { currentUserId: number }) {
  const { t } = useTranslation('admin');
  const state = useAdminUsers(currentUserId);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useCallback(() => {
    if (trigger.current?.isConnected) trigger.current.focus();
    else heading.current?.focus();
  }, []);
  return <section aria-label={t('users.title')} className="min-w-0 space-y-4">
    <div className="flex flex-wrap justify-between gap-3 items-center">
      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">{t('users.title')}</h2>
      <button disabled={state.status === 'loading' || state.deleting} onClick={state.reload} className="border rounded px-4 py-2 disabled:opacity-50 focus-visible:outline-2">{t(state.status === 'error' || state.status === 'forbidden' ? 'users.retry' : 'users.refresh')}</button>
    </div>
    {state.notice && <p role="status" className="text-green-700">{t(state.notice)}</p>}
    {state.status === 'loading' && <p role="status">{t('users.loading')}</p>}
    {(state.status === 'error' || state.status === 'forbidden') && <p role="alert" className="bg-red-50 text-red-700 p-4 rounded">{t(state.status === 'forbidden' ? 'users.forbidden' : 'users.loadError')}</p>}
    {state.status === 'ready' && state.users.length === 0 && <p role="status">{t('users.empty')}</p>}
    {state.users.length > 0 && <div role="region" aria-label={t('users.table')} tabIndex={0} className="max-w-full overflow-x-auto border rounded focus-visible:outline-2">
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <caption className="sr-only">{t('users.table')}</caption>
        <thead><tr className="bg-gray-100">{['id', 'email', 'name', 'role', 'actions'].map(key => <th key={key} scope="col" className="p-3 text-left border-b">{t(`users.${key}`)}</th>)}</tr></thead>
        <tbody>{state.users.map(user => <tr key={user.id}>
          <td className="p-3 border-b">{user.id}</td>
          <td className="p-3 border-b max-w-64 break-all">{user.email}</td>
          <td className="p-3 border-b max-w-48 break-all">{user.username}</td>
          <td className="p-3 border-b">{t(user.role === 'admin' ? 'users.adminRole' : 'users.userRole')}</td>
          <td className="p-3 border-b"><button type="button"
            disabled={user.id === currentUserId || state.status !== 'ready' || state.deleting}
            aria-label={t('users.deleteNamed', { name: user.username })}
            title={user.id === currentUserId ? t('users.cannotDeleteSelf') : undefined}
            onClick={event => { trigger.current = event.currentTarget; state.requestDelete(user); }}
            className="px-3 py-2 bg-red-700 text-white rounded disabled:opacity-50 focus-visible:outline-2">
            {t(user.id === currentUserId ? 'users.yourAccount' : 'users.delete')}
          </button></td>
        </tr>)}</tbody>
      </table>
    </div>}
    <nav aria-label={t('users.pagination')} className="flex flex-wrap gap-3 items-center">
      <button disabled={state.page === 0 || state.status === 'loading' || state.deleting} onClick={() => state.move(state.page - 1)} className="px-3 py-2 border rounded disabled:opacity-50 focus-visible:outline-2">{t('users.previous')}</button>
      <span>{t('users.page', { number: state.page + 1 })}</span>
      <button disabled={!state.more || state.status !== 'ready' || state.deleting} onClick={() => state.move(state.page + 1)} className="px-3 py-2 border rounded disabled:opacity-50 focus-visible:outline-2">{t('users.next')}</button>
    </nav>
    {state.target && <DeleteUserDialog user={state.target} pending={state.deleting} error={state.deleteError}
      onCancel={state.cancelDelete} onConfirm={() => { void state.confirmDelete(); }} restoreFocus={restoreFocus} />}
  </section>;
}

export function UserAdministration() {
  const { t } = useTranslation('admin');
  const { user, isLoading } = useAuth();
  if (isLoading) return <p role="status">{t('users.loading')}</p>;
  if (!user || user.role !== 'admin') return <p role="alert">{t('users.forbidden')}</p>;
  return <AuthorizedUsers key={user.public_id} currentUserId={user.id} />;
}
