import React, { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminCatalogApi } from '../../../services/adminCatalogService';
import { uuidPattern } from '../../../shared/uuid';
import { CatalogAlert, catalogGesturePath, catalogPath, catalogStatus, controlClass, panelClass, primaryClass } from './catalogUi';
import { CreateGesture, OpenGesture } from './CatalogEditor';
import { useCatalogRead } from './useCatalogRequests';

const PAGE_SIZE = 20;

function Gestures() {
  const { t } = useTranslation('admin', { keyPrefix: 'catalog' });
  const [page, setPage] = useState(0);
  const load = useCallback((signal: AbortSignal) => adminCatalogApi.list(page * PAGE_SIZE, PAGE_SIZE + 1, signal), [page]);
  const list = useCatalogRead(load);
  const rows = list.data?.slice(0, PAGE_SIZE) ?? [];
  return <section className="max-w-4xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">{t('title')}</h2>
      <Link to={`${catalogPath}?new=1`} className={primaryClass}>{t('new')}</Link>
    </header>
    <button type="button" className={controlClass} disabled={list.pending} onClick={list.reload}>
      {t(list.error ? 'retry' : 'refresh')}
    </button>
    {list.pending && <p role="status">{t('loading')}</p>}
    <CatalogAlert error={list.error} />
    {!list.pending && !list.error && rows.length === 0 && <p role="status">{t('empty')}</p>}
    <ul className="space-y-2" aria-busy={list.pending}>
      {rows.map(gesture => <li key={gesture.gesture_id} className={panelClass}>
        <Link to={catalogGesturePath(gesture.gesture_id)} className="font-medium text-indigo-700 underline">{gesture.revision.title}</Link>
        <p className="text-sm text-gray-600">{t(`states.${catalogStatus(gesture)}`)} · {t('version', { version: gesture.revision.version })}</p>
      </li>)}
    </ul>
    <nav className="flex flex-wrap items-center gap-3" aria-label={t('pages')}>
      <button type="button" disabled={page === 0 || list.pending} className={controlClass} onClick={() => setPage(value => value - 1)}>{t('previous')}</button>
      <span>{t('page', { page: page + 1 })}</span>
      <button type="button" disabled={list.pending || !!list.error || (list.data?.length ?? 0) <= PAGE_SIZE}
        className={controlClass} onClick={() => setPage(value => value + 1)}>{t('next')}</button>
    </nav>
  </section>;
}

export function CatalogAdministration() {
  const [params] = useSearchParams();
  const { t } = useTranslation('admin', { keyPrefix: 'catalog' });
  const id = params.get('gesture');
  if (id !== null) return uuidPattern.test(id) ? <OpenGesture key={id} id={id} /> : <div className="space-y-3">
    <CatalogAlert error={{ key: 'notFound' }} />
    <Link to={catalogPath} className="text-indigo-700 underline">{t('back')}</Link>
  </div>;
  return params.get('new') === '1' ? <CreateGesture /> : <Gestures />;
}
