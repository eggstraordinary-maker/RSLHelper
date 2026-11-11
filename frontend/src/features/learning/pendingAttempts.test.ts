// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { acknowledgePracticeAttempt, beginPracticeAttempt } from './pendingAttempts';

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

it('keeps the same request until acknowledgement and scopes it by principal and lesson', () => {
  const id = beginPracticeAttempt('one', 'lesson');
  expect(beginPracticeAttempt('one', 'lesson')).toBe(id);
  expect(beginPracticeAttempt('two', 'lesson')).not.toBe(id);
  expect(beginPracticeAttempt('one', 'another')).not.toBe(id);
  acknowledgePracticeAttempt('one', 'lesson', 'late-other-id');
  expect(beginPracticeAttempt('one', 'lesson')).toBe(id);
  acknowledgePracticeAttempt('one', 'lesson', id);
  expect(beginPracticeAttempt('one', 'lesson')).not.toBe(id);
});

it('retains the pending ID through storage failures and recovery', () => {
  const id = beginPracticeAttempt('storage-user', 'storage-lesson');
  const getter = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  const setter = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(beginPracticeAttempt('storage-user', 'storage-lesson')).toBe(id);
  getter.mockRestore(); setter.mockRestore();
  expect(beginPracticeAttempt('storage-user', 'storage-lesson')).toBe(id);
});

it('uses the persisted UUID after the module reloads', async () => {
  const id = beginPracticeAttempt('reload-user', 'reload-lesson');
  vi.resetModules();
  const reloaded = await import('./pendingAttempts');
  expect(reloaded.beginPracticeAttempt('reload-user', 'reload-lesson')).toBe(id);
});
