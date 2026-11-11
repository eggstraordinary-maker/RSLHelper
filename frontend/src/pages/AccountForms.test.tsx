// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import MockAdapter from 'axios-mock-adapter';
import { accountWrapper, accountStrings, deferred, testUser, tokens } from '../../test-utils/accounts';
import { apiClient, publicApiClient, clearSessionTokens, setSessionTokens } from '../services/apiClient';
import { AuthProvider } from '../contexts/AuthContext';
import { RequireSession } from '../features/auth';
import Register from './Register';
import PasswordReset from './PasswordReset';
import PasswordResetPage from './PasswordResetPage';
import EmailVerification from './EmailVerification';
import Profile from './Profile';
import App from '../App';

const api = new MockAdapter(apiClient);
const publicApi = new MockAdapter(publicApiClient);
const strings = accountStrings.ru;
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function show(content: React.ReactNode, language: 'ru' | 'en' = 'ru') {
  const Wrapper = await accountWrapper(language);
  return render(<Wrapper><AuthProvider>{content}</AuthProvider></Wrapper>);
}
beforeEach(() => { localStorage.clear(); clearSessionTokens(); api.reset(); publicApi.reset(); window.history.replaceState(null, '', '/'); });
afterEach(cleanup);
afterAll(() => { api.restore(); publicApi.restore(); });

describe('account forms', () => {
  it('prevents duplicate registration and recovers after account-created SMTP failure', async () => {
    const pending = deferred(); publicApi.onPost('/auth/register').reply(() => pending.promise);
    publicApi.onPost('/auth/resend-verification').reply(200, {});
    await show(<Register />);
    change(strings.name, 'learner'); change(strings.email, 'learner@example.com');
    change(strings.password, 'GoodPass8'); change(strings.confirm_password, 'GoodPass8');
    const submit = screen.getByRole('button', { name: strings.registerSubmit });
    fireEvent.click(submit); fireEvent.submit(submit.closest('form')!);
    expect((screen.getByRole('button', { name: strings.sending }) as HTMLButtonElement).disabled).toBe(true);
    expect(publicApi.history.post).toHaveLength(1);
    await act(async () => { pending.resolve([503, { detail: { code: 'verification_delivery_unavailable', account_created: true } }]); });
    expect(screen.getByRole('alert').textContent).toBe(strings.networkError);
    expect(screen.getByText(strings.accountCreated)).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings.registerSubmit })).toBeNull();
    expect((screen.getByLabelText(strings.resendEmail) as HTMLInputElement).value).toBe('learner@example.com');
    fireEvent.click(screen.getByRole('button', { name: strings.resend }));
    await screen.findByText(strings.mailSent);
    expect(publicApi.history.post.filter(call => call.url === '/auth/register')).toHaveLength(1);
  });

  it.each(['ru', 'en'] as const)('validates password mismatch and shows registration success in %s', async language => {
    const t = accountStrings[language]; publicApi.onPost('/auth/register').reply(200, testUser);
    await show(<Register />, language);
    change(t.name, 'learner'); change(t.email, 'learner@example.com');
    change(t.password, 'GoodPass8'); change(t.confirm_password, 'OtherPass8');
    fireEvent.click(screen.getByRole('button', { name: t.registerSubmit }));
    expect(screen.getByRole('alert').textContent).toBe(t.passwordMismatch);
    expect(publicApi.history.post).toHaveLength(0);
    change(t.confirm_password, 'GoodPass8'); fireEvent.click(screen.getByRole('button', { name: t.registerSubmit }));
    await screen.findByText(t.registerSuccess);
  });

  it('does not report a reset email as sent when the request fails and allows retry', async () => {
    publicApi.onPost('/auth/forgot-password').replyOnce(503); publicApi.onPost('/auth/forgot-password').reply(200, {});
    await show(<PasswordReset onBack={() => undefined} />);
    change(strings.email, 'learner@example.com'); fireEvent.click(screen.getByRole('button', { name: strings.requestReset }));
    expect((await screen.findByRole('alert')).textContent).toBe(strings.networkError);
    expect(screen.queryByText(strings.resetRequested)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: strings.requestReset }));
    await screen.findByText(strings.resetRequested);
  });

  it('distinguishes schema validation from an identity conflict without exposing response details', async () => {
    publicApi.onPost('/auth/register').reply(422, { detail: [{ msg: 'Internal validation payload' }] });
    await show(<Register />);
    change(strings.name, 'learner'); change(strings.email, 'learner@example.com');
    change(strings.password, 'weakpass'); change(strings.confirm_password, 'weakpass');
    fireEvent.click(screen.getByRole('button', { name: strings.registerSubmit }));
    expect((await screen.findByRole('alert')).textContent).toBe(strings.validationError);
    expect(screen.queryByText('Internal validation payload')).toBeNull();
  });

  it('guards duplicate reset submissions and offers a new link after invalid token', async () => {
    const pending = deferred(); publicApi.onPost('/auth/reset-password').reply(() => pending.promise);
    await show(<PasswordResetPage token="test-only-credential" onBack={() => undefined} />);
    change(strings.newPassword, 'NewPass88'); change(strings.confirmNewPassword, 'NewPass88');
    fireEvent.click(screen.getByRole('button', { name: strings.changePassword }));
    fireEvent.submit(screen.getByRole('button', { name: strings.saving }).closest('form')!);
    expect(publicApi.history.post).toHaveLength(1);
    await act(async () => { pending.resolve([400, {}]); });
    expect(screen.getByRole('alert').textContent).toBe(strings.resetInvalid);
    fireEvent.click(screen.getByRole('button', { name: strings.requestNewLink }));
    expect(screen.getByRole('heading', { name: strings.forgotTitle })).toBeTruthy();
  });

  it('distinguishes temporary verification errors, retries once under StrictMode and clears the fragment', async () => {
    window.history.replaceState(null, '', '/verify-email#test-only-credential');
    publicApi.onPost('/auth/verify-email').replyOnce(503); publicApi.onPost('/auth/verify-email').reply(200, {});
    await show(<StrictMode><EmailVerification /></StrictMode>);
    expect((await screen.findByRole('alert')).textContent).toBe(strings.networkError);
    expect(window.location.hash).toBe('');
    expect(publicApi.history.post).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: strings.retry }));
    await screen.findByText(strings.verifySuccess);
    expect(publicApi.history.post).toHaveLength(2);
  });

  it('provides resend for an expired verification link', async () => {
    window.history.replaceState(null, '', '/verify-email#expired-test-only');
    publicApi.onPost('/auth/verify-email').reply(400);
    await show(<EmailVerification />);
    expect((await screen.findByRole('alert')).textContent).toBe(strings.invalidLink);
    expect(screen.getByRole('button', { name: strings.resend })).toBeTruthy();
  });
});

describe('profile and guest flow', () => {
  const stats = { total_lessons: 2, completed_lessons: 1, completed_percentage: 50, recent_lessons: ['Hello'], unresolved_legacy_records: 0 };
  it('redirects an anonymous profile without exposing its forms', async () => {
    await show(<Routes><Route path="/" element={<RequireSession><Profile /></RequireSession>} /></Routes>);
    await waitFor(() => expect(screen.queryByText(strings.loading)).toBeNull());
    expect(screen.queryByRole('heading', { name: strings.profileTitle })).toBeNull();
    expect(api.history.get).toHaveLength(0);
  });

  it('retries progress, saves profile with pending protection and keeps password success visible', async () => {
    setSessionTokens(tokens); api.onGet('/users/me').reply(200, testUser);
    api.onGet('/progress/stats').replyOnce(503); api.onGet('/progress/stats').reply(200, stats);
    const pending = deferred(); api.onPut('/users/me').reply(() => pending.promise);
    api.onPost('/auth/change-password').reply(200, {});
    await show(<RequireSession><Profile /></RequireSession>);
    await screen.findByText(strings.progressError); fireEvent.click(screen.getByRole('button', { name: strings.retry }));
    await screen.findByText('Пройдено уроков: 1 / 2');
    change(strings.name, 'new_name'); fireEvent.click(screen.getByRole('button', { name: strings.save }));
    fireEvent.submit(screen.getByRole('button', { name: strings.saving }).closest('form')!);
    await waitFor(() => expect(api.history.put).toHaveLength(1));
    await act(async () => { pending.resolve([200, { ...testUser, username: 'new_name' }]); });
    await screen.findByText(strings.profileSaved);
    change(strings.currentPassword, 'GoodPass8'); change(strings.newPassword, 'NewPass88'); change(strings.confirmNewPassword, 'NewPass88');
    fireEvent.click(screen.getByRole('button', { name: strings.changePassword })); await screen.findByText(strings.passwordChanged);
    expect((screen.getByLabelText(strings.currentPassword) as HTMLInputElement).value).toBe('');
  });

  it('does not report deletion success before the API accepts the password', async () => {
    setSessionTokens(tokens); api.onGet('/users/me').reply(200, testUser); api.onGet('/progress/stats').reply(200, stats);
    api.onDelete('/users/me').reply(400, {});
    await show(<RequireSession><Profile /></RequireSession>);
    fireEvent.click(await screen.findByRole('button', { name: strings.deleteAccount }));
    change(strings.confirmDeletePassword, 'WrongPass8'); fireEvent.click(screen.getByRole('button', { name: strings.confirmDelete }));
    await screen.findByText(strings.passwordInvalid);
    expect(screen.queryByText(strings.accountDeleted)).toBeNull();
    expect((screen.getByLabelText(strings.name) as HTMLInputElement).value).toBe(testUser.username);
  });

  it('enters guest mode through the login dialog without calling a hook in a handler', async () => {
    publicApi.onGet('/videos/lessons').reply(200, []);
    await show(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Войти' }));
    const guest = screen.getAllByRole('button', { name: 'Продолжить без регистрации' });
    fireEvent.click(guest[0]);
    await screen.findByText('Вы в гостевом режиме. Доступен только словарь.');
    expect(localStorage.getItem('guest_mode')).toBe('true');
  });
});
