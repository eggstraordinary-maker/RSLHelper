import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminCatalogApi } from '../../../services/adminCatalogService';
import { newUuid } from '../../../shared/uuid';
import type { CatalogAction, CatalogGesture } from '../../../types/api';
import { CatalogHistory, CatalogPreview } from './CatalogHistory';
import {
  CatalogAlert, CatalogMetadata, catalogGesturePath, catalogPath, catalogStatus, controlClass,
  editableFields, panelClass, primaryClass,
} from './catalogUi';
import { type CatalogError, useCatalogRead, useCatalogWrite } from './useCatalogRequests';

export function CreateGesture() {
  const { t } = useTranslation('admin', { keyPrefix: 'catalog' });
  const navigate = useNavigate();
  const [id] = useState(newUuid);
  const [fields, change] = useState(() => editableFields());
  const write = useCatalogWrite();
  return <div className="max-w-3xl space-y-3">
    <Link to={catalogPath} className="text-indigo-700 underline">{t('back')}</Link>
    <h2 className="text-xl font-semibold">{t('new')}</h2>
    <CatalogAlert error={write.error} />
    {write.error?.key === 'gesture_exists' && <Link className="text-indigo-700 underline" to={catalogGesturePath(id)}>{t('openDraft')}</Link>}
    {write.pending && <p role="status">{t('saving')}</p>}
    <CatalogMetadata fields={fields} change={change} disabled={write.pending || write.error?.key === 'gesture_exists'}
      submitLabel={t('create')} onSubmit={() => void write.run(signal => adminCatalogApi.create({ ...fields, gesture_id: id }, signal),
        record => navigate(catalogGesturePath(record.gesture_id), { replace: true }))} />
  </div>;
}

type Action = { action: CatalogAction; mediaVersion?: number };
const confirmActions: CatalogAction[] = ['archive', 'unpublish', 'withdraw_consent'];

function actionsFor(gesture: CatalogGesture): CatalogAction[] {
  if (gesture.archived) return ['restore'];
  const actions: CatalogAction[] = [];
  if (gesture.revision.version !== gesture.published_version) {
    actions.push(gesture.revision.review_status === 'approved' ? 'publish' : 'approve', 'request_changes');
  }
  if (gesture.published_version !== null) actions.push('unpublish');
  actions.push('archive');
  return actions;
}

function EditGesture({ initial }: { initial: CatalogGesture }) {
  const { t } = useTranslation('admin', { keyPrefix: 'catalog' });
  const [record, setRecord] = useState(initial);
  const { revision, gesture_id: id, published_version: published } = record;
  const [fields, change] = useState(() => editableFields(initial.revision));
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState<CatalogError>();
  const [preview, setPreview] = useState<number>();
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState<Action>();
  const [notice, setNotice] = useState('');
  const [stale, setStale] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const confirmation = useRef<HTMLHeadingElement>(null);
  const write = useCatalogWrite();
  useEffect(() => {
    if (write.error?.key === 'stale_version') setStale(true);
    if (write.error) feedback.current?.focus();
  }, [write.error]);
  useEffect(() => { if (confirm) confirmation.current?.focus(); }, [confirm]);

  const dirty = (Object.keys(fields) as (keyof typeof fields)[]).some(key => fields[key] !== revision[key]);
  const denied = write.error?.key === 'forbidden' || write.error?.key === 'notFound';
  const disabled = write.pending || stale || denied;
  const mediaAvailable = !!revision.filename && !revision.video_withdrawn;

  function accept(current: CatalogGesture, message: string) {
    setRecord(current);
    change(editableFields(current.revision));
    setFile(undefined);
    setFileError(undefined);
    setPreview(undefined);
    setConfirm(undefined);
    setNote('');
    setStale(false);
    setNotice(message);
  }

  function transition({ action, mediaVersion }: Action) {
    setNotice('');
    void write.run(signal => adminCatalogApi.transition(id, {
      action, expected_version: revision.version, note, media_version: mediaVersion,
    }, signal), result => accept(result, 'actionSaved'));
  }

  function chooseAction(action: Action) {
    if (confirmActions.includes(action.action)) setConfirm(action);
    else transition(action);
  }

  function chooseVideo(selected: File | undefined) {
    const invalid = selected && (!/\.mp4$/i.test(selected.name) || (selected.type && selected.type !== 'video/mp4'));
    const error = invalid ? { key: 'invalidVideo' } : selected && selected.size > 100_000_000 ? { key: 'tooLarge' } : undefined;
    setFileError(error);
    setFile(error ? undefined : selected);
  }

  return <div className="max-w-4xl space-y-4">
    <Link to={catalogPath} className="text-indigo-700 underline">{t('back')}</Link>
    <header className="space-y-1 [overflow-wrap:anywhere]">
      <h2 className="text-xl font-semibold">{revision.title}</h2>
      <p>{t(`states.${catalogStatus(record)}`)} · {t('version', { version: revision.version })}</p>
      {published !== null && published !== revision.version && <p>{t('publishedVersion', { version: published })}</p>}
      {record.archived && <p className="text-gray-600">{t('archivedHint')}</p>}
    </header>
    <div ref={feedback} tabIndex={-1}>
      <CatalogAlert error={write.error} />
      {write.pending && <p role="status">{t('saving')}</p>}
      {!write.pending && !write.error && notice && <p role="status" className="text-green-800">{t(notice)}</p>}
      {stale && <button type="button" className={`${controlClass} mt-2`} disabled={write.pending}
        onClick={() => void write.run(signal => adminCatalogApi.get(id, signal), result => accept(result, 'reloaded'))}>
        {t('reloadVersion')}
      </button>}
    </div>
    {!denied && <>
      <CatalogMetadata fields={fields} change={change} disabled={disabled || record.archived || !!confirm} submitLabel={t('save')}
        onSubmit={() => {
          setNotice('');
          void write.run(signal => adminCatalogApi.edit(id, { ...fields, expected_version: revision.version }, signal),
            result => accept(result, 'saved'));
        }} />
      {dirty && <div className="flex flex-wrap items-center gap-3">
        <p>{t('saveFirst')}</p><button type="button" className={controlClass} disabled={disabled}
          onClick={() => change(editableFields(revision))}>{t('discard')}</button>
      </div>}
      <section className={panelClass}>
        <h3 className="font-semibold">{t('fields.video')}</h3>
        <p>{revision.filename ?? t('noVideo')} {revision.video_withdrawn && `· ${t('withdrawn')}`}</p>
        {mediaAvailable && <button className={controlClass} type="button" disabled={disabled || !!confirm}
          onClick={() => setPreview(revision.version)}>{t('previewCurrent')}</button>}
        {!record.archived && <fieldset disabled={disabled || dirty || !!confirm} className="space-y-2">
          <legend className="sr-only">{t('videoUpload')}</legend>
          <p className="text-sm text-gray-600">{t('videoRules')}</p>
          <label className="block text-sm font-medium">{t('videoInput')}
            <input key={revision.version} type="file" accept="video/mp4,.mp4" className={`${controlClass} mt-1 block w-full`}
              onChange={event => chooseVideo(event.target.files?.[0])} />
          </label>
          <CatalogAlert error={fileError} />
          <button type="button" disabled={!file} className={primaryClass} onClick={() => {
            if (!file) return;
            setNotice('');
            void write.run(signal => adminCatalogApi.upload(id, revision.version, file, signal), result => accept(result, 'videoSaved'));
          }}>{t('videoUpload')}</button>
        </fieldset>}
      </section>
      {preview !== undefined && <CatalogPreview key={`preview-${preview}`} id={id} version={preview} close={() => setPreview(undefined)} />}
      <section className={panelClass}>
        <h3 className="font-semibold">{t('review')}</h3>
        <p>{t(`reviewStates.${revision.review_status}`)}</p>
        {revision.review_note && <p className="whitespace-pre-line">{revision.review_note}</p>}
        <label className="block text-sm font-medium">{t('note')}
          <textarea rows={2} maxLength={2000} value={note} disabled={disabled} className={`${controlClass} block w-full mt-1`}
            onChange={event => setNote(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          {actionsFor(record).map(action => <button key={action} type="button" disabled={disabled || dirty || !!confirm}
            className={action === 'publish' ? primaryClass : controlClass} onClick={() => chooseAction({ action })}>{t(`actions.${action}`)}</button>)}
        </div>
      </section>
      {confirm && <section className={panelClass}>
        <h3 ref={confirmation} tabIndex={-1} className="font-semibold">{t('confirmAction')}</h3>
        <p>{t(`confirm.${confirm.action}`, { version: confirm.mediaVersion })}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={controlClass} disabled={write.pending} onClick={() => setConfirm(undefined)}>{t('cancel')}</button>
          <button type="button" disabled={disabled || dirty} className={primaryClass}
            onClick={() => transition(confirm)}>{t('confirmButton')}</button>
        </div>
      </section>}
      <CatalogHistory key={`history-${revision.version}`} id={id} published={published} disabled={disabled || dirty || !!confirm}
        onPreview={setPreview} onWithdraw={mediaVersion => chooseAction({ action: 'withdraw_consent', mediaVersion })} />
    </>}
  </div>;
}

export function OpenGesture({ id }: { id: string }) {
  const { t } = useTranslation('admin', { keyPrefix: 'catalog' });
  const load = useCallback((signal: AbortSignal) => adminCatalogApi.get(id, signal), [id]);
  const request = useCatalogRead(load);
  if (request.data) return <EditGesture initial={request.data} />;
  return <div className="space-y-3">
    <Link to={catalogPath} className="text-indigo-700 underline">{t('back')}</Link>
    {request.pending && <p role="status">{t('loading')}</p>}
    <CatalogAlert error={request.error} />
    {request.error && <button type="button" className={controlClass} onClick={request.reload}>{t('retry')}</button>}
  </div>;
}
