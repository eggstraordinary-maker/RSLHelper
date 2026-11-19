import { useCallback, useEffect, useState } from 'react';
import { videosApi } from '../../services/api';
import type { VideoInfo } from '../../types/api';
import { lessonLabel } from './LessonDetails';

type CatalogState = {
  videos: VideoInfo[];
  selectedId: string | null;
  status: 'loading' | 'ready' | 'error';
};

const searchText = (value: string) =>
  value.normalize('NFC').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').trim().replace(/\s+/g, ' ');

export function useDictionaryCatalog() {
  const [state, setState] = useState<CatalogState>({ videos: [], selectedId: null, status: 'loading' });
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategory] = useState('');
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

  const categories = [...new Set(state.videos.flatMap(video => video.category ? [video.category] : []))]
    .sort((left, right) => left.localeCompare(right, 'ru'));
  const category = categories.includes(categoryFilter) ? categoryFilter : '';
  const term = searchText(query);
  const results = state.videos.filter(video =>
    (!category || video.category === category) &&
    (!term || [lessonLabel(video), video.category ?? ''].some(value => searchText(value).includes(term))),
  );

  function clearSearch() {
    setQuery('');
    setCategory('');
  }

  return {
    ...state, reload, selectLesson, results, query, category, categories, setQuery, setCategory, clearSearch,
  };
}
