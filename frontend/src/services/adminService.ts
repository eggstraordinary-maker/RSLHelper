import { User } from '../types/api';
import { apiClient } from './apiClient';

export const fetchAllUsers = async (skip = 0, limit = 100, signal?: AbortSignal): Promise<User[]> => {
  const { data } = await apiClient.get<User[]>('/admin/users', {
    params: { skip, limit },
    signal,
  });
  return data;
};

export const deleteUserById = async (userId: number): Promise<void> => {
  await apiClient.delete(`/admin/users/${userId}`);
};
