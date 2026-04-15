// Типы для ответов бэкенда
export interface User {
  id: number;
  public_id: string;
  email: string;
  username: string;
  is_verified: boolean;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RegisterResponse {
  message: string;
  email: string;
}

export interface ApiError {
  detail: string;
}