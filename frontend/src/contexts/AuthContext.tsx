// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { User, LoginResponse } from '../types/api';

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));
  const [isGuest, setIsGuest] = useState(() => {
    // Инициализируем из localStorage при первом рендере
    return localStorage.getItem('guest_mode') === 'true';
  });
  const [isLoading, setIsLoading] = useState(true);
  const isInitialMount = useRef(true);

  // Проверяем состояние при загрузке
    useEffect(() => {
    const loadUser = async () => {
      if (isGuest) {
        // Если гость, не делаем запросов к API
        setIsLoading(false);
        return;
      }
      
      const storedToken = localStorage.getItem('access_token');
      if (storedToken) {
        try {
          // Устанавливаем заголовок для запроса
          axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
          const response = await axios.get<User>('http://localhost:8000/users/me');
          setUser(response.data);
          setToken(storedToken);
        } catch (error) {
          console.error('Ошибка загрузки пользователя', error);
          // Если токен невалиден, очищаем его
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          delete axios.defaults.headers.common['Authorization'];
        }
      }
      setIsLoading(false);
    };

    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadUser();
    }
  }, []);

  // Настройка axios заголовков
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('access_token', token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('access_token');
    }
  }, [token]);

  const enterGuestMode = () => {
    setIsGuest(true);
    localStorage.setItem('guest_mode', 'true');
    // Удаляем токены если есть
    setToken(null);
    setUser(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  };

  const exitGuestMode = () => {
    setIsGuest(false);
    localStorage.removeItem('guest_mode');
  };

  const login = async (email: string, password: string) => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);

    const response = await axios.post<LoginResponse>(
      'http://localhost:8000/auth/login',
      formData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token } = response.data;
    setToken(access_token);
    localStorage.setItem('refresh_token', refresh_token);
    // Выходим из гостевого режима при входе
    exitGuestMode();
    try {
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      const userResponse = await axios.get<User>('http://localhost:8000/users/me');
      setUser(userResponse.data);
    } catch (error) {
      console.error('Ошибка загрузки пользователя после входа', error);
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string) => {
    await axios.post('http://localhost:8000/auth/register', {
      username,
      email,
      password,
    });
    // После регистрации автоматически входим
    await login(email, password);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setIsGuest(false);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('guest_mode');
    delete axios.defaults.headers.common['Authorization'];
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