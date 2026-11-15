// @vitest-environment jsdom
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import MockAdapter from 'axios-mock-adapter';
import App from '../App';
import { AuthProvider } from '../contexts/AuthContext';
import { apiClient, publicApiClient, clearSessionTokens, setSessionTokens } from '../services/apiClient';
import { testUser, tokens, deferred } from '../../test-utils/accounts';
import ru from '../locales/ru/common.json';
import en from '../locales/en/common.json';
import ruAuth from '../locales/ru/auth.json';
import enAuth from '../locales/en/auth.json';
import { returnPath } from './returnPath';

vi.mock('../pages/Dictionary', () => ({ default: () => <h2>dictionary-content</h2> }));
vi.mock('../pages/Learning', () => ({ default: () => <h2>learning-content</h2> }));
vi.mock('../pages/Translator', () => ({ default: () => <h2>translator-content</h2> }));
vi.mock('../pages/AdminPage', () => ({ default: () => <h2>admin-content</h2> }));
vi.mock('../pages/Profile', () => ({ default: () => <h2>profile-content</h2> }));

const api = new MockAdapter(apiClient);
const publicApi = new MockAdapter(publicApiClient);
async function show(path: string, language: 'ru' | 'en' = 'ru', state?: unknown) {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({ lng: language, fallbackLng: 'ru', defaultNS: 'common',
    resources: { ru: { common: ru, auth: ruAuth }, en: { common: en, auth: enAuth } }, interpolation: { escapeValue: false } });
  const router = createMemoryRouter([{ path: '*', element: <AuthProvider><App /></AuthProvider> }],
    { initialEntries: [{ pathname: path, state }] });
  const view = render(<I18nextProvider i18n={i18n}><RouterProvider router={router} /></I18nextProvider>);
  return { router, ...view };
}
beforeEach(() => { localStorage.clear(); clearSessionTokens(); api.reset(); publicApi.reset(); publicApi.onPost('/auth/logout').reply(200, {}); });
afterEach(cleanup);
afterAll(() => { api.restore(); publicApi.restore(); });

describe('application routes', () => {
  it('enters the dictionary as guest and restores the same URL after remount', async () => {
    const first = await show('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Продолжить без регистрации →' }));
    await screen.findByText('dictionary-content');
    expect(first.router.state.location.pathname).toBe('/dictionary');
    expect(localStorage.getItem('guest_mode')).toBe('true');
    const navigation = screen.getByRole('navigation', { name: ru.navigation });
    expect(navigation.querySelectorAll('a').length).toBe(1);
    first.unmount();
    const second = await show('/dictionary');
    await screen.findByText('dictionary-content');
    expect(second.router.state.location.pathname).toBe('/dictionary');
  });

  it.each(['/learning', '/translator', '/profile', '/admin'])('requires login for direct guest access to %s', async path => {
    localStorage.setItem('guest_mode', 'true');
    const { router } = await show(path);
    await screen.findByRole('button', { name: ru.login });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: path });
    expect(screen.queryByText(path.slice(1) + '-content')).toBeNull();
  });

  it.each(['/learning', '/translator', '/profile'])('returns to %s after a real provider login', async path => {
    const { router } = await show(path);
    publicApi.onPost('/auth/login').reply(200, tokens);
    api.onGet('/users/me').reply(200, testUser);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: testUser.email } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'RouteTest8' } });
    fireEvent.click(screen.getByRole('button', { name: ru.login }));
    await screen.findByText(path.slice(1) + '-content');
    expect(router.state.location.pathname).toBe(path);
  });

  it('waits for session restoration and retries a session failure without losing the deep link', async () => {
    setSessionTokens(tokens);
    const pending = deferred(); api.onGet('/users/me').replyOnce(() => pending.promise);
    const { router } = await show('/admin');
    expect(screen.queryByText('admin-content')).toBeNull();
    expect(router.state.location.pathname).toBe('/admin');
    await act(async () => { pending.resolve([503, {}]); });
    await screen.findByRole('alert');
    expect(router.state.location.pathname).toBe('/admin');
    api.onGet('/users/me').reply(200, { ...testUser, role: 'admin' });
    fireEvent.click(screen.getByRole('button', { name: ruAuth.retry }));
    await screen.findByText('admin-content');
  });

  it('denies ordinary users the admin route and does not mount its page', async () => {
    setSessionTokens(tokens); api.onGet('/users/me').reply(200, testUser);
    const { router } = await show('/admin');
    expect((await screen.findByRole('alert')).textContent).toBe(ru.accessDenied);
    expect(screen.queryByText('admin-content')).toBeNull();
    expect(router.state.location.pathname).toBe('/admin');
  });

  it('updates URL, active link and focus through navigation and Back/Forward', async () => {
    setSessionTokens(tokens); api.onGet('/users/me').reply(200, testUser);
    const { router } = await show('/dictionary');
    await screen.findByText('dictionary-content');
    fireEvent.click(screen.getByRole('link', { name: ru.learning }));
    await screen.findByText('learning-content');
    expect(router.state.location.pathname).toBe('/learning');
    expect(screen.getByRole('link', { name: ru.learning }).getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: ru.learning }));
    await act(async () => { await router.navigate(-1); });
    await screen.findByText('dictionary-content');
    await act(async () => { await router.navigate(1); });
    await screen.findByText('learning-content');
    expect(router.state.location.pathname).toBe('/learning');
  });

  it('removes private content on logout and guards a history return', async () => {
    setSessionTokens(tokens); api.onGet('/users/me').reply(200, testUser);
    const { router } = await show('/dictionary');
    fireEvent.click(await screen.findByRole('link', { name: ru.learning }));
    await screen.findByText('learning-content');
    fireEvent.click(screen.getByRole('link', { name: ru.translator }));
    await screen.findByText('translator-content');
    fireEvent.click(screen.getByRole('button', { name: ru.logout }));
    await screen.findByRole('button', { name: ru.login });
    expect(screen.queryByText('learning-content')).toBeNull();
    await act(async () => { await router.navigate(-1); });
    await screen.findByRole('button', { name: ru.login });
    expect(router.state.location.pathname).toBe('/login');
  });

  it.each(['ru', 'en'] as const)('shows an explicit unknown-route page in %s', async language => {
    const { router } = await show('/missing-route', language);
    const strings = language === 'ru' ? ru : en;
    expect((await screen.findByRole('heading')).textContent).toBe(strings.notFound);
    fireEvent.click(screen.getByRole('link', { name: strings.dictionary }));
    await screen.findByText('dictionary-content');
    expect(router.state.location.pathname).toBe('/dictionary');
  });

  it('redirects signed-in root and login URLs to the dictionary', async () => {
    setSessionTokens(tokens); api.onGet('/users/me').reply(200, testUser);
    const { router } = await show('/');
    await screen.findByText('dictionary-content');
    await act(async () => { await router.navigate('/login'); });
    await waitFor(() => expect(router.state.location.pathname).toBe('/dictionary'));
  });
});

describe('post-login destination', () => {
  it.each([null, {}, { from: 5 }, { from: '//external.example' }, { from: 'https://external.example/learning' },
    { from: '/login' }, { from: '/unknown' }, { from: 'http://[' }])('rejects an unsupported destination %#', state => {
    expect(returnPath(state)).toBe('/dictionary');
  });
  it('keeps a local section query while dropping fragments', () => {
    expect(returnPath({ from: '/learning?mode=repeat#private-canary' })).toBe('/learning?mode=repeat');
    expect(returnPath({ from: '/Learning' })).toBe('/learning');
  });
});
