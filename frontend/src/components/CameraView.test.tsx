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

describe('camera lifecycle', () => {
  beforeEach(() => {
    getUserMedia.mockReset();
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
});
