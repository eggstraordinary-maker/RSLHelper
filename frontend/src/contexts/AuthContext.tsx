import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ProgressStats, User, UserUpdateRequest } from '../types/api';
import { authApi, progressApi, usersApi } from '../services/api';
import {
  AUTH_SESSION_EXPIRED_EVENT,
  AUTH_TOKENS_CHANGED_EVENT,
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  setSessionTokens,
} from '../services/apiClient';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isGuest: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
  updateProfile: (data: UserUpdateRequest) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  getProgressStats: () => Promise<ProgressStats>;
  completeLesson: (word: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [isGuest, setIsGuest] = useState(
    () => localStorage.getItem('guest_mode') === 'true',
  );
  const [isLoading, setIsLoading] = useState(true);
  const initializationStarted = useRef(false);

  const clearLocalSession = useCallback(() => {
    clearSessionTokens();
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const handleTokensChanged = () => setToken(getAccessToken());
    const handleSessionExpired = () => {
      setToken(null);
      setUser(null);
    };

    window.addEventListener(AUTH_TOKENS_CHANGED_EVENT, handleTokensChanged);
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(AUTH_TOKENS_CHANGED_EVENT, handleTokensChanged);
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    if (initializationStarted.current) return;
    initializationStarted.current = true;

    const loadCurrentUser = async () => {
      if (isGuest) {
        setIsLoading(false);
        return;
      }

      if (!getAccessToken()) {
        setIsLoading(false);
        return;
      }

      try {
        setUser(await usersApi.current());
        setToken(getAccessToken());
      } catch {
        clearLocalSession();
      } finally {
        setIsLoading(false);
      }
    };

    void loadCurrentUser();
  }, [clearLocalSession, isGuest]);

  const logout = useCallback(() => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      void authApi.logout(refreshToken).catch(() => undefined);
    }

    clearLocalSession();
    setIsGuest(false);
    setIsLoading(false);
    localStorage.removeItem('guest_mode');
  }, [clearLocalSession]);

  const enterGuestMode = () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      void authApi.logout(refreshToken).catch(() => undefined);
    }
    clearLocalSession();
    setIsGuest(true);
    localStorage.setItem('guest_mode', 'true');
  };

  const exitGuestMode = () => {
    setIsGuest(false);
    localStorage.removeItem('guest_mode');
  };

  const login = async (email: string, password: string) => {
    const tokens = await authApi.login(email, password);
    setSessionTokens(tokens);
    exitGuestMode();

    try {
      setUser(await usersApi.current());
      setToken(tokens.access_token);
    } catch {
      clearLocalSession();
      throw new Error('Не удалось загрузить профиль пользователя');
    }
  };

  const register = async (username: string, email: string, password: string) => {
    await authApi.register(username, email, password);
  };

  const updateProfile = async (data: UserUpdateRequest) => {
    setUser(await usersApi.update(data));
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await authApi.changePassword(currentPassword, newPassword);
  };

  const getProgressStats = () => progressApi.stats();

  const completeLesson = async (word: string) => {
    await progressApi.complete(word);
  };

  const deleteAccount = async (password: string) => {
    await usersApi.remove(password);
    clearLocalSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isGuest,
        isLoading,
        login,
        register,
        logout,
        enterGuestMode,
        exitGuestMode,
        updateProfile,
        changePassword,
        deleteAccount,
        getProgressStats,
        completeLesson,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
