// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RecognitionAvailability from './RecognitionAvailability';
import { recognitionApi } from '../services/api';

vi.mock('../services/api', () => ({ recognitionApi: { status: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('shows unavailable status and retries a failed connection without inventing results', async () => {
  vi.mocked(recognitionApi.status).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({
    protocol_version: '1.0', available: false, configured: false, transport: 'websocket',
    reason: 'not_configured', max_frame_bytes: 262144, max_frames_per_second: 5, max_in_flight: 2,
  });
  render(<RecognitionAvailability />);
  await screen.findByText(/Соединение с сервисом распознавания не установлено/);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить доступность снова' }));
  await screen.findByText(/Сервис распознавания ещё не подключён/);
  expect(screen.getByText('Автоматическое распознавание сейчас недоступно.')).toBeTruthy();
  expect(recognitionApi.status).toHaveBeenCalledTimes(2);
});
