import type {
  LoginResponse,
  MessageResponse,
  ProgressStats,
  RegisterResponse,
  User,
  UserProgress,
  UserUpdateRequest,
  VideoInfo,
} from '../types/api';
import {
  apiClient,
  buildApiUrl,
  publicApiClient,
} from './apiClient';

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const form = new URLSearchParams({ username: email, password });
    const { data } = await publicApiClient.post<LoginResponse>('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return data;
  },

  async register(username: string, email: string, password: string): Promise<RegisterResponse> {
    const { data } = await publicApiClient.post<RegisterResponse>('/auth/register', {
      username,
      email,
      password,
    });
    return data;
  },

  async logout(refreshToken: string): Promise<void> {
    await publicApiClient.post('/auth/logout', { refresh_token: refreshToken });
  },

  async verifyEmail(token: string): Promise<MessageResponse> {
    const { data } = await publicApiClient.post<MessageResponse>('/auth/verify-email', { token });
    return data;
  },

  async requestPasswordReset(email: string): Promise<MessageResponse> {
    const { data } = await publicApiClient.post<MessageResponse>('/auth/forgot-password', { email });
    return data;
  },

  async resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
    const { data } = await publicApiClient.post<MessageResponse>('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
    return data;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },
};

export const usersApi = {
  async current(): Promise<User> {
    const { data } = await apiClient.get<User>('/users/me');
    return data;
  },

  async update(update: UserUpdateRequest): Promise<User> {
    const { data } = await apiClient.put<User>('/users/me', update);
    return data;
  },

  async remove(password: string): Promise<void> {
    await apiClient.delete('/users/me', { data: { password } });
  },
};

export const progressApi = {
  async stats(): Promise<ProgressStats> {
    const { data } = await apiClient.get<ProgressStats>('/progress/stats');
    return data;
  },

  async complete(word: string): Promise<UserProgress> {
    const { data } = await apiClient.post<UserProgress>(
      `/progress/complete/${encodeURIComponent(word)}`,
    );
    return data;
  },
};

export const videosApi = {
  async list(): Promise<VideoInfo[]> {
    const { data } = await apiClient.get<VideoInfo[]>('/videos/');
    return data;
  },

  streamUrl(objectName: string): string {
    return buildApiUrl(`/videos/stream/${encodeURIComponent(objectName)}`);
  },
};

export const languageApi = {
  async set(language: string): Promise<void> {
    await publicApiClient.post('/api/set-language', { lang: language }, { withCredentials: true });
  },
};
