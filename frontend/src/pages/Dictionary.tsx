import React, { useState, useEffect } from 'react';
import LeftTOC from '../components/LeftTOC';

const API_URL = import.meta.env.VITE_API_URL;

interface VideoInfo {
  id: number;
  filename: string;
  description: string;
  object_name: string;
}

export default function Dictionary() {
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedObjectName, setSelectedObjectName] = useState<string | null>(null);
  const [selectedDescription, setSelectedDescription] = useState<string>('');

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  
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
        setListError('Не удалось загрузить список видео');
      } finally {
        setLoadingList(false);
      }
    };
    fetchVideos();
  }, []);

  useEffect(() => {
  if (!selectedObjectName) return;

  const url = `${API_URL}/videos/stream/${encodeURIComponent(selectedObjectName)}`;
  setVideoUrl(url);
  }, [selectedObjectName]);

  const handleSelect = (selectedDisplay: string) => {
    const video = videos.find(v => (v.description || v.filename) === selectedDisplay);
    if (video) {
      setSelectedObjectName(video.object_name);
      setSelectedDescription(video.description || video.filename);
    }
  };

  const tocItems = videos.map(v => v.description || v.filename);

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
        {loadingVideo && <div className="text-center py-8 text-gray-500">Загрузка видео...</div>}

        {videoError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
            {videoError}
          </div>
        )}

        {videoUrl && (
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

        <div>
          <label className="block text-sm font-medium mb-1">Выбранный жест</label>
          <input
            value={selectedDescription}
            readOnly
            className="w-full rounded-md border px-3 py-2 bg-gray-100 cursor-not-allowed"
          />
        </div>

        <div className="bg-white border rounded-lg p-4">
          <h4 className="font-semibold mb-2">Описание и советы по повторению жеста</h4>
          <p className="text-sm text-gray-600">
            Здесь будет текстовое описание выбранного жеста: положение рук, направление движений,
            темп и советы по запоминанию и повторению. (Заглушка)
          </p>
          <ul className="mt-3 text-sm text-gray-600 list-disc list-inside">
            <li>Разбейте жест на этапы и тренируйте по частям.</li>
            <li>Записывайте себя на видео и сравнивайте с эталоном.</li>
            <li>Тренируйтесь в медленном темпе, затем увеличивайте скорость.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}