import axios, {
  AxiosError,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';
import type { ApiError, LoginResponse } from '../types/api';

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
).replace(/\/$/, '');

export const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';
export const AUTH_TOKENS_CHANGED_EVENT = 'auth:tokens-changed';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

const getStoredItem = (key: string): string | null => {
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem(key);
  }
  return key === ACCESS_TOKEN_KEY ? memoryAccessToken : memoryRefreshToken;
};

const setStoredItem = (key: string, value: string): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, value);
    return;
  }
  if (key === ACCESS_TOKEN_KEY) memoryAccessToken = value;
  if (key === REFRESH_TOKEN_KEY) memoryRefreshToken = value;
};

const removeStoredItem = (key: string): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(key);
    return;
  }
  if (key === ACCESS_TOKEN_KEY) memoryAccessToken = null;
  if (key === REFRESH_TOKEN_KEY) memoryRefreshToken = null;
};

const dispatchAuthEvent = (eventName: string): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(eventName));
  }
};

export const getAccessToken = (): string | null => getStoredItem(ACCESS_TOKEN_KEY);
export const getRefreshToken = (): string | null => getStoredItem(REFRESH_TOKEN_KEY);

export const setSessionTokens = (tokens: LoginResponse): void => {
  setStoredItem(ACCESS_TOKEN_KEY, tokens.access_token);
  setStoredItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  dispatchAuthEvent(AUTH_TOKENS_CHANGED_EVENT);
};

export const clearSessionTokens = (): void => {
  removeStoredItem(ACCESS_TOKEN_KEY);
  removeStoredItem(REFRESH_TOKEN_KEY);
  dispatchAuthEvent(AUTH_TOKENS_CHANGED_EVENT);
};

export const publicApiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: 'application/json' },
});

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const accessToken = getAccessToken();
  if (accessToken) {
    config.headers = AxiosHeaders.from(config.headers);
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };
let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = (): Promise<string> => {
  if (refreshPromise) return refreshPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.reject(new Error('Refresh token is missing'));

  refreshPromise = publicApiClient
    .post<LoginResponse>('/auth/refresh', { refresh_token: refreshToken })
    .then(({ data }) => {
      setSessionTokens(data);
      return data.access_token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      !getRefreshToken()
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const accessToken = await refreshAccessToken();
      originalRequest.headers = AxiosHeaders.from(originalRequest.headers);
      originalRequest.headers.set('Authorization', `Bearer ${accessToken}`);
      return apiClient(originalRequest);
    } catch (refreshError) {
      clearSessionTokens();
      dispatchAuthEvent(AUTH_SESSION_EXPIRED_EVENT);
      return Promise.reject(refreshError);
    }
  },
);

export const buildApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (!axios.isAxiosError<ApiError>(error)) return fallback;

  const detail = error.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((issue) => issue.msg)
      .filter((message): message is string => Boolean(message));
    if (messages.length > 0) return messages.join('. ');
  }
  return fallback;
};
