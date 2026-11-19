// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstance, type i18n as I18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import Learning from './Learning';
import ruLearning from '../locales/ru/learning.json';
import enLearning from '../locales/en/learning.json';
import ruDictionary from '../locales/ru/dictionary.json';
import enDictionary from '../locales/en/dictionary.json';
import { learningApi, progressApi } from '../services/api';
import type { UserProgress, VideoInfo } from '../types/api';

vi.mock('../components/CameraView', () => ({ default: () => <div>Camera test boundary</div> }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { public_id: 'learner-test' }, completeLesson: progressApi.complete }) }));
vi.mock('../services/api', () => ({
  videosApi: { streamUrl: (mediaPath: string) => mediaPath },
  learningApi: { sections: vi.fn() },
  progressApi: { list: vi.fn(), practice: vi.fn(), complete: vi.fn() },
}));

const lessons: VideoInfo[] = [
  { id: 1, lesson_id: '11111111-1111-4111-8111-111111111111', filename: 'one.mp4', description: 'Same', media_url: '/videos/lessons/11111111-1111-4111-8111-111111111111/content', is_published: true, is_learning_material: true },
  { id: 2, lesson_id: '22222222-2222-4222-8222-222222222222', filename: 'two.mp4', description: 'Same', media_url: '/videos/lessons/22222222-2222-4222-8222-222222222222/content', is_published: true, is_learning_material: true },
];
const alphabet: VideoInfo[] = [
  { ...lessons[0], id: 3, lesson_id: '33333333-3333-4333-8333-333333333333', title: 'Е', alphabet_letter: 'Е' },
  { ...lessons[1], id: 4, lesson_id: '44444444-4444-4444-8444-444444444444', title: 'Буква ё', alphabet_letter: 'Ё' },
];
let i18n: I18n;
function renderLearning(path = '/learning') {
  const router = createMemoryRouter([{ path: '/learning', element: <Learning /> }], { initialEntries: [path] });
  return {
    router,
    ...render(<I18nextProvider i18n={i18n}><RouterProvider router={router} /></I18nextProvider>),
  };
}
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
  beforeEach(async () => {
    vi.resetAllMocks();
    i18n = createInstance();
    await i18n.use(initReactI18next).init({
      lng: 'ru', fallbackLng: 'ru',
      resources: {
        ru: { learning: ruLearning, dictionary: ruDictionary },
        en: { learning: enLearning, dictionary: enDictionary },
      },
      interpolation: { escapeValue: false },
    });
    vi.mocked(learningApi.sections).mockResolvedValue({ alphabet: [], basic: lessons });
    vi.mocked(progressApi.list).mockResolvedValue([]);
    vi.mocked(progressApi.practice).mockResolvedValue(saved());
    vi.mocked(progressApi.complete).mockResolvedValue(saved(lessons[0], 1, true));
  });
  afterEach(cleanup);

  it('reuses an unacknowledged request after an error and creates a new ID only after success', async () => {
    vi.mocked(progressApi.practice).mockRejectedValueOnce(new Error('response lost'));
    renderLearning();
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
    renderLearning();
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
    const first = renderLearning();
    const complete = await screen.findByRole('button', { name: 'Отметить урок пройденным' });
    await waitFor(() => expect((complete as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(complete);
    await screen.findByText('Урок отмечен пройденным.');
    expect(progressApi.complete).toHaveBeenCalledWith(lessons[0].lesson_id);
    expect(progressApi.practice).not.toHaveBeenCalled();
    first.unmount();
    vi.mocked(progressApi.list).mockResolvedValue([saved(lessons[0], 1, true)]);
    renderLearning();
    await screen.findByText('Урок пройден по вашей отметке.');
    expect((screen.getByRole('button', { name: 'Отметить урок пройденным' }) as HTMLButtonElement).disabled).toBe(true);
    expect(progressApi.list).toHaveBeenCalledTimes(2);
  });

  it('shows save failures and preserves the confirmed counter', async () => {
    vi.mocked(progressApi.list).mockResolvedValue([saved(lessons[0], 4)]);
    vi.mocked(progressApi.practice).mockRejectedValue(new Error('Offline'));
    renderLearning();
    await waitFor(() => expect(repeat().disabled).toBe(false));
    fireEvent.click(repeat());
    await screen.findByRole('alert');
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.queryByText('Самостоятельная практика сохранена.')).toBeNull();
    expect(repeat().disabled).toBe(false);
  });

  it('blocks writes until progress can be loaded and allows retry', async () => {
    vi.mocked(progressApi.list).mockRejectedValueOnce(new Error('Offline'));
    renderLearning();
    const retry = await screen.findByRole('button', { name: 'Повторить загрузку прогресса' });
    expect(repeat().disabled).toBe(true);
    fireEvent.click(retry);
    await waitFor(() => expect(repeat().disabled).toBe(false));
  });

  it('handles empty catalog and reloads a failed catalog', async () => {
    vi.mocked(learningApi.sections).mockRejectedValueOnce(new Error('Private error detail'))
      .mockResolvedValueOnce({ alphabet: [], basic: [] });
    renderLearning();
    await screen.findByText(ruLearning.catalogError);
    expect(screen.queryByText(ruLearning.emptySection)).toBeNull();
    expect(screen.queryByText('Private error detail')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Повторить загрузку уроков' }));
    await screen.findByText(ruLearning.emptySection);
    expect(screen.queryByRole('button', { name: 'Я повторил(а) жест' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Алфавит' })).toBeTruthy();
  });

  it('uses the server order, opens a deep link and preserves selection through history', async () => {
    vi.mocked(learningApi.sections).mockResolvedValue({ alphabet, basic: lessons });
    vi.mocked(progressApi.list).mockResolvedValue([saved(alphabet[1], 3)]);
    const path = `/learning?section=alphabet&lesson=${alphabet[1].lesson_id}`;
    const { router } = renderLearning(path);
    await screen.findByRole('heading', { name: 'Ё · Буква ё' });
    const toc = within(screen.getByRole('complementary', { name: ruLearning.contents }));
    expect(toc.getAllByRole('button').map(choice => choice.textContent)).toEqual(['Е', 'Ё · Буква ё']);
    await waitFor(() => expect(practice().getByText('3')).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Алфавит' }).getAttribute('aria-current')).toBe('page');

    fireEvent.click(screen.getByRole('link', { name: 'Базовые жесты' }));
    await screen.findByRole('heading', { name: 'Same' });
    expect(toc.queryByRole('button', { name: 'Ё · Буква ё' })).toBeNull();
    await act(async () => { await router.navigate(-1); });
    await screen.findByRole('heading', { name: 'Ё · Буква ё' });
    expect(practice().getByText('3')).toBeTruthy();
    expect(learningApi.sections).toHaveBeenCalledTimes(1);
  });

  it('keeps a confirmed lesson and its player if refreshing sections fails', async () => {
    renderLearning();
    const video = await screen.findByLabelText(ruDictionary.videoLabel);
    vi.mocked(learningApi.sections).mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: ruLearning.refreshCatalog }));
    await screen.findByText(ruLearning.catalogError);
    expect(screen.getByLabelText(ruDictionary.videoLabel)).toBe(video);
    expect(screen.queryByText(ruLearning.emptySection)).toBeNull();
  });

  it('keeps an incomplete lesson and its attempts when completion fails, then retries', async () => {
    vi.mocked(progressApi.list).mockResolvedValue([saved(lessons[0], 4)]);
    vi.mocked(progressApi.complete)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(saved(lessons[0], 4, true));
    renderLearning();
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
    renderLearning();
    const failedVideo = await screen.findByLabelText('Эталонный жест');
    fireEvent.error(failedVideo);
    const retry = screen.getByRole('button', { name: 'Повторить загрузку видео' });
    expect(screen.getByRole('alert').textContent).toContain(ruDictionary.videoError);
    expect(screen.queryByText(ruDictionary.loadingVideo)).toBeNull();

    fireEvent.click(retry);
    const retriedVideo = screen.getByLabelText('Эталонный жест');
    expect(retriedVideo).not.toBe(failedVideo);
    expect(retriedVideo.getAttribute('src')).toBe(lessons[0].media_url);
    expect(screen.queryByRole('button', { name: 'Повторить загрузку видео' })).toBeNull();
    expect(screen.getByText(ruDictionary.loadingVideo)).toBeTruthy();

    fireEvent.loadedData(retriedVideo);
    expect(screen.queryByText(ruDictionary.loadingVideo)).toBeNull();
    expect(screen.queryByText(ruDictionary.videoError)).toBeNull();
  });

  it.each(['practice', 'completion'] as const)('sends only one %s request for rapid repeated clicks', async action => {
    const pending = deferred<UserProgress>();
    vi.mocked(progressApi.list).mockResolvedValue([saved(lessons[0], 2)]);
    const request = action === 'practice' ? progressApi.practice : progressApi.complete;
    vi.mocked(request).mockReturnValue(pending.promise);
    renderLearning();
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
    renderLearning();
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
