import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import LeftTOC from '../components/LeftTOC';
import { LessonDetails, LessonMedia, lessonLabel, useDictionaryCatalog } from '../features/catalog';
import { videosApi } from '../services/api';

export default function Dictionary() {
  const { t } = useTranslation('dictionary');
  const {
    videos, status, selectedId, reload, selectLesson, results, query, category, categories, setQuery, setCategory, clearSearch,
  } = useDictionaryCatalog();
  const selected = results.find(video => video.lesson_id === selectedId) ?? results[0];
  const selectedLabelId = useId();

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <button type="button" disabled={status === 'loading'} onClick={reload}
          className="px-4 py-2 border rounded-md bg-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-indigo-600">
          {t(status === 'error' ? 'retryCatalog' : 'refreshCatalog')}
        </button>
      </div>
      {status === 'loading' && <p role="status" className="text-gray-600">{t('loadingCatalog')}</p>}
      {status === 'error' && (
        <div role="alert" className="bg-red-50 text-red-700 p-4 rounded-lg">{t('catalogError')}</div>
      )}
      {status === 'ready' && videos.length === 0 && (
        <p role="status" className="py-8 text-center text-gray-600">{t('emptyCatalog')}</p>
      )}
      {videos.length > 0 && <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1 basis-64 text-sm font-medium">
          {t('searchLabel')}
          <input type="search" value={query} onChange={event => setQuery(event.target.value)}
            className="mt-1 block w-full rounded-md border bg-white px-3 py-2" />
        </label>
        {categories.length > 0 && <label className="block min-w-0 max-w-full text-sm font-medium">
          {t('categoryFilter')}
          <select value={category} onChange={event => setCategory(event.target.value)}
            className="mt-1 block max-w-full rounded-md border bg-white px-3 py-2">
            <option value="">{t('allCategories')}</option>
            {categories.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>}
        {(query || category) && <button type="button" onClick={clearSearch} className="rounded-md border bg-white px-3 py-2">
          {t('clearFilters')}
        </button>}
      </div>}
      {status === 'ready' && videos.length > 0 && results.length === 0 && (
        <p role="status" className="py-8 text-center text-gray-600">{t('noMatches')}</p>
      )}
      {selected && (
        <div className="grid grid-cols-1 xl:grid-cols-[auto_minmax(0,1fr)] gap-4 lg:gap-6">
          <LeftTOC title={t('contents')} items={results.map(video => ({ id: video.lesson_id, label: lessonLabel(video) }))}
            active={selected.lesson_id} onSelect={selectLesson} />
          <div className="space-y-4 min-w-0">
            <LessonMedia key={`${selected.lesson_id}:${selected.version}:${selected.media_url}`} src={videosApi.streamUrl(selected.media_url)} />
            <div>
              <label htmlFor={selectedLabelId} className="block text-sm font-medium mb-1">{t('selectedSign')}</label>
              <input id={selectedLabelId} value={lessonLabel(selected)} readOnly
                className="w-full rounded-md border px-3 py-2 bg-gray-100" />
            </div>
            <section aria-label={t('descriptionTitle')} className="bg-white border rounded-lg p-4">
              <h2 className="font-semibold mb-2">{t('descriptionTitle')}</h2>
              <LessonDetails lesson={selected} />
              <p className="text-sm text-gray-600 whitespace-pre-line [overflow-wrap:anywhere]">
                {selected.description?.trim() || t('noDescription')}
              </p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
