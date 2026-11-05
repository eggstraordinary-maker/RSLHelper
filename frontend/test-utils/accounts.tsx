import React from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import ru from '../src/locales/ru/auth.json';
import en from '../src/locales/en/auth.json';
import ruCommon from '../src/locales/ru/common.json';
import enCommon from '../src/locales/en/common.json';
import ruAdmin from '../src/locales/ru/admin.json';
import enAdmin from '../src/locales/en/admin.json';

export const accountStrings = { ru, en };
export async function accountWrapper(language: 'ru' | 'en' = 'ru') {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({ lng: language, fallbackLng: 'ru', defaultNS: 'common',
    resources: { ru: { auth: ru, common: ruCommon, admin: ruAdmin }, en: { auth: en, common: enCommon, admin: enAdmin } },
    interpolation: { escapeValue: false },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <I18nextProvider i18n={i18n}><MemoryRouter>{children}</MemoryRouter></I18nextProvider>;
  };
}
export const testUser = { id: 1, public_id: '11111111-1111-4111-8111-111111111111', email: 'learner@example.com',
  username: 'learner', role: 'user' as const, is_verified: true, created_at: '2026-11-06T00:00:00Z' };
export const tokens = { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer' };
export const deferred = () => {
  let resolve!: (value: [number, unknown]) => void;
  const promise = new Promise<[number, unknown]>(done => { resolve = done; });
  return { promise, resolve };
};
