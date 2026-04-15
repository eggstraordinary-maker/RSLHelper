import React, { useRef, useEffect, useState } from "react";

const CameraView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        // Запрашиваем разрешение и доступ к камере
        stream = await navigator.mediaDevices.getUserMedia({ video: true });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          // Ждём событие "loadedmetadata" перед воспроизведением
          videoRef.current.onloadedmetadata = async () => {
            try {
              await videoRef.current?.play();
              setIsActive(true);
            } catch (playError) {
              console.warn("Ошибка при воспроизведении видео:", playError);
              setError("Не удалось начать воспроизведение видео.");
            }
          };
        }
      } catch (err) {
        console.error("Ошибка доступа к камере:", err);
        setError("Не удалось получить доступ к камере: " + (err as Error).message);
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
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
        </>
      )}
    </div>
  );
};

export default CameraView;
