// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Learning from './Learning';
import { progressApi, videosApi } from '../services/api';
import type { UserProgress, VideoInfo } from '../types/api';

vi.mock('../components/CameraView', () => ({ default: () => <div>Camera test boundary</div> }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { public_id: 'learner-test' }, completeLesson: progressApi.complete }) }));
vi.mock('../services/api', () => ({
  videosApi: { list: vi.fn(), streamUrl: (mediaPath: string) => mediaPath },
  progressApi: { list: vi.fn(), practice: vi.fn(), complete: vi.fn() },
}));

const lessons: VideoInfo[] = [
  { id: 1, lesson_id: '11111111-1111-4111-8111-111111111111', filename: 'one.mp4', description: 'Same', media_url: '/videos/lessons/11111111-1111-4111-8111-111111111111/content', is_published: true },
  { id: 2, lesson_id: '22222222-2222-4222-8222-222222222222', filename: 'two.mp4', description: 'Same', media_url: '/videos/lessons/22222222-2222-4222-8222-222222222222/content', is_published: true },
];
const saved = (lesson = lessons[0], attempts = 1, completed = false): UserProgress => ({
  id: 1, user_id: 1, lesson_id: lesson.lesson_id, word: 'Same', attempts, completed,
  completed_at: completed ? '2026-10-14T12:00:00Z' : null,
});
const repeat = () => screen.getByRole('button', { name: 'Я повторил(а) жест' }) as HTMLButtonElement;
const complete = () => screen.getByRole('button', { name: 'Отметить урок пройденным' }) as HTMLButtonElement;
const practice = () => within(screen.getByRole('region', { name: 'Самостоятельная практика' }));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

describe('self practice', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(videosApi.list).mockResolvedValue(lessons);
    vi.mocked(progressApi.list).mockResolvedValue([]);
    vi.mocked(progressApi.practice).mockResolvedValue(saved());
    vi.mocked(progressApi.complete).mockResolvedValue(saved(lessons[0], 1, true));
  });
  afterEach(cleanup);

  it('reuses an unacknowledged request after an error and creates a new ID only after success', async () => {
    vi.mocked(progressApi.practice).mockRejectedValueOnce(new Error('response lost'));
    render(<Learning />);
    await waitFor(() => expect(repeat().disabled).toBe(false));
    fireEvent.click(repeat());
    await practice().findByRole('alert');
    const first = vi.mocked(progressApi.practice).mock.calls[0][1];
    fireEvent.click(repeat());
    await screen.findByText('Самостоятельная практика сохранена.');
    expect(vi.mocked(progressApi.practice).mock.calls[1][1]).toBe(first);
    await waitFor(() => expect(repeat().disabled).toBe(false));
    fireEvent.click(repeat());
    await waitFor(() => expect(progressApi.practice).toHaveBeenCalledTimes(3));
    expect(vi.mocked(progressApi.practice).mock.calls[2][1]).not.toBe(first);
  });

  it('selects duplicate titles by ID and records practice without a prediction', async () => {
    render(<Learning />);
    await waitFor(() => expect(repeat().disabled).toBe(false));
    expect(screen.queryByText('Симулировать успех')).toBeNull();
    expect(screen.queryByText('Симулировать ошибку')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Same' })[1]);
    vi.mocked(progressApi.practice).mockResolvedValue(saved(lessons[1]));
    fireEvent.click(repeat());
    await screen.findByText('Самостоятельная практика сохранена.');
    expect(progressApi.practice).toHaveBeenCalledWith(lessons[1].lesson_id, expect.any(String));
    expect(progressApi.complete).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Эталонный жест') as HTMLVideoElement).getAttribute('src')).toBe(lessons[1].media_url);
    expect(screen.getByText(/автоматическая оценка модели сейчас недоступна/)).toBeTruthy();
  });

  it('completes separately and reads persisted progress after remount', async () => {
    vi.mocked(progressApi.list).mockResolvedValue([saved()]);
    const first = render(<Learning />);
    const complete = await screen.findByRole('button', { name: 'Отметить урок пройденным' });
    await waitFor(() => expect((complete as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(complete);
    await screen.findByText('Урок отмечен пройденным.');
    expect(progressApi.complete).toHaveBeenCalledWith(lessons[0].lesson_id);
    expect(progressApi.practice).not.toHaveBeenCalled();
    first.unmount();
    vi.mocked(progressApi.list).mockResolvedValue([saved(lessons[0], 1, true)]);
    render(<Learning />);
    await screen.findByText('Урок пройден по вашей отметке.');
    expect((screen.getByRole('button', { name: 'Отметить урок пройденным' }) as HTMLButtonElement).disabled).toBe(true);
    expect(progressApi.list).toHaveBeenCalledTimes(2);
  });

  it('shows save failures and preserves the confirmed counter', async () => {
    vi.mocked(progressApi.list).mockResolvedValue([saved(lessons[0], 4)]);
    vi.mocked(progressApi.practice).mockRejectedValue(new Error('Offline'));
    render(<Learning />);
    await waitFor(() => expect(repeat().disabled).toBe(false));
    fireEvent.click(repeat());
    await screen.findByRole('alert');
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.queryByText('Самостоятельная практика сохранена.')).toBeNull();
    expect(repeat().disabled).toBe(false);
  });

  it('blocks writes until progress can be loaded and allows retry', async () => {
    vi.mocked(progressApi.list).mockRejectedValueOnce(new Error('Offline'));
    render(<Learning />);
    const retry = await screen.findByRole('button', { name: 'Повторить загрузку прогресса' });
    expect(repeat().disabled).toBe(true);
    fireEvent.click(retry);
    await waitFor(() => expect(repeat().disabled).toBe(false));
  });

  it('handles empty catalog and reloads a failed catalog', async () => {
    vi.mocked(videosApi.list).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([]);
    render(<Learning />);
    fireEvent.click(await screen.findByRole('button', { name: 'Повторить загрузку уроков' }));
    await screen.findByText('Уроков пока нет. Загляните позже.');
    expect(screen.queryByRole('button', { name: 'Я повторил(а) жест' })).toBeNull();
  });

  it('keeps an incomplete lesson and its attempts when completion fails, then retries', async () => {
    vi.mocked(progressApi.list).mockResolvedValue([saved(lessons[0], 4)]);
    vi.mocked(progressApi.complete)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(saved(lessons[0], 4, true));
    render(<Learning />);
    await waitFor(() => expect(complete().disabled).toBe(false));

    fireEvent.click(complete());
    await practice().findByRole('alert');
    expect(practice().getByText('4')).toBeTruthy();
    expect(practice().getByText('Урок ещё не отмечен пройденным.')).toBeTruthy();
    expect(practice().queryByText('Урок отмечен пройденным.')).toBeNull();
    expect(complete().disabled).toBe(false);

    fireEvent.click(complete());
    await practice().findByText('Урок отмечен пройденным.');
    expect(practice().getByText('4')).toBeTruthy();
    expect(complete().disabled).toBe(true);
    expect(progressApi.complete).toHaveBeenNthCalledWith(1, lessons[0].lesson_id);
    expect(progressApi.complete).toHaveBeenNthCalledWith(2, lessons[0].lesson_id);
    expect(progressApi.practice).not.toHaveBeenCalled();
  });

  it('retries a failed reference video with a new element and clears loading after playback data arrives', async () => {
    render(<Learning />);
    const failedVideo = await screen.findByLabelText('Эталонный жест');
    fireEvent.error(failedVideo);
    const retry = screen.getByRole('button', { name: 'Повторить загрузку видео' });
    expect(screen.getByRole('alert').textContent).toContain('Не удалось загрузить эталонное видео.');
    expect(screen.queryByText('Загрузка эталонного видео…')).toBeNull();

    fireEvent.click(retry);
    const retriedVideo = screen.getByLabelText('Эталонный жест');
    expect(retriedVideo).not.toBe(failedVideo);
    expect(retriedVideo.getAttribute('src')).toBe(lessons[0].media_url);
    expect(screen.queryByRole('button', { name: 'Повторить загрузку видео' })).toBeNull();
    expect(screen.getByText('Загрузка эталонного видео…')).toBeTruthy();

    fireEvent.loadedData(retriedVideo);
    expect(screen.queryByText('Загрузка эталонного видео…')).toBeNull();
    expect(screen.queryByText('Не удалось загрузить эталонное видео.')).toBeNull();
  });

  it.each(['practice', 'completion'] as const)('sends only one %s request for rapid repeated clicks', async action => {
    const pending = deferred<UserProgress>();
    vi.mocked(progressApi.list).mockResolvedValue([saved(lessons[0], 2)]);
    const request = action === 'practice' ? progressApi.practice : progressApi.complete;
    vi.mocked(request).mockReturnValue(pending.promise);
    render(<Learning />);
    await waitFor(() => expect(complete().disabled).toBe(false));

    const button = action === 'practice' ? repeat() : complete();
    act(() => {
      button.click();
      button.click();
      button.click();
    });
    expect(request).toHaveBeenCalledTimes(1);
    if (action === 'practice') expect(request).toHaveBeenCalledWith(lessons[0].lesson_id, expect.any(String));
    else expect(request).toHaveBeenCalledWith(lessons[0].lesson_id);
    expect(repeat().disabled).toBe(true);
    expect(complete().disabled).toBe(true);

    await act(async () => { pending.resolve(saved(lessons[0], action === 'practice' ? 3 : 2, action === 'completion')); });
    expect(practice().getByText(action === 'practice' ? '3' : '2')).toBeTruthy();
    expect(repeat().disabled).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'failure'] as const)('keeps a pending save %s attached to its original lesson after selection changes', async outcome => {
    const pending = deferred<UserProgress>();
    vi.mocked(progressApi.list).mockResolvedValue([saved(lessons[0], 2), saved(lessons[1], 7)]);
    vi.mocked(progressApi.practice).mockReturnValue(pending.promise);
    render(<Learning />);
    await waitFor(() => expect(repeat().disabled).toBe(false));
    fireEvent.click(repeat());
    fireEvent.click(screen.getAllByRole('button', { name: 'Same' })[1]);
    expect(practice().getByText('7')).toBeTruthy();
    expect(repeat().disabled).toBe(true);

    await act(async () => {
      if (outcome === 'success') pending.resolve(saved(lessons[0], 3));
      else pending.reject(new Error('Offline'));
    });
    expect(practice().getByText('7')).toBeTruthy();
    expect(practice().queryByText('Самостоятельная практика сохранена.')).toBeNull();
    expect(practice().queryByRole('alert')).toBeNull();
    expect(repeat().disabled).toBe(false);
    expect(progressApi.practice).toHaveBeenCalledExactlyOnceWith(lessons[0].lesson_id, expect.any(String));

    fireEvent.click(screen.getAllByRole('button', { name: 'Same' })[0]);
    expect(practice().getByText(outcome === 'success' ? '3' : '2')).toBeTruthy();
    if (outcome === 'success') expect(practice().getByText('Самостоятельная практика сохранена.')).toBeTruthy();
    else expect(practice().getByRole('alert')).toBeTruthy();
  });
});
