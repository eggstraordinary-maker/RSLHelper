// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInstance, type i18n as I18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import MockAdapter from 'axios-mock-adapter';
import Dictionary from './Dictionary';
import { buildApiUrl, publicApiClient } from '../services/apiClient';
import type { VideoInfo } from '../types/api';
import ru from '../locales/ru/dictionary.json';
import en from '../locales/en/dictionary.json';

const lessons: VideoInfo[] = [
  { id: 1, lesson_id: '11111111-1111-4111-8111-111111111111', filename: 'first.mp4',
    description: 'Одинаковое название', is_published: true,
    media_url: '/videos/lessons/11111111-1111-4111-8111-111111111111/content' },
  { id: 2, lesson_id: '22222222-2222-4222-8222-222222222222', filename: 'second.mp4',
    description: 'Одинаковое название', is_published: true,
    media_url: '/videos/lessons/22222222-2222-4222-8222-222222222222/content' },
];
const mock = new MockAdapter(publicApiClient);
let i18n: I18n;
const renderDictionary = (strict = false) => render(
  <I18nextProvider i18n={i18n}>{strict ? <StrictMode><Dictionary /></StrictMode> : <Dictionary />}</I18nextProvider>,
);
const video = () => screen.getByLabelText(ru.videoLabel) as HTMLVideoElement;
const choices = () => within(screen.getByRole('complementary', { name: ru.contents })).getAllByRole('button');
const deferredReply = () => {
  let resolve!: (value: [number, unknown]) => void;
  const promise = new Promise<[number, unknown]>(done => { resolve = done; });
  return { promise, resolve };
};

beforeEach(async () => {
  i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: 'ru', fallbackLng: 'ru', defaultNS: 'dictionary',
    resources: { ru: { dictionary: ru }, en: { dictionary: en } },
    interpolation: { escapeValue: false },
  });
});
afterEach(() => { cleanup(); mock.reset(); });
afterAll(() => mock.restore());

describe('Dictionary catalog', () => {
  it('uses the public UUID catalog and selects duplicate titles by ID', async () => {
    mock.onGet('/videos/lessons').reply(config => {
      expect(config.headers?.Authorization).toBeUndefined();
      return [200, lessons];
    });
    renderDictionary();
    await screen.findAllByRole('button', { name: lessons[0].description! });
    expect(video().src).toBe(buildApiUrl(lessons[0].media_url));
    expect(choices()[0].getAttribute('aria-current')).toBe('true');
    fireEvent.click(choices()[1]);
    expect(video().src).toBe(buildApiUrl(lessons[1].media_url));
    expect(choices()[1].getAttribute('aria-current')).toBe('true');
    expect(choices()[0].getAttribute('aria-current')).toBeNull();
    expect(mock.history.get).toHaveLength(1);
  });

  it('distinguishes pending from empty and disables repeated list requests', async () => {
    const pending = deferredReply();
    mock.onGet('/videos/lessons').reply(() => pending.promise);
    renderDictionary();
    expect(screen.getByRole('status').textContent).toBe(ru.loadingCatalog);
    expect(screen.queryByText(ru.emptyCatalog)).toBeNull();
    const refresh = screen.getByRole('button', { name: ru.refreshCatalog }) as HTMLButtonElement;
    expect(refresh.disabled).toBe(true);
    fireEvent.click(refresh);
    expect(mock.history.get).toHaveLength(1);
    await act(async () => { pending.resolve([200, lessons]); });
    expect(screen.queryByText(ru.loadingCatalog)).toBeNull();
    expect(screen.getByText(ru.loadingVideo)).toBeTruthy();
    fireEvent.loadedData(video());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('retries a list failure without presenting an empty dictionary or backend details', async () => {
    mock.onGet('/videos/lessons').replyOnce(503, { detail: 'Internal database connection details' });
    const pending = deferredReply();
    mock.onGet('/videos/lessons').reply(() => pending.promise);
    renderDictionary();
    expect((await screen.findByRole('alert')).textContent).toBe(ru.catalogError);
    expect(screen.queryByText(ru.emptyCatalog)).toBeNull();
    expect(screen.queryByText(/Internal database/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ru.retryCatalog }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button', { name: ru.refreshCatalog }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: ru.refreshCatalog }));
    await act(async () => { pending.resolve([200, lessons]); });
    expect(video()).toBeTruthy();
    expect(mock.history.get).toHaveLength(2);
  });

  it('offers refresh after a genuinely empty list', async () => {
    mock.onGet('/videos/lessons').replyOnce(200, []);
    mock.onGet('/videos/lessons').reply(200, lessons);
    renderDictionary();
    await screen.findByText(ru.emptyCatalog);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByLabelText(ru.videoLabel)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ru.refreshCatalog }));
    await screen.findByLabelText(ru.videoLabel);
    expect(screen.queryByText(ru.emptyCatalog)).toBeNull();
  });

  it('keeps the confirmed list, selection and playing element on a refresh failure', async () => {
    mock.onGet('/videos/lessons').replyOnce(200, lessons);
    const pending = deferredReply();
    mock.onGet('/videos/lessons').replyOnce(() => pending.promise);
    mock.onGet('/videos/lessons').reply(200, [...lessons].reverse());
    renderDictionary();
    await screen.findByLabelText(ru.videoLabel);
    fireEvent.click(choices()[1]);
    const selectedVideo = video();
    fireEvent.loadedData(selectedVideo);
    fireEvent.click(screen.getByRole('button', { name: ru.refreshCatalog }));
    expect(video()).toBe(selectedVideo);
    await act(async () => { pending.resolve([503, {}]); });
    expect(screen.getByRole('alert').textContent).toBe(ru.catalogError);
    expect(video()).toBe(selectedVideo);
    expect(choices()[1].getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: ru.retryCatalog }));
    await waitFor(() => expect(choices()[0].getAttribute('aria-current')).toBe('true'));
    expect(video()).toBe(selectedVideo);
    expect(video().src).toBe(buildApiUrl(lessons[1].media_url));
  });

  it('falls back to an available UUID and removes stale media when the list becomes empty', async () => {
    mock.onGet('/videos/lessons').replyOnce(200, lessons);
    mock.onGet('/videos/lessons').replyOnce(200, [lessons[0]]);
    mock.onGet('/videos/lessons').reply(200, []);
    renderDictionary();
    await screen.findByLabelText(ru.videoLabel);
    fireEvent.click(choices()[1]);
    fireEvent.click(screen.getByRole('button', { name: ru.refreshCatalog }));
    await waitFor(() => expect(video().src).toBe(buildApiUrl(lessons[0].media_url)));
    fireEvent.click(screen.getByRole('button', { name: ru.refreshCatalog }));
    await screen.findByText(ru.emptyCatalog);
    expect(screen.queryByLabelText(ru.videoLabel)).toBeNull();
    expect(screen.queryByLabelText(ru.selectedSign)).toBeNull();
  });

  it('aborts StrictMode cleanup and ignores an older response arriving after the new one', async () => {
    const obsolete = deferredReply();
    mock.onGet('/videos/lessons').replyOnce(() => obsolete.promise);
    mock.onGet('/videos/lessons').reply(200, [lessons[1]]);
    renderDictionary(true);
    await screen.findByLabelText(ru.videoLabel);
    expect(mock.history.get).toHaveLength(2);
    expect(mock.history.get[0].signal?.aborted).toBe(true);
    expect(mock.history.get[1].signal?.aborted).toBe(false);
    await act(async () => { obsolete.resolve([200, [lessons[0]]]); });
    expect(video().src).toBe(buildApiUrl(lessons[1].media_url));
    expect(choices()).toHaveLength(1);
  });

  it('keeps the fallback selection when a previously removed lesson reappears', async () => {
    mock.onGet('/videos/lessons').replyOnce(200, lessons);
    mock.onGet('/videos/lessons').replyOnce(200, [lessons[0]]);
    mock.onGet('/videos/lessons').reply(200, lessons);
    renderDictionary();
    await screen.findByLabelText(ru.videoLabel);
    fireEvent.click(choices()[1]);
    fireEvent.click(screen.getByRole('button', { name: ru.refreshCatalog }));
    await waitFor(() => expect(choices()).toHaveLength(1));
    const fallback = video();
    fireEvent.click(screen.getByRole('button', { name: ru.refreshCatalog }));
    await waitFor(() => expect(choices()).toHaveLength(2));
    expect(video()).toBe(fallback);
    expect(choices()[0].getAttribute('aria-current')).toBe('true');
  });

  it('aborts unmount and does not leak its late failure into a new page instance', async () => {
    const obsolete = deferredReply();
    mock.onGet('/videos/lessons').replyOnce(() => obsolete.promise);
    mock.onGet('/videos/lessons').reply(200, lessons);
    const first = renderDictionary();
    first.unmount();
    expect(mock.history.get[0].signal?.aborted).toBe(true);
    renderDictionary();
    await screen.findByLabelText(ru.videoLabel);
    await act(async () => { obsolete.resolve([503, {}]); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(choices()).toHaveLength(2);
  });
});

describe('Dictionary media and metadata', () => {
  it('keeps catalog and media failures independent during either retry', async () => {
    mock.onGet('/videos/lessons').replyOnce(200, lessons);
    mock.onGet('/videos/lessons').replyOnce(503, {});
    mock.onGet('/videos/lessons').reply(200, lessons);
    renderDictionary();
    const initial = await screen.findByLabelText(ru.videoLabel);
    fireEvent.error(initial);
    fireEvent.click(screen.getByRole('button', { name: ru.refreshCatalog }));
    await screen.findByText(ru.catalogError);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: ru.retryVideo }));
    fireEvent.loadedData(video());
    expect(screen.getByRole('alert').textContent).toBe(ru.catalogError);
    expect(mock.history.get).toHaveLength(2);
    fireEvent.error(video());
    fireEvent.click(screen.getByRole('button', { name: ru.retryCatalog }));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    expect(screen.getByRole('alert').textContent).toContain(ru.videoError);
    expect(mock.history.get).toHaveLength(3);
  });

  it('retries only the current video, restores focus and ignores discarded attempt events', async () => {
    mock.onGet('/videos/lessons').reply(200, lessons);
    renderDictionary();
    const first = await screen.findByLabelText(ru.videoLabel);
    fireEvent.error(first);
    expect(screen.getByRole('alert').textContent).toContain(ru.videoError);
    expect(screen.queryByText(ru.emptyCatalog)).toBeNull();
    fireEvent.loadedData(first);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ru.retryVideo }));
    const retry = video();
    expect(retry).not.toBe(first);
    expect(retry.src).toBe(buildApiUrl(lessons[0].media_url));
    expect(document.activeElement).toBe(retry);
    expect(screen.getByText(ru.loadingVideo)).toBeTruthy();
    fireEvent.error(first);
    fireEvent.loadedData(first);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(ru.loadingVideo)).toBeTruthy();
    fireEvent.loadedData(retry);
    expect(screen.queryByText(ru.loadingVideo)).toBeNull();
    expect(mock.history.get).toHaveLength(1);
  });

  it('isolates rapid A/B/A selection from old media success and failure events', async () => {
    mock.onGet('/videos/lessons').reply(200, lessons);
    renderDictionary();
    const oldA = await screen.findByLabelText(ru.videoLabel);
    fireEvent.click(choices()[1]);
    const oldB = video();
    fireEvent.error(oldB);
    fireEvent.click(choices()[0]);
    const currentA = video();
    expect(currentA).not.toBe(oldA);
    fireEvent.error(oldA);
    fireEvent.loadedData(oldB);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(ru.loadingVideo)).toBeTruthy();
    fireEvent.loadedData(currentA);
    fireEvent.error(oldB);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(ru.loadingVideo)).toBeNull();
    expect(video().src).toBe(buildApiUrl(lessons[0].media_url));
  });

  it('shows real escaped metadata, filename fallback and an explicit missing description', async () => {
    const description = '<script>not executable</script>\nПоложение рук и движение';
    mock.onGet('/videos/lessons').reply(200, [
      { ...lessons[0], description }, { ...lessons[1], description: '  ' },
    ]);
    renderDictionary();
    await screen.findByLabelText(ru.videoLabel);
    const metadata = screen.getByRole('region', { name: ru.descriptionTitle });
    expect(metadata.textContent).toContain(description);
    expect(metadata.querySelector('script')).toBeNull();
    expect((screen.getByLabelText(ru.selectedSign) as HTMLInputElement).value).toBe(description.replace(/\s+/g, ' '));
    fireEvent.click(screen.getByRole('button', { name: lessons[1].filename }));
    expect((screen.getByLabelText(ru.selectedSign) as HTMLInputElement).value).toBe(lessons[1].filename);
    expect(screen.getByText(ru.noDescription)).toBeTruthy();
    expect(screen.queryByText(/Заглушка/)).toBeNull();
  });

  it('remounts media when a refreshed UUID keeps its identity but changes media path', async () => {
    mock.onGet('/videos/lessons').replyOnce(200, lessons);
    mock.onGet('/videos/lessons').reply(200, [{ ...lessons[0], media_url: '/videos/lessons/replaced/content' }]);
    renderDictionary();
    const old = await screen.findByLabelText(ru.videoLabel);
    fireEvent.loadedData(old);
    fireEvent.click(screen.getByRole('button', { name: ru.refreshCatalog }));
    await waitFor(() => expect(video()).not.toBe(old));
    expect(screen.getByText(ru.loadingVideo)).toBeTruthy();
    fireEvent.error(old);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Dictionary RU/EN', () => {
  it.each(['ru', 'en'] as const)('localizes pending, failure, empty and video states in %s', async language => {
    await i18n.changeLanguage(language);
    const strings = language === 'ru' ? ru : en;
    const pending = deferredReply();
    mock.onGet('/videos/lessons').replyOnce(() => pending.promise);
    mock.onGet('/videos/lessons').replyOnce(200, []);
    mock.onGet('/videos/lessons').reply(200, [{ ...lessons[0], description: null }]);
    renderDictionary();
    expect(screen.getByRole('heading', { name: strings.title })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(strings.loadingCatalog);
    await act(async () => { pending.resolve([503, {}]); });
    expect(screen.getByRole('alert').textContent).toBe(strings.catalogError);
    fireEvent.click(screen.getByRole('button', { name: strings.retryCatalog }));
    await screen.findByText(strings.emptyCatalog);
    fireEvent.click(screen.getByRole('button', { name: strings.refreshCatalog }));
    const media = await screen.findByLabelText(strings.videoLabel);
    expect(screen.getByRole('complementary', { name: strings.contents })).toBeTruthy();
    expect(screen.getByText(strings.noDescription)).toBeTruthy();
    expect(screen.getByLabelText(strings.selectedSign)).toBeTruthy();
    expect(screen.getByRole('region', { name: strings.mediaSection })).toBeTruthy();
    expect(screen.getByText(strings.loadingVideo)).toBeTruthy();
    fireEvent.error(media);
    expect(screen.getByRole('alert').textContent).toContain(strings.videoError);
    fireEvent.click(screen.getByRole('button', { name: strings.retryVideo }));
    fireEvent.loadedData(screen.getByLabelText(strings.videoLabel));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('translates the current error without refetching or losing the selected media', async () => {
    mock.onGet('/videos/lessons').reply(200, lessons);
    renderDictionary();
    await screen.findByLabelText(ru.videoLabel);
    fireEvent.click(choices()[1]);
    const selected = video();
    fireEvent.error(selected);
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByRole('alert').textContent).toContain(en.videoError);
    expect(screen.getByLabelText(en.videoLabel)).toBe(selected);
    expect(screen.getByRole('button', { name: en.retryVideo })).toBeTruthy();
    expect(mock.history.get).toHaveLength(1);
  });
});
