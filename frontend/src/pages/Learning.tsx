import React, { useState, useEffect } from 'react';
import LeftTOC from '../components/LeftTOC';
import CameraView from '../components/CameraView';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL;

interface VideoInfo {
  id: number;
  filename: string;
  description: string;
  object_name: string;
}

export default function Learning() {
  const { completeLesson } = useAuth();

  // Состояния для списка видео
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Выбранное видео
  const [selectedObjectName, setSelectedObjectName] = useState<string | null>(null);
  const [selectedDescription, setSelectedDescription] = useState<string>('');

  // Видео URL
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Результат распознавания (симуляция)
  const [recognizeResult, setRecognizeResult] = useState<string>('—');

  // Загрузка списка видео при монтировании
  useEffect(() => {
    const fetchVideos = async () => {
      setLoadingList(true);
      setListError(null);
      try {
        const response = await fetch(`${API_URL}/videos/`);
        if (!response.ok) {
          throw new Error('Ошибка загрузки списка видео');
        }
        const data = await response.json();
        setVideos(data);

        if (data.length > 0) {
          setSelectedObjectName(data[0].object_name);
          setSelectedDescription(data[0].description || data[0].filename);
        }
      } catch (err) {
        setListError('Не удалось загрузить список жестов');
      } finally {
        setLoadingList(false);
      }
    };
    fetchVideos();
  }, []);

  // Загрузка видео при выборе объекта
  useEffect(() => {
    if (!selectedObjectName) return;

    const fetchVideoUrl = async () => {
      setLoadingVideo(true);
      setVideoError(null);
      try {
        const response = await fetch(`${API_URL}/videos/stream/${encodeURIComponent(selectedObjectName)}`);
        if (!response.ok) {
          throw new Error('Видео не найдено');
        }
        // Прямой URL на прокси-эндпоинт
        setVideoUrl(`${API_URL}/videos/stream/${encodeURIComponent(selectedObjectName)}`);
      } catch (err) {
        setVideoError('Не удалось загрузить видео');
      } finally {
        setLoadingVideo(false);
      }
    };

    fetchVideoUrl();
  }, [selectedObjectName]);

  const handleSelect = (selectedDisplay: string) => {
    const video = videos.find(v => (v.description || v.filename) === selectedDisplay);
    if (video) {
      setSelectedObjectName(video.object_name);
      setSelectedDescription(video.description || video.filename);
    }
  };

  const tocItems = videos.map(v => v.description || v.filename);

  // Обработчики симуляции распознавания
  const handleSuccess = async () => {
    setRecognizeResult(`Совпадение: жест распознан как «${selectedDescription}»`);
    try {
      await completeLesson(selectedDescription);
      console.log(`Прогресс сохранён для слова "${selectedDescription}"`);
    } catch (err) {
      console.error('Ошибка сохранения прогресса', err);
    }
  };

  const handleFail = () => {
    setRecognizeResult('Не совпадает: попробуйте снова');
  };

  const handleReset = () => {
    setRecognizeResult('—');
  };

  // Состояния загрузки и ошибок
  if (loadingList) {
    return <div className="text-center py-8">Загрузка списка жестов...</div>;
  }

  if (listError) {
    return <div className="bg-red-50 text-red-700 p-4 rounded-lg">{listError}</div>;
  }

  if (videos.length === 0) {
    return <div className="text-center py-8 text-gray-500">В словаре пока нет видео</div>;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[auto_1fr] gap-4 lg:gap-6">
      <LeftTOC items={tocItems} active={selectedDescription} onSelect={handleSelect} />

      <div className="space-y-4">
        {/* Видеоплеер */}
        {loadingVideo && <div className="text-center py-8 text-gray-500">Загрузка видео...</div>}
        {videoError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
            {videoError}
          </div>
        )}
        {videoUrl && !loadingVideo && (
          <video
            key={videoUrl}
            src={videoUrl}
            controls
            className="w-full rounded-lg shadow-md"
            autoPlay={false}
          />
        )}
        {!loadingVideo && !videoError && !videoUrl && selectedObjectName && (
          <div className="bg-gray-100 w-full h-64 flex items-center justify-center rounded-lg">
            <p className="text-gray-500">Видео не загружено</p>
          </div>
        )}

        {/* Поле с выбранным жестом */}
        <div>
          <label className="block text-sm font-medium mb-1">Слово для распознавания</label>
          <input
            value={selectedDescription}
            readOnly
            className="w-full rounded-md border px-3 py-2 bg-gray-100 cursor-not-allowed"
            placeholder="Слово"
          />
        </div>

        {/* Компонент камеры */}
        <CameraView />

        {/* Блок результатов и кнопок */}
        <div className="bg-white border rounded-lg p-4">
          <h4 className="font-semibold mb-2">Результат распознавания</h4>
          <div className="text-lg text-gray-700 min-h-[56px] flex items-center">
            {recognizeResult}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSuccess}
              className="px-3 py-2 rounded bg-indigo-600 text-white text-sm"
            >
              Симулировать успех
            </button>
            <button
              onClick={handleFail}
              className="px-3 py-2 rounded border text-sm"
            >
              Симулировать ошибку
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded border text-sm"
            >
              Сброс
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}