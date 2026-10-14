import React, { useEffect, useRef, useState } from 'react';
import LeftTOC from '../components/LeftTOC';
import CameraView from '../components/CameraView';
import { useAuth } from '../contexts/AuthContext';
import { progressApi, videosApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiClient';
import type { UserProgress, VideoInfo } from '../types/api';

export default function Learning() {
  const { completeLesson } = useAuth();
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [progressRetry, setProgressRetry] = useState(0);
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, UserProgress>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ lessonId: string; text: string; error: boolean } | null>(null);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [videoRetry, setVideoRetry] = useState(0);
  const mounted = useRef(false);
  const saveInFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setListError(null);
    void videosApi.list().then(data => {
      if (cancelled) return;
      setVideos(data);
      setSelectedId(previous => data.some(v => v.lesson_id === previous) ? previous : data[0]?.lesson_id || '');
    }).catch(error => {
      if (!cancelled) setListError(getApiErrorMessage(error, 'Не удалось загрузить уроки'));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [catalogRetry]);

  useEffect(() => {
    let cancelled = false;
    setProgressLoading(true);
    setProgressError(null);
    void progressApi.list().then(data => {
      if (!cancelled) setProgress(Object.fromEntries(data.map(row => [row.lesson_id, row])));
    }).catch(error => {
      if (!cancelled) setProgressError(getApiErrorMessage(error, 'Не удалось загрузить прогресс'));
    }).finally(() => { if (!cancelled) setProgressLoading(false); });
    return () => { cancelled = true; };
  }, [progressRetry]);

  const selected = videos.find(v => v.lesson_id === selectedId);
  const lessonProgress = progress[selectedId];

  useEffect(() => {
    setVideoLoading(true);
    setVideoError(false);
  }, [selectedId, videoRetry]);

  const savePractice = async (complete: boolean) => {
    if (!selected || saveInFlight.current || progressLoading || progressError) return;
    const lessonId = selected.lesson_id;
    saveInFlight.current = true;
    setSaving(true);
    setNotice(null);
    try {
      const saved = complete ? await completeLesson(lessonId) : await progressApi.practice(lessonId);
      if (mounted.current) {
        setProgress(previous => ({ ...previous, [lessonId]: saved }));
        setNotice({ lessonId, error: false, text: complete ? 'Урок отмечен пройденным.' : 'Самостоятельная практика сохранена.' });
      }
    } catch (error) {
      if (mounted.current) setNotice({ lessonId, error: true, text: getApiErrorMessage(error, 'Не удалось сохранить прогресс. Повторите попытку.') });
    } finally {
      saveInFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  if (loading) return <div role="status" className="py-8 text-center">Загрузка уроков…</div>;
  if (listError) return <div role="alert" className="rounded border p-4 text-red-700">{listError}
    <button className="ml-3 underline" onClick={() => setCatalogRetry(value => value + 1)}>Повторить загрузку уроков</button>
  </div>;
  if (!selected) return <div className="py-8 text-center text-gray-500">Уроков пока нет. Загляните позже.</div>;

  return <div className="grid grid-cols-1 gap-4 xl:grid-cols-[auto_1fr]">
    <LeftTOC items={videos.map(v => ({ id: v.lesson_id, label: v.description || v.filename }))} active={selectedId} onSelect={setSelectedId} />
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4">
        <h3 className="text-lg font-semibold">{selected.description || selected.filename}</h3>
        <p className="mt-2 text-sm text-gray-600">Посмотрите эталонный клип, повторите жест и сохраните самостоятельную практику. Завершение урока — ваша отметка, автоматическая оценка модели сейчас недоступна.</p>
      </div>
      {videoLoading && !videoError && <p role="status">Загрузка эталонного видео…</p>}
      <video key={`${selectedId}:${videoRetry}`} src={videosApi.streamUrl(selected.object_name)} controls playsInline
        aria-label="Эталонный жест" className="w-full rounded-lg border"
        onLoadedData={() => setVideoLoading(false)} onError={() => { setVideoLoading(false); setVideoError(true); }} />
      {videoError && <div role="alert" className="rounded border p-4 text-red-700">Не удалось загрузить эталонное видео.
        <button className="ml-3 underline" onClick={() => setVideoRetry(value => value + 1)}>Повторить загрузку видео</button>
      </div>}
      <CameraView />
      <section className="rounded-lg border bg-white p-4" aria-label="Самостоятельная практика">
        <h4 className="font-semibold">Самостоятельная практика</h4>
        {progressLoading ? <p role="status">Загрузка прогресса…</p> : <>
          <p className="mt-2">Повторений сохранено: <strong>{lessonProgress?.attempts || 0}</strong></p>
          <p>{lessonProgress?.completed ? 'Урок пройден по вашей отметке.' : 'Урок ещё не отмечен пройденным.'}</p>
        </>}
        {progressError && <div role="alert" className="mt-2 text-red-700">{progressError}
          <button className="ml-3 underline" onClick={() => setProgressRetry(value => value + 1)}>Повторить загрузку прогресса</button>
        </div>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => void savePractice(false)} disabled={saving || progressLoading || !!progressError}
            className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50">Я повторил(а) жест</button>
          <button onClick={() => void savePractice(true)} disabled={saving || progressLoading || !!progressError || !lessonProgress?.attempts || lessonProgress.completed}
            className="rounded border px-3 py-2 disabled:opacity-50">Отметить урок пройденным</button>
        </div>
        {saving && <p role="status" className="mt-2">Сохранение…</p>}
        {notice?.lessonId === selectedId && <p role={notice.error ? 'alert' : 'status'} className={`mt-2 ${notice.error ? 'text-red-700' : 'text-green-700'}`}>{notice.text}</p>}
      </section>
    </div>
  </div>;
}
