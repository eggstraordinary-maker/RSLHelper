// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CameraView from './CameraView';

vi.mock('./RecognitionAvailability', () => ({ default: () => <div>Recognition unavailable</div> }));
const getUserMedia = vi.fn();
const track = () => ({ stop: vi.fn(), onended: null as (() => void) | null });
const media = (tracks = [track()]) => ({ getTracks: () => tracks }) as unknown as MediaStream;
const start = () => fireEvent.click(screen.getByRole('button', { name: 'Включить камеру' }));
const initialMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

describe('camera lifecycle', () => {
  beforeEach(() => {
    getUserMedia.mockReset();
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (initialMediaDevices) Object.defineProperty(navigator, 'mediaDevices', initialMediaDevices);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('requests access only on click and stops every track on stop and unmount', async () => {
    const tracks = [track(), track()];
    getUserMedia.mockResolvedValue(media(tracks));
    const view = render(<CameraView />);
    expect(getUserMedia).not.toHaveBeenCalled();
    start();
    await screen.findByRole('button', { name: 'Выключить камеру' });
    fireEvent.click(screen.getByRole('button', { name: 'Выключить камеру' }));
    tracks.forEach(item => expect(item.stop).toHaveBeenCalledTimes(1));
    start();
    await screen.findByRole('button', { name: 'Выключить камеру' });
    view.unmount();
    tracks.forEach(item => expect(item.stop).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['NotAllowedError', /Доступ к камере запрещён/],
    ['NotFoundError', /Камера не найдена/],
    ['NotReadableError', /Камера отключена или занята/],
  ])('distinguishes %s and offers retry', async (name, message) => {
    getUserMedia.mockRejectedValue(new DOMException('test', name));
    render(<CameraView />);
    start();
    await screen.findByText(message);
    expect(screen.getByRole('button', { name: 'Включить камеру' })).toBeTruthy();
  });

  it('stops a stream that arrives after cancellation or unmount', async () => {
    const tracks = [track()];
    let resolve!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValue(new Promise<MediaStream>(done => { resolve = done; }));
    const view = render(<CameraView />);
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Отменить запуск камеры' }));
    view.unmount();
    await act(async () => { resolve(media(tracks)); });
    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
  });

  it('releases the other tracks when the camera disconnects', async () => {
    const tracks = [track(), track()];
    getUserMedia.mockResolvedValue(media(tracks));
    render(<CameraView />);
    start();
    await screen.findByRole('button', { name: 'Выключить камеру' });
    act(() => { tracks[0].onended?.(); });
    expect(screen.getByText(/Камера отключена или занята/)).toBeTruthy();
    tracks.forEach(item => expect(item.stop).toHaveBeenCalledTimes(1));
  });

  it('does not request camera access in an insecure context', () => {
    vi.stubGlobal('isSecureContext', false);
    render(<CameraView />);
    start();
    expect(screen.getByText(/HTTPS или localhost/)).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it.each([
    ['mediaDevices is absent', undefined],
    ['getUserMedia is absent', {}],
  ])('explains unsupported browsers when %s', (_description, devices) => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: devices });
    render(<CameraView />);
    start();
    expect(screen.getByText('Этот браузер не поддерживает доступ к камере.')).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Включить камеру' })).toBeTruthy();
  });

  it('releases all tracks after playback fails and allows a fresh successful start', async () => {
    const failedTracks = [track(), track()];
    const nextTracks = [track()];
    getUserMedia.mockResolvedValueOnce(media(failedTracks)).mockResolvedValueOnce(media(nextTracks));
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Playback failed'));
    render(<CameraView />);
    start();
    await screen.findByText('Не удалось включить камеру. Повторите попытку.');
    failedTracks.forEach(item => {
      expect(item.stop).toHaveBeenCalledTimes(1);
      expect(item.onended).toBeNull();
    });
    expect((screen.getByLabelText('Просмотр камеры') as HTMLVideoElement).srcObject).toBeNull();

    start();
    await screen.findByRole('button', { name: 'Выключить камеру' });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(nextTracks[0].stop).not.toHaveBeenCalled();
    expect(screen.queryByText('Не удалось включить камеру. Повторите попытку.')).toBeNull();
  });

  it('shows a retryable generic error for an unknown camera failure', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('Unknown device failure')).mockResolvedValueOnce(media());
    render(<CameraView />);
    start();
    await screen.findByText('Не удалось включить камеру. Повторите попытку.');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    start();
    await screen.findByRole('button', { name: 'Выключить камеру' });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('cancels permission acquisition without unmounting and stops the late stream', async () => {
    const cancelledTracks = [track(), track()];
    let resolve!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValueOnce(new Promise<MediaStream>(done => { resolve = done; }));
    render(<CameraView />);
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Отменить запуск камеры' }));
    expect(screen.getByText('Камера выключена.')).toBeTruthy();
    await act(async () => { resolve(media(cancelledTracks)); });
    cancelledTracks.forEach(item => expect(item.stop).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Камера выключена.')).toBeTruthy();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Просмотр камеры') as HTMLVideoElement).srcObject).toBeNull();

    const nextTracks = [track()];
    getUserMedia.mockResolvedValueOnce(media(nextTracks));
    start();
    await screen.findByRole('button', { name: 'Выключить камеру' });
    expect(nextTracks[0].stop).not.toHaveBeenCalled();
  });

  it('does not replace or stop a new active stream when a cancelled acquisition resolves later', async () => {
    const cancelledTracks = [track()];
    const currentTracks = [track()];
    const currentStream = media(currentTracks);
    let resolveCancelled!: (stream: MediaStream) => void;
    getUserMedia
      .mockReturnValueOnce(new Promise<MediaStream>(done => { resolveCancelled = done; }))
      .mockResolvedValueOnce(currentStream);
    render(<CameraView />);
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Отменить запуск камеры' }));
    start();
    await screen.findByRole('button', { name: 'Выключить камеру' });

    await act(async () => { resolveCancelled(media(cancelledTracks)); });
    expect(cancelledTracks[0].stop).toHaveBeenCalledTimes(1);
    expect(currentTracks[0].stop).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Просмотр камеры') as HTMLVideoElement).srcObject).toBe(currentStream);
    expect(screen.getByRole('button', { name: 'Выключить камеру' })).toBeTruthy();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });
});
