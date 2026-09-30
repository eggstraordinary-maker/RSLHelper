// Типы для ответов бэкенда
export interface User {
  id: number;
  public_id: string;
  email: string;
  username: string;
  is_verified: boolean;
  created_at: string;
  full_name?: string;
  avatar_url?: string;
  role: 'user' | 'admin';
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RegisterResponse {
  id: number;
  public_id: string;
  email: string;
  username: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  role: 'user' | 'admin';
  full_name?: string;
}

export interface ApiError {
  detail: string | ValidationIssue[];
}

export interface ValidationIssue {
  loc?: Array<string | number>;
  msg: string;
  type?: string;
}

export interface ProgressStats {
  total_lessons: number;
  completed_lessons: number;
  completed_percentage: number;
  recent_lessons: string[];
}

export interface MessageResponse {
  message: string;
}

export interface VideoInfo {
  id: number;
  filename: string;
  description: string | null;
  object_name: string;
}

export interface UserUpdateRequest {
  username?: string;
  full_name?: string;
}

export interface UserProgress {
  id: number;
  user_id: number;
  word: string;
  completed: boolean;
  completed_at: string | null;
  attempts: number;
}
