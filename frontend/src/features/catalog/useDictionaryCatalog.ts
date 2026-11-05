import { useCallback, useEffect, useState } from 'react';
import { videosApi } from '../../services/api';
import type { VideoInfo } from '../../types/api';

type CatalogState = {
  videos: VideoInfo[];
  selectedId: string | null;
  status: 'loading' | 'ready' | 'error';
};

export function useDictionaryCatalog() {
  const [state, setState] = useState<CatalogState>({ videos: [], selectedId: null, status: 'loading' });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => {
    setState(current => ({ ...current, status: 'loading' }));
    setRevision(current => current + 1);
  }, []);
  const selectLesson = useCallback((lessonId: string) => {
    setState(previous => previous.videos.some(video => video.lesson_id === lessonId)
      ? { ...previous, selectedId: lessonId } : previous);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    videosApi.list(controller.signal).then(
      videos => {
        if (current) setState(previous => ({
          videos, status: 'ready',
          selectedId: videos.some(video => video.lesson_id === previous.selectedId)
            ? previous.selectedId : videos[0]?.lesson_id ?? null,
        }));
      },
      () => { if (current) setState(previous => ({ ...previous, status: 'error' })); },
    );
    return () => {
      current = false;
      controller.abort();
    };
  }, [revision]);

  return { ...state, reload, selectLesson };
}
