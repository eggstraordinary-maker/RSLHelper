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
  unresolved_legacy_records: number;
}

export interface MessageResponse {
  message: string;
}

export interface VideoInfo {
  id: number;
  lesson_id: string;
  is_published: boolean;
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
  lesson_id: string;
  word: string;
  completed: boolean;
  completed_at: string | null;
  attempts: number;
}

export interface RecognitionStatus {
  protocol_version: '1.0';
  available: boolean;
  configured: boolean;
  transport: 'websocket';
  reason: 'not_configured' | 'provider_unavailable' | 'ready';
  max_frame_bytes: number;
  max_frames_per_second: number;
  max_in_flight: number;
}
