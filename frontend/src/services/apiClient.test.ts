// @vitest-environment jsdom
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LoginResponse } from '../types/api';
import {
  apiClient,
  AUTH_TOKENS_CHANGED_EVENT,
  clearSessionTokens,
  getAccessToken,
  getApiErrorMessage,
  getRefreshToken,
  publicApiClient,
  setSessionTokens,
} from './apiClient';

const deferred = () => {
  let resolve!: (value: [number, unknown]) => void;
  const promise = new Promise<[number, unknown]>(done => { resolve = done; });
  return { promise, resolve };
};

const initialTokens: LoginResponse = {
  access_token: 'old-access',
  refresh_token: 'old-refresh',
  token_type: 'bearer',
};

const rotatedTokens: LoginResponse = {
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  token_type: 'bearer',
};

describe('apiClient', () => {
  const apiMock = new MockAdapter(apiClient);
  const publicMock = new MockAdapter(publicApiClient);

  beforeEach(() => {
    apiMock.reset();
    publicMock.reset();
    clearSessionTokens();
  });

  afterEach(() => {
    clearSessionTokens();
  });

  it('adds the current access token to authenticated requests', async () => {
    setSessionTokens(initialTokens);
    apiMock.onGet('/users/me').reply((config) => [
      200,
      { authorization: config.headers?.Authorization },
    ]);

    const response = await apiClient.get<{ authorization: string }>('/users/me');

    expect(response.data.authorization).toBe('Bearer old-access');
  });

  it('uses one refresh request for concurrent 401 responses and retries both calls', async () => {
    setSessionTokens(initialTokens);
    let refreshCalls = 0;

    publicMock.onPost('/auth/refresh').reply(() => {
      refreshCalls += 1;
      return [200, rotatedTokens];
    });
    apiMock.onGet('/protected').reply((config) => {
      const authorization = config.headers?.Authorization;
      return authorization === 'Bearer new-access'
        ? [200, { ok: true }]
        : [401, { detail: 'Expired access token' }];
    });

    const responses = await Promise.all([
      apiClient.get<{ ok: boolean }>('/protected'),
      apiClient.get<{ ok: boolean }>('/protected'),
    ]);

    expect(responses.every(({ data }) => data.ok)).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(getAccessToken()).toBe('new-access');
    expect(getRefreshToken()).toBe('new-refresh');
  });

  it('clears the session when refresh is rejected', async () => {
    setSessionTokens(initialTokens);
    apiMock.onGet('/protected').reply(401, { detail: 'Expired access token' });
    publicMock.onPost('/auth/refresh').reply(401, { detail: 'Invalid refresh token' });

    await expect(apiClient.get('/protected')).rejects.toBeDefined();

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('normalizes string and validation error responses', () => {
    const stringError = Object.assign(new Error('request failed'), {
      isAxiosError: true,
      response: { data: { detail: 'Incorrect password' } },
      toJSON: () => ({}),
    });
    const validationError = Object.assign(new Error('request failed'), {
      isAxiosError: true,
      response: {
        data: { detail: [{ msg: 'Password is too short' }, { msg: 'Digit is required' }] },
      },
      toJSON: () => ({}),
    });

    expect(getApiErrorMessage(stringError, 'fallback')).toBe('Incorrect password');
    expect(getApiErrorMessage(validationError, 'fallback')).toBe(
      'Password is too short. Digit is required',
    );
  });

  it('does not restore tokens when a successful refresh arrives after logout', async () => {
    setSessionTokens(initialTokens);
    const pending = deferred();
    publicMock.onPost('/auth/refresh').reply(() => pending.promise);
    publicMock.onPost('/auth/logout').reply(200);
    apiMock.onGet('/protected').reply(401);
    const result = apiClient.get('/protected').catch(() => undefined);
    while (publicMock.history.post.length === 0) await new Promise(done => setTimeout(done, 0));
    clearSessionTokens();
    pending.resolve([200, rotatedTokens]);
    await result;
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(apiMock.history.get).toHaveLength(1);
    expect(publicMock.history.post.some(request => request.url === '/auth/logout')).toBe(true);
  });

  it('does not clear a new login after an older refresh fails', async () => {
    setSessionTokens(initialTokens);
    const pending = deferred();
    publicMock.onPost('/auth/refresh').reply(() => pending.promise);
    apiMock.onGet('/protected').reply(401);
    const result = apiClient.get('/protected').catch(() => undefined);
    while (publicMock.history.post.length === 0) await new Promise(done => setTimeout(done, 0));
    setSessionTokens(rotatedTokens);
    pending.resolve([401, {}]);
    await result;
    expect(getAccessToken()).toBe(rotatedTokens.access_token);
    expect(getRefreshToken()).toBe(rotatedTokens.refresh_token);
  });

  it('preserves tokens on a temporary refresh service failure', async () => {
    setSessionTokens(initialTokens);
    apiMock.onGet('/protected').reply(401);
    publicMock.onPost('/auth/refresh').reply(503);
    await expect(apiClient.get('/protected')).rejects.toBeDefined();
    expect(getAccessToken()).toBe(initialTokens.access_token);
    expect(getRefreshToken()).toBe(initialTokens.refresh_token);
  });

  it('never replays an old user request under a newly logged-in identity', async () => {
    setSessionTokens(initialTokens);
    const pending = deferred();
    apiMock.onGet('/protected').reply(() => pending.promise);
    const result = apiClient.get('/protected').catch(() => undefined);
    while (apiMock.history.get.length === 0) await new Promise(done => setTimeout(done, 0));
    setSessionTokens(rotatedTokens);
    pending.resolve([401, {}]);
    await result;
    expect(apiMock.history.get).toHaveLength(1);
    expect(publicMock.history.post).toHaveLength(0);
  });

  it('checks ownership again between refresh completion and the retried request', async () => {
    setSessionTokens(initialTokens);
    apiMock.onGet('/protected').reply(401);
    publicMock.onPost('/auth/refresh').reply(200, rotatedTokens);
    const logoutOnRotation = () => {
      if (getAccessToken() === rotatedTokens.access_token) clearSessionTokens();
    };
    window.addEventListener(AUTH_TOKENS_CHANGED_EVENT, logoutOnRotation);
    try {
      await expect(apiClient.get('/protected')).rejects.toBeDefined();
      expect(apiMock.history.get).toHaveLength(1);
      expect(getAccessToken()).toBeNull();
    } finally {
      window.removeEventListener(AUTH_TOKENS_CHANGED_EVENT, logoutOnRotation);
    }
  });
});
