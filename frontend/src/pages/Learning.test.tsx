// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Learning from './Learning';
import { progressApi, videosApi } from '../services/api';
import type { UserProgress, VideoInfo } from '../types/api';

vi.mock('../components/CameraView', () => ({ default: () => <div>Camera test boundary</div> }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ completeLesson: progressApi.complete }) }));
vi.mock('../services/api', () => ({
  videosApi: { list: vi.fn(), streamUrl: (key: string) => `/videos/stream/${key}` },
  progressApi: { list: vi.fn(), practice: vi.fn(), complete: vi.fn() },
}));

const lessons: VideoInfo[] = [
  { id: 1, lesson_id: '11111111-1111-4111-8111-111111111111', filename: 'one.mp4', description: 'Same', object_name: 'one', is_published: true },
  { id: 2, lesson_id: '22222222-2222-4222-8222-222222222222', filename: 'two.mp4', description: 'Same', object_name: 'two', is_published: true },
];
const saved = (lesson = lessons[0], attempts = 1, completed = false): UserProgress => ({
  id: 1, user_id: 1, lesson_id: lesson.lesson_id, word: 'Same', attempts, completed,
  completed_at: completed ? '2026-10-14T12:00:00Z' : null,
});
const repeat = () => screen.getByRole('button', { name: 'Я повторил(а) жест' }) as HTMLButtonElement;

describe('self practice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(videosApi.list).mockResolvedValue(lessons);
    vi.mocked(progressApi.list).mockResolvedValue([]);
    vi.mocked(progressApi.practice).mockResolvedValue(saved());
    vi.mocked(progressApi.complete).mockResolvedValue(saved(lessons[0], 1, true));
  });
  afterEach(cleanup);

  it('selects duplicate titles by ID and records practice without a prediction', async () => {
    render(<Learning />);
    await waitFor(() => expect(repeat().disabled).toBe(false));
    expect(screen.queryByText('Симулировать успех')).toBeNull();
    expect(screen.queryByText('Симулировать ошибку')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Same' })[1]);
    vi.mocked(progressApi.practice).mockResolvedValue(saved(lessons[1]));
    fireEvent.click(repeat());
    await screen.findByText('Самостоятельная практика сохранена.');
    expect(progressApi.practice).toHaveBeenCalledWith(lessons[1].lesson_id);
    expect(progressApi.complete).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Эталонный жест') as HTMLVideoElement).getAttribute('src')).toBe('/videos/stream/two');
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
});
