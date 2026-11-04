import React, { useEffect, useRef, useState } from 'react';
import RecognitionAvailability from './RecognitionAvailability';

type CameraState = 'idle' | 'starting' | 'active' | 'denied' | 'missing' | 'disconnected' | 'unsupported' | 'insecure' | 'error';
const messages: Record<CameraState, string> = {
  idle: 'Камера выключена.',
  starting: 'Запуск камеры…',
  active: 'Камера включена для самопроверки. Видео не отправляется на сервер.',
  denied: 'Доступ к камере запрещён. Разрешите его в настройках браузера и повторите попытку.',
  missing: 'Камера не найдена. Подключите устройство и повторите попытку.',
  disconnected: 'Камера отключена или занята другим приложением. Проверьте подключение.',
  unsupported: 'Этот браузер не поддерживает доступ к камере.',
  insecure: 'Для доступа к камере откройте приложение через HTTPS или localhost.',
  error: 'Не удалось включить камеру. Повторите попытку.',
};

export default function CameraView() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const starting = useRef(false);
  const [state, setState] = useState<CameraState>('idle');

  const release = () => {
    if (stream.current) {
      stream.current.getTracks().forEach(track => {
        track.onended = null;
        track.stop();
      });
      stream.current = null;
    }
    if (video.current) video.current.srcObject = null;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      starting.current = false;
      release();
    };
  }, []);

  const stop = () => {
    generation.current += 1;
    starting.current = false;
    release();
    setState('idle');
  };

  const start = async () => {
    if (starting.current || stream.current) return;
    if (!window.isSecureContext) { setState('insecure'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setState('unsupported'); return; }
    const request = ++generation.current;
    starting.current = true;
    setState('starting');
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      if (!mounted.current || request !== generation.current) {
        acquired.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = acquired;
      acquired.getTracks().forEach(track => {
        track.onended = () => {
          if (mounted.current && request === generation.current) {
            generation.current += 1;
            starting.current = false;
            release();
            setState('disconnected');
          }
        };
      });
      if (!video.current) { release(); return; }
      video.current.srcObject = acquired;
      await video.current.play();
      if (mounted.current && request === generation.current) setState('active');
    } catch (error) {
      if (!mounted.current || request !== generation.current) return;
      release();
      // DOMException and errors from another realm need not inherit this Error.
      const name = typeof error === 'object' && error !== null && 'name' in error
        && typeof error.name === 'string' ? error.name : '';
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'missing'
        : name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError' ? 'disconnected' : 'error');
    } finally {
      if (request === generation.current) starting.current = false;
    }
  };

  return <section className="space-y-3 rounded-lg border bg-white p-4" aria-label="Камера для самопроверки">
    <RecognitionAvailability />
    <video ref={video} hidden={state !== 'active'} autoPlay playsInline muted aria-label="Просмотр камеры"
      className="w-full max-w-md rounded-lg border" />
    <p role="status" aria-live="polite">{messages[state]}</p>
    <div className="flex flex-wrap gap-2">
      {state === 'active' || state === 'starting'
        ? <button onClick={stop} className="rounded border px-3 py-2">{state === 'starting' ? 'Отменить запуск камеры' : 'Выключить камеру'}</button>
        : <button onClick={() => void start()} className="rounded bg-indigo-600 px-3 py-2 text-white">Включить камеру</button>}
    </div>
  </section>;
}
