import React, { useRef, useEffect, useState, useCallback } from "react";

interface CameraViewProps {
  onGesture?: (gesture: string) => void;
}

const CameraView: React.FC<CameraViewProps> = ({ onGesture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const animationRef = useRef<number>();
  const pingIntervalRef = useRef<NodeJS.Timeout>();
  const onGestureRef = useRef(onGesture);

  // Обновляем реф при изменении onGesture (чтобы не пересоздавать эффект)
  useEffect(() => {
    onGestureRef.current = onGesture;
  }, [onGesture]);

  // Функция отправки кадров (вызывается после старта камеры)
  const startSendingFrames = useCallback(() => {
    let frameCount = 0;
    const sendFrame = () => {
      const ws = wsRef.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!ws || ws.readyState !== WebSocket.OPEN || !video || !canvas) {
        animationRef.current = requestAnimationFrame(sendFrame);
        return;
      }

      if (video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frameCount++;
          if (frameCount % 10 === 0) { // Отправляем каждый 10-й кадр
            const frameData = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
            ws.send(frameData);
          }
        }
      }
      animationRef.current = requestAnimationFrame(sendFrame);
    };
    sendFrame();
  }, []);

  // Запуск камеры
  const startVideo = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsActive(true);
          startSendingFrames(); // Начинаем отправлять кадры
        };
      }
    } catch (err) {
      console.error("Ошибка доступа к камере:", err);
      setError("Не удалось получить доступ к камере: " + (err as Error).message);
    }
  }, [startSendingFrames]);

  // Инициализация WebSocket (один раз при монтировании)
  useEffect(() => {
    if (wsRef.current) return; // Защита от двойного вызова в StrictMode
    const ws = new WebSocket('ws://localhost:8001/recognize');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      ws.send('ping'); // Немедленный пинг
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 12000);
      startVideo(); // Запускаем камеру после открытия сокета
    };

    ws.onmessage = (event) => {
      const dataStr = event.data;
      if (dataStr === "pong") return;
      try {
        const data = JSON.parse(dataStr);
        if (data.gesture && onGestureRef.current) {
          onGestureRef.current(data.gesture);
        }
      } catch (err) {
        console.warn("Received non-JSON message (maybe error):", dataStr);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      // Не показываем ошибку, если сокет уже закрывается
      if (ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
        setError('Ошибка подключения к сервису распознавания');
      }
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed', event.code, event.reason);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [startVideo]); // startVideo стабилен, эффект не перезапускается

  // Очистка видео при размонтировании
  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      {error ? (
        <div className="text-red-500">{error}</div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-w-md rounded-lg border shadow"
          />
          {!isActive && <div className="text-gray-500">Запуск камеры...</div>}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </>
      )}
    </div>
  );
};

export default CameraView;