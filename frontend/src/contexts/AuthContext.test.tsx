// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { AuthProvider, useAuth } from './AuthContext';
import { apiClient, publicApiClient, clearSessionTokens, getAccessToken, setSessionTokens } from '../services/apiClient';
import { deferred, testUser, tokens } from '../../test-utils/accounts';

const api = new MockAdapter(apiClient);
const publicApi = new MockAdapter(publicApiClient);
function Probe() {
  const auth = useAuth();
  return <><p>{auth.isLoading ? 'pending' : auth.sessionError ? 'temporary failure' : auth.user?.username ?? (auth.isGuest ? 'guest' : 'anonymous')}</p>
    <button onClick={auth.logout}>logout</button><button onClick={auth.enterGuestMode}>guest</button><button onClick={auth.retrySession}>retry</button>
    <button onClick={() => { void auth.login('learner@example.com', 'GoodPass8').catch(() => undefined); }}>login</button></>;
}
beforeEach(() => { localStorage.clear(); clearSessionTokens(); api.reset(); publicApi.reset(); publicApi.onPost('/auth/logout').reply(200); });
afterEach(cleanup);
afterAll(() => { api.restore(); publicApi.restore(); });

describe('AuthProvider session ownership', () => {
  it('loads the current user safely under StrictMode', async () => {
    setSessionTokens(tokens); api.onGet('/users/me').reply(200, testUser);
    render(<StrictMode><AuthProvider><Probe /></AuthProvider></StrictMode>);
    await screen.findByText('learner');
  });

  it('ignores a late profile response after logout', async () => {
    setSessionTokens(tokens); const pending = deferred(); api.onGet('/users/me').reply(() => pending.promise);
    render(<AuthProvider><Probe /></AuthProvider>);
    fireEvent.click(screen.getByText('logout'));
    await act(async () => { pending.resolve([200, testUser]); });
    await screen.findByText('anonymous'); expect(getAccessToken()).toBeNull();
  });

  it('retains tokens and offers retry after a profile network failure', async () => {
    setSessionTokens(tokens); api.onGet('/users/me').replyOnce(503); api.onGet('/users/me').reply(200, testUser);
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('temporary failure'); expect(getAccessToken()).toBe(tokens.access_token);
    fireEvent.click(screen.getByText('retry')); await screen.findByText('learner');
  });

  it('keeps guest mode across remount and cancels an older login', async () => {
    const pending = deferred(); publicApi.onPost('/auth/login').reply(() => pending.promise);
    const first = render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('anonymous'); fireEvent.click(screen.getByText('login'));
    fireEvent.click(screen.getByRole('button', { name: 'guest' }));
    await act(async () => { pending.resolve([200, tokens]); });
    expect(getAccessToken()).toBeNull(); await screen.findByText('guest', { selector: 'p' });
    first.unmount(); render(<StrictMode><AuthProvider><Probe /></AuthProvider></StrictMode>);
    await screen.findByText('guest', { selector: 'p' }); expect(api.history.get).toHaveLength(0);
  });

  it('synchronizes logout from another tab and rejects late profile data', async () => {
    setSessionTokens(tokens); const pending = deferred(); api.onGet('/users/me').reply(() => pending.promise);
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); window.dispatchEvent(new StorageEvent('storage', { key: 'access_token' })); });
    await act(async () => { pending.resolve([200, testUser]); });
    await screen.findByText('anonymous'); expect(screen.queryByText('learner')).toBeNull();
  });

  it('loads a successful login through one profile owner', async () => {
    publicApi.onPost('/auth/login').reply(200, tokens); api.onGet('/users/me').reply(200, testUser);
    render(<AuthProvider><Probe /></AuthProvider>); await screen.findByText('anonymous');
    fireEvent.click(screen.getByText('login')); await screen.findByText('learner');
    await waitFor(() => expect(api.history.get).toHaveLength(1));
  });
});
