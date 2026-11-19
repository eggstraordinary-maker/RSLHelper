import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogEdit, CatalogGesture, CatalogRevision } from '../../../types/api';
import type { CatalogError } from './useCatalogRequests';

export const catalogPath = '/admin/catalog';
export const catalogGesturePath = (id: string) => `${catalogPath}?gesture=${encodeURIComponent(id)}`;
export const controlClass = 'rounded-md border border-gray-300 px-3 py-2 bg-white focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50';
export const primaryClass = 'rounded-md bg-indigo-700 px-4 py-2 text-white focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50';
export const panelClass = 'space-y-3 rounded-lg border border-gray-200 bg-white p-4 min-w-0 [overflow-wrap:anywhere]';

const fieldConfigs = [
  { key: 'title', maxLength: 200 },
  { key: 'description', maxLength: 10000 },
  { key: 'category', maxLength: 100 },
  { key: 'source', maxLength: 500 },
  { key: 'consent_reference', maxLength: 500 },
] as const;
export type CatalogFields = Omit<CatalogEdit, 'expected_version'>;

export function editableFields(revision?: CatalogRevision): CatalogFields {
  return {
    title: revision?.title ?? '', description: revision?.description ?? '', category: revision?.category ?? '',
    source: revision?.source ?? '', consent_reference: revision?.consent_reference ?? '',
  };
}

export function catalogStatus(gesture: CatalogGesture) {
  if (gesture.archived) return 'archived';
  if (!gesture.published_version) return 'private';
  return gesture.revision.version === gesture.published_version ? 'published' : 'publishedWithDraft';
}

export function CatalogAlert({ error }: { error?: CatalogError }) {
  const { t } = useTranslation('admin', { keyPrefix: 'catalog' });
  if (!error) return null;
  return <p role="alert" className="rounded-md bg-red-50 p-3 text-red-800">
    {t(`errors.${error.key}`)} {error.missing?.map(field => t(`fields.${field}`)).join(', ')}
  </p>;
}

export function CatalogMetadata({ fields, change, disabled, onSubmit, submitLabel }: {
  fields: CatalogFields;
  change: (fields: CatalogFields) => void;
  disabled: boolean;
  onSubmit: () => void;
  submitLabel: string;
}) {
  const { t } = useTranslation('admin', { keyPrefix: 'catalog' });
  return <form onSubmit={event => { event.preventDefault(); onSubmit(); }} className={panelClass}>
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="font-semibold">{t('metadata')}</legend>
      {fieldConfigs.map(({ key, maxLength }) => {
        const common = { value: fields[key], maxLength, className: `${controlClass} block w-full mt-1`,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change({ ...fields, [key]: event.target.value }) };
        return <label key={key} className="block text-sm font-medium">{t(`fields.${key}`)}
          {key === 'description' ? <textarea rows={3} {...common} /> : <input required={key === 'title'} {...common} />}
        </label>;
      })}
      <button type="submit" className={primaryClass} disabled={!fields.title.trim()}>{submitLabel}</button>
    </fieldset>
  </form>;
}
