import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogRevision } from '../../../types/api';
import { adminCatalogApi } from '../../../services/adminCatalogService';
import { CatalogAlert, controlClass, panelClass } from './catalogUi';
import { useCatalogRead } from './useCatalogRequests';

const PAGE_SIZE = 10;

export function CatalogHistory({ id, published, disabled, onPreview, onWithdraw }: {
  id: string;
  published: number | null;
  disabled: boolean;
  onPreview: (version: number) => void;
  onWithdraw: (version: number) => void;
}) {
  const { t, i18n } = useTranslation('admin', { keyPrefix: 'catalog' });
  const [cursors, setCursors] = useState<number[]>([]);
  const before = cursors.at(-1);
  const load = useCallback((signal: AbortSignal) => adminCatalogApi.history(id, before, PAGE_SIZE + 1, signal), [id, before]);
  const history = useCatalogRead(load);
  const rows = history.data?.slice(0, PAGE_SIZE) ?? [];
  function metadata(revision: CatalogRevision) {
    return [
      ['category', revision.category], ['description', revision.description], ['source', revision.source],
      ['consent_reference', revision.consent_reference], ['video', revision.filename],
    ] as const;
  }
  return <section className={panelClass}>
    <h3 className="font-semibold">{t('history')}</h3>
    {history.pending && <p role="status">{t('loading')}</p>}
    <CatalogAlert error={history.error} />
    {history.error && <button type="button" className={controlClass} onClick={history.reload}>{t('retry')}</button>}
    {!history.pending && !history.error && rows.length === 0 && <p role="status">{t('emptyHistory')}</p>}
    <ol className="space-y-2">
      {rows.map(revision => <li key={revision.version} className="rounded-md border border-gray-200 p-3">
        <details>
          <summary className="cursor-pointer font-medium">
            {t('version', { version: revision.version })} · {revision.title} · {t(`events.${revision.action}`, { defaultValue: revision.action })}
            {published === revision.version && ` · ${t('activePublication')}`}
          </summary>
          <p className="mt-2 text-sm text-gray-600">
            <time dateTime={revision.created_at}>{new Date(revision.created_at).toLocaleString(i18n.language)}</time>
            {' · '}{revision.author_id === null ? t('unknownAuthor') : t('author', { id: revision.author_id })}
          </p>
          <dl className="mt-2 space-y-1 text-sm">
            {metadata(revision).filter(([, value]) => value).map(([key, value]) =>
              <div key={key}><dt className="inline font-medium">{t(`fields.${key}`)} </dt><dd className="inline whitespace-pre-line">{value}</dd></div>)}
            {revision.review_note && <div><dt className="inline font-medium">{t('note')} </dt><dd className="inline">{revision.review_note}</dd></div>}
          </dl>
          {revision.video_withdrawn && <p className="mt-2">{t('withdrawn')}</p>}
          {revision.filename && !revision.video_withdrawn && <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={disabled} className={controlClass} onClick={() => onPreview(revision.version)}>
              {t('previewVersion', { version: revision.version })}
            </button>
            <button type="button" disabled={disabled} className={controlClass} onClick={() => onWithdraw(revision.version)}>
              {t('withdrawVersion', { version: revision.version })}
            </button>
          </div>}
        </details>
      </li>)}
    </ol>
    <div className="flex flex-wrap gap-2">
      {cursors.length > 0 && <button type="button" disabled={history.pending} className={controlClass}
        onClick={() => setCursors(values => values.slice(0, -1))}>{t('newerVersions')}</button>}
      {(history.data?.length ?? 0) > PAGE_SIZE && <button type="button" disabled={history.pending || !!history.error} className={controlClass}
        onClick={() => setCursors(values => [...values, rows[PAGE_SIZE - 1].version])}>{t('olderVersions')}</button>}
    </div>
  </section>;
}

export function CatalogPreview({ id, version, close }: { id: string; version: number; close: () => void }) {
  const { t } = useTranslation('admin', { keyPrefix: 'catalog' });
  const load = useCallback((signal: AbortSignal) => adminCatalogApi.preview(id, version, signal), [id, version]);
  const preview = useCatalogRead(load);
  const heading = useRef<HTMLHeadingElement>(null);
  const [src, setSrc] = useState('');
  const [decodeError, setDecodeError] = useState(false);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (!preview.data) return;
    const objectUrl = URL.createObjectURL(preview.data);
    setSrc(objectUrl);
    setDecodeError(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preview.data]);
  return <section className={panelClass} aria-label={t('previewVersion', { version })}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 ref={heading} tabIndex={-1} className="font-semibold">{t('previewVersion', { version })}</h3>
      <button type="button" className={controlClass} onClick={close}>{t('closePreview')}</button>
    </div>
    {preview.pending && <p role="status">{t('loadingVideo')}</p>}
    <CatalogAlert error={preview.error ?? (decodeError ? { key: 'invalidVideo' } : undefined)} />
    {!preview.pending && (preview.error || decodeError) && <button type="button" className={controlClass} onClick={preview.reload}>{t('retry')}</button>}
    {src && preview.data && !preview.error && <video key={src} src={src} controls playsInline className="max-h-96 max-w-full rounded-md"
      aria-label={t('fields.video')} onError={() => setDecodeError(true)} />}
  </section>;
}
