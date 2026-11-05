// @vitest-environment jsdom
import React from 'react';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import Dictionary from './Dictionary';
import { buildApiUrl, publicApiClient } from '../services/apiClient';
import type { VideoInfo } from '../types/api';

const lessons: VideoInfo[] = [
  { id: 1, lesson_id: '11111111-1111-4111-8111-111111111111', filename: 'first.mp4',
    description: 'Одинаковое название', is_published: true,
    media_url: '/videos/lessons/11111111-1111-4111-8111-111111111111/content' },
  { id: 2, lesson_id: '22222222-2222-4222-8222-222222222222', filename: 'second.mp4',
    description: 'Одинаковое название', is_published: true,
    media_url: '/videos/lessons/22222222-2222-4222-8222-222222222222/content' },
];
const mock = new MockAdapter(publicApiClient);

afterEach(() => { cleanup(); mock.reset(); });
afterAll(() => mock.restore());

describe('Dictionary lesson media contract', () => {
  it('uses the public UUID catalog and server media path with duplicate titles', async () => {
    mock.onGet('/videos/lessons').reply(config => {
      expect(config.headers?.Authorization).toBeUndefined();
      return [200, lessons];
    });
    render(<Dictionary />);
    const choices = await screen.findAllByRole('button', { name: lessons[0].description! });
    expect((screen.getByLabelText('Эталонный жест') as HTMLVideoElement).src)
      .toBe(buildApiUrl(lessons[0].media_url));
    fireEvent.click(choices[1]);
    await waitFor(() => expect((screen.getByLabelText('Эталонный жест') as HTMLVideoElement).src)
      .toBe(buildApiUrl(lessons[1].media_url)));
    expect(mock.history.get).toHaveLength(1);
  });

  it('reports a media failure after a successful catalog response', async () => {
    mock.onGet('/videos/lessons').reply(200, lessons);
    render(<Dictionary />);
    const video = await screen.findByLabelText('Эталонный жест');
    fireEvent.error(video);
    expect(await screen.findByText('Не удалось загрузить видео')).toBeTruthy();
    expect(screen.queryByText('В словаре пока нет видео')).toBeNull();
  });
});
