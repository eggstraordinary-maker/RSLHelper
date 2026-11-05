import React from 'react';
import { useTranslation } from 'react-i18next';

export function AccountField({ name, label, value, onChange, type = 'text', minLength, maxLength, readOnly = false }: {
  name: string; label: string; value: string; onChange?: (value: string) => void; type?: string;
  minLength?: number; maxLength?: number; readOnly?: boolean;
}) {
  return <label className="block text-sm font-medium">{label}
    <input name={name} type={type} value={value} onChange={event => onChange?.(event.target.value)}
      autoComplete={type === 'password' ? (name.includes('current') ? 'current-password' : 'new-password') : undefined}
      required minLength={minLength} maxLength={maxLength} readOnly={readOnly}
      className="mt-1 w-full p-2 border rounded-md focus-visible:outline-indigo-600" />
  </label>;
}

export function AccountFeedback({ message, failed }: { message: string; failed: boolean }) {
  const { t } = useTranslation('auth');
  return message ? <p role={failed ? 'alert' : 'status'} className={`p-3 rounded ${failed ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{t(message)}</p> : null;
}

export const actionClass = 'px-4 py-2 rounded-md border bg-indigo-600 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-indigo-600';
