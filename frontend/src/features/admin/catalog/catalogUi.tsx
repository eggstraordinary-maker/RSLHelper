import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogEdit, CatalogGesture, CatalogRevision, LearningSection } from '../../../types/api';
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
const russianLetters = Array.from('АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ');
export type CatalogFields = Omit<CatalogEdit, 'expected_version' | 'learning_section' | 'alphabet_letter'> & {
  learning_section: LearningSection;
  alphabet_letter: string | null;
};

export function editableFields(revision?: CatalogRevision): CatalogFields {
  return {
    title: revision?.title ?? '', description: revision?.description ?? '', category: revision?.category ?? '',
    source: revision?.source ?? '', consent_reference: revision?.consent_reference ?? '',
    learning_section: revision?.learning_section ?? 'basic', alphabet_letter: revision?.alphabet_letter ?? null,
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
  const { t, i18n } = useTranslation('admin', { keyPrefix: 'catalog' });
  const alphabet = fields.learning_section === 'alphabet';
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
      <label className="block text-sm font-medium">{t('fields.learning_section')}
        <select value={fields.learning_section} className={`${controlClass} block w-full mt-1`} onChange={event => change({
          ...fields, learning_section: event.target.value === 'alphabet' ? 'alphabet' : 'basic', alphabet_letter: null,
        })}>
          <option value="basic">{i18n.t('sections.basic', { ns: 'learning' })}</option>
          <option value="alphabet">{i18n.t('sections.alphabet', { ns: 'learning' })}</option>
        </select>
      </label>
      {alphabet && <label className="block text-sm font-medium">{t('fields.alphabet_letter')}
        <select required value={fields.alphabet_letter ?? ''} className={`${controlClass} block w-full mt-1`}
          onChange={event => change({ ...fields, alphabet_letter: event.target.value || null })}>
          <option value="">{t('chooseLetter')}</option>
          {russianLetters.map(letter => <option key={letter} value={letter}>{letter}</option>)}
        </select>
      </label>}
      <button type="submit" className={primaryClass} disabled={!fields.title.trim() || (alphabet && !fields.alphabet_letter)}>{submitLabel}</button>
    </fieldset>
  </form>;
}
