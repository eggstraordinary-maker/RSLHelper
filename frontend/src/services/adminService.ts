import axios from 'axios';
import { User } from '../types/api';

const API_URL = import.meta.env.VITE_API_URL;

export const fetchAllUsers = async (skip = 0, limit = 100): Promise<User[]> => {
  const { data } = await axios.get(`${API_URL}/admin/users`, {
    params: { skip, limit },
  });
  return data;
};

export const deleteUserById = async (userId: number): Promise<void> => {
  await axios.delete(`${API_URL}/admin/users/${userId}`);
};