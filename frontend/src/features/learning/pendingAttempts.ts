// Only public principal/lesson/request UUIDs are persisted, never credentials.
const memoryAttempts = new Map<string, string>();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keyFor = (principal: string, lessonId: string) =>
  `rsl.practice.pending.v1:${encodeURIComponent(principal)}:${encodeURIComponent(lessonId)}`;

const newAttemptId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export function beginPracticeAttempt(principal: string, lessonId: string): string {
  const key = keyFor(principal, lessonId);
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(key);
  } catch { /* Keep the same pending ID if storage becomes unavailable. */ }
  const attempt = stored && uuidPattern.test(stored) ? stored : memoryAttempts.get(key) ?? newAttemptId();
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
