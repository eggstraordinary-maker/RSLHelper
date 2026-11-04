import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LoginResponse } from '../types/api';
import {
  apiClient,
  clearSessionTokens,
  getAccessToken,
  getApiErrorMessage,
  getRefreshToken,
  publicApiClient,
  setSessionTokens,
} from './apiClient';

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
});
