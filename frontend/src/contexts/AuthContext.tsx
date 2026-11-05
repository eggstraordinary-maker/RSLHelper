import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { ProgressStats, User, UserProgress, UserUpdateRequest } from '../types/api';
import { authApi, progressApi, usersApi } from '../services/api';
import { AUTH_SESSION_EXPIRED_EVENT, AUTH_TOKENS_CHANGED_EVENT, clearSessionTokens,
  getAccessToken, getRefreshToken, getSessionRevision, setSessionTokens } from '../services/apiClient';

interface AuthContextType {
  user: User | null; token: string | null; isGuest: boolean; isLoading: boolean;
  sessionError: boolean; retrySession: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void; enterGuestMode: () => void; exitGuestMode: () => void;
  updateProfile: (data: UserUpdateRequest) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  getProgressStats: () => Promise<ProgressStats>;
  completeLesson: (lessonId: string) => Promise<UserProgress>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState(getAccessToken);
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem('guest_mode') === 'true');
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [revision, setRevision] = useState(0);
  const operation = useRef(0);
  const mounted = useRef(true);
  const identity = useRef(getSessionRevision());
  const retrySession = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    mounted.current = true;
    const changed = () => {
      setToken(getAccessToken());
      if (identity.current !== getSessionRevision()) {
        identity.current = getSessionRevision();
        operation.current += 1;
        setUser(null);
        setRevision(value => value + 1);
      }
    };
    const storage = (event: StorageEvent) => {
      if (event.key === 'guest_mode' || event.key === null) {
        setIsGuest(localStorage.getItem('guest_mode') === 'true');
      }
    };
    window.addEventListener(AUTH_TOKENS_CHANGED_EVENT, changed);
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, changed);
    window.addEventListener('storage', storage);
    return () => {
      mounted.current = false;
      operation.current += 1;
      window.removeEventListener(AUTH_TOKENS_CHANGED_EVENT, changed);
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, changed);
      window.removeEventListener('storage', storage);
    };
  }, []);

  useEffect(() => {
    const current = ++operation.current;
    let active = true;
    setSessionError(false);
    if (isGuest || !getAccessToken()) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    usersApi.current().then(result => {
      if (active && current === operation.current) setUser(result);
    }, error => {
      if (active && current === operation.current) {
        if (axios.isAxiosError(error) && error.response?.status === 401) clearSessionTokens();
        else setSessionError(Boolean(getAccessToken()));
      }
    }).finally(() => {
      if (active && current === operation.current) setIsLoading(false);
    });
    return () => { active = false; };
  }, [isGuest, revision]);

  const leaveSession = useCallback((guest: boolean) => {
    const refresh = getRefreshToken();
    operation.current += 1;
    clearSessionTokens();
    localStorage.removeItem('user');
    localStorage.setItem('guest_mode', String(guest));
    setUser(null); setToken(null); setIsGuest(guest); setIsLoading(false); setSessionError(false);
    if (refresh) void authApi.logout(refresh).catch(() => undefined);
  }, []);
  const logout = useCallback(() => leaveSession(false), [leaveSession]);
  const enterGuestMode = useCallback(() => leaveSession(true), [leaveSession]);
  const exitGuestMode = useCallback(() => { setIsGuest(false); localStorage.removeItem('guest_mode'); }, []);

  const login = async (email: string, password: string) => {
    const current = ++operation.current;
    const session = getSessionRevision();
    const tokens = await authApi.login(email, password);
    if (!mounted.current || current !== operation.current || session !== getSessionRevision()) {
      void authApi.logout(tokens.refresh_token).catch(() => undefined);
      throw new Error('Session changed');
    }
    exitGuestMode();
    setSessionTokens(tokens);
    // Profile loading is owned by the session effect. Its retry retains the
    // authenticated session on a temporary network failure.
  };
  const updateProfile = async (data: UserUpdateRequest) => {
    const session = getSessionRevision();
    const updated = await usersApi.update(data);
    if (mounted.current && session === getSessionRevision()) setUser(updated);
  };
  const deleteAccount = async (password: string) => {
    const session = getSessionRevision();
    await usersApi.remove(password);
    if (session === getSessionRevision()) logout();
  };
  return <AuthContext.Provider value={{ user, token, isGuest, isLoading, sessionError, retrySession,
    login, register: async (name, email, password) => { await authApi.register(name, email, password); },
    logout, enterGuestMode, exitGuestMode, updateProfile, deleteAccount,
    changePassword: authApi.changePassword, getProgressStats: progressApi.stats, completeLesson: progressApi.complete,
  }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
