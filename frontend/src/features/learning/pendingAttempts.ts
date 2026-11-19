import { newUuid, uuidPattern } from '../../shared/uuid';

// Only public principal/lesson/request UUIDs are persisted, never credentials.
const memoryAttempts = new Map<string, string>();
const keyFor = (principal: string, lessonId: string) =>
  `rsl.practice.pending.v1:${encodeURIComponent(principal)}:${encodeURIComponent(lessonId)}`;

export function beginPracticeAttempt(principal: string, lessonId: string): string {
  const key = keyFor(principal, lessonId);
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(key);
  } catch { /* Keep the same pending ID if storage becomes unavailable. */ }
  const attempt = stored && uuidPattern.test(stored) ? stored : memoryAttempts.get(key) ?? newUuid();
  memoryAttempts.set(key, attempt);
  // Persist before POST so a reload after a lost acknowledgement reuses it.
  try { window.sessionStorage.setItem(key, attempt); } catch { /* Memory fallback. */ }
  return attempt;
}

export function acknowledgePracticeAttempt(principal: string, lessonId: string, attemptId: string): void {
  const key = keyFor(principal, lessonId);
  if (memoryAttempts.get(key) === attemptId) memoryAttempts.delete(key);
  try {
    if (window.sessionStorage.getItem(key) === attemptId) window.sessionStorage.removeItem(key);
  } catch { /* A blocked session store has an in-memory fallback. */ }
}
