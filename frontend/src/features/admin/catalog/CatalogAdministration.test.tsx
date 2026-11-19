// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link } from 'react-router-dom';
import MockAdapter from 'axios-mock-adapter';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountWrapper, deferred } from '../../../../test-utils/accounts';
import ru from '../../../locales/ru/admin.json';
import en from '../../../locales/en/admin.json';
import { apiClient } from '../../../services/apiClient';
import type { CatalogGesture, CatalogRevision } from '../../../types/api';
import { CatalogAdministration } from './CatalogAdministration';

const strings = ru.catalog;
const base = '/admin/catalog';
const id = 'aaaa0000-0000-4000-8000-000000000001';
const url = `${base}/${id}`;
const mock = new MockAdapter(apiClient);
const initial: CatalogRevision = {
  version: 1, title: 'Привет', description: '', category: '', source: '', consent_reference: '',
  learning_section: 'basic', alphabet_letter: null,
  filename: null, video_withdrawn: false, review_status: 'draft', review_note: '', action: 'created',
  author_id: 7, created_at: '2026-11-19T00:00:00Z',
};
const gesture = (revision: Partial<CatalogRevision> = {}, status: Partial<CatalogGesture> = {}): CatalogGesture => ({
  gesture_id: id, lesson_id: 'bbbb0000-0000-4000-8000-000000000001', published_version: null, archived: false,
  ...status, revision: { ...initial, ...revision },
});
const full = { title: 'Привет', category: 'Приветствия', source: 'Студия', consent_reference: 'Согласие №1', filename: 'example.mp4' };

async function show(language: 'ru' | 'en' = 'ru') {
  const Wrapper = await accountWrapper(language);
  return render(<Wrapper><StrictMode><Link to={`${base}?gesture=${id}`}>Fixture editor</Link>
    <Link to={`${base}?gesture=invalid`}>Invalid gesture</Link><CatalogAdministration /></StrictMode></Wrapper>);
}

async function edit(record = gesture(), history = [record.revision]) {
  mock.onGet(base).reply(200, []);
  mock.onGet(url).reply(200, record);
  mock.onGet(`${url}/versions`).reply(200, history);
  const view = await show();
  fireEvent.click(screen.getByRole('link', { name: 'Fixture editor' }));
  await screen.findByRole('heading', { name: record.revision.title });
  return view;
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const conflict = (code: string, missing?: string[]) => ({ detail: { code, missing, message: 'private backend detail' } });

beforeEach(() => mock.reset());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(() => mock.restore());

describe('administrator catalog', () => {
  it('requires a letter for the alphabet and clears the letter when moving to basic signs', async () => {
    await edit();
    const section = screen.getByLabelText(strings.fields.learning_section) as HTMLSelectElement;
    expect(section.value).toBe('basic');
    change(strings.fields.learning_section, 'alphabet');
    expect((screen.getByRole('button', { name: strings.save }) as HTMLButtonElement).disabled).toBe(true);
    change(strings.fields.alphabet_letter, 'Ё');
    mock.onPut(url).replyOnce(200, gesture({ version: 2, learning_section: 'alphabet', alphabet_letter: 'Ё' }));
    click(strings.save);
    await screen.findByText(strings.saved);
    expect(JSON.parse(mock.history.put[0].data)).toMatchObject({
      expected_version: 1, learning_section: 'alphabet', alphabet_letter: 'Ё',
    });
    expect((screen.getByLabelText(strings.fields.alphabet_letter) as HTMLSelectElement).value).toBe('Ё');
    change(strings.fields.learning_section, 'basic');
    expect(screen.queryByLabelText(strings.fields.alphabet_letter)).toBeNull();
    mock.onPut(url).replyOnce(200, gesture({ version: 3 }));
    click(strings.save);
    await screen.findByText('Черновик · Версия 3');
    expect(JSON.parse(mock.history.put[1].data)).toMatchObject({
      expected_version: 2, learning_section: 'basic', alphabet_letter: null,
    });
  });

  it('distinguishes loading, retry, an empty list and denied access', async () => {
    const request = deferred();
    mock.onGet(base).reply(() => request.promise);
    await show('en');
    expect(screen.getByRole('status').textContent).toBe(en.catalog.loading);
    await act(async () => request.resolve([503, { detail: 'private backend detail' }]));
    expect((await screen.findByRole('alert')).textContent).toContain(en.catalog.errors.unavailable);
    expect(screen.queryByText(en.catalog.empty)).toBeNull();
    mock.resetHandlers();
    mock.onGet(base).replyOnce(200, []);
    click(en.catalog.retry);
    await screen.findByText(en.catalog.empty);
    mock.onGet(base).replyOnce(403);
    click(en.catalog.refresh);
    expect((await screen.findByRole('alert')).textContent).toContain(en.catalog.errors.forbidden);
    expect(screen.queryByText(en.catalog.empty)).toBeNull();
  });

  it('paginates stable gesture links and shows archived and published states', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => gesture({ title: `Жест ${index}` }, {
      gesture_id: `aaaa0000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      archived: index === 0, published_version: index === 1 ? 1 : null,
    }));
    mock.onGet(base, { params: { offset: 0, limit: 21 } }).reply(200, rows);
    mock.onGet(base, { params: { offset: 20, limit: 21 } }).reply(200, rows.slice(20));
    await show();
    expect((await screen.findByRole('link', { name: 'Жест 0' })).getAttribute('href')).toContain(id);
    expect(screen.getByText('В архиве · Версия 1')).toBeTruthy();
    expect(screen.getByText('Опубликовано · Версия 1')).toBeTruthy();
    click(strings.next);
    await screen.findByRole('link', { name: 'Жест 20' });
    expect(screen.queryByRole('link', { name: 'Жест 0' })).toBeNull();
    click(strings.previous);
    await screen.findByRole('link', { name: 'Жест 0' });
    fireEvent.click(screen.getByRole('link', { name: 'Invalid gesture' }));
    expect(screen.getByRole('alert').textContent).toContain(strings.errors.notFound);
  });

  it('reuses a draft UUID after a lost acknowledgement and opens the existing draft', async () => {
    mock.onGet(base).reply(200, []);
    const saved = deferred();
    mock.onPost(base).replyOnce(() => saved.promise);
    mock.onPost(base).replyOnce(409, conflict('gesture_exists'));
    await show();
    fireEvent.click(screen.getByRole('link', { name: strings.new }));
    change(strings.fields.title, 'Привет');
    click(strings.create);
    fireEvent.submit(screen.getByRole('button', { name: strings.create }).closest('form')!);
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    await act(async () => saved.resolve([503, { detail: 'private backend detail' }]));
    await screen.findByRole('alert');
    expect(screen.queryByText('private backend detail')).toBeNull();
    click(strings.create);
    const existing = await screen.findByRole('link', { name: strings.openDraft });
    const ids = mock.history.post.map(request => JSON.parse(request.data).gesture_id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toMatch(/^[a-f0-9-]{36}$/);
    mock.onGet(`${base}/${ids[0]}`).reply(200, gesture());
    mock.onGet(`${url}/versions`).reply(200, [initial]);
    fireEvent.click(existing);
    await screen.findByRole('heading', { name: 'Привет' });
  });

  it('validates one MP4, sends the current version and provides safe retry after rejection', async () => {
    await edit(gesture(full));
    const input = screen.getByLabelText(strings.videoInput) as HTMLInputElement;
    expect(input.multiple).toBe(false);
    const pick = (file: File) => fireEvent.change(input, { target: { files: [file] } });
    pick(new File(['invalid'], 'wrong.gif', { type: 'image/gif' }));
    expect(screen.getByRole('alert').textContent).toContain(strings.errors.invalidVideo);
    const oversized = new File(['oversized'], 'long.mp4', { type: 'video/mp4' });
    Object.defineProperty(oversized, 'size', { value: 100_000_001 });
    pick(oversized);
    expect(screen.getByRole('alert').textContent).toContain(strings.errors.tooLarge);
    expect(mock.history.put).toHaveLength(0);

    mock.onPut(`${url}/video`).replyOnce(415).onPut(`${url}/video`).reply(200, gesture({
      ...full, version: 2, filename: 'new.mp4', source: '', consent_reference: '', action: 'video_replaced',
    }));
    pick(new File(['data'], 'new.mp4', { type: 'video/mp4' }));
    click(strings.videoUpload);
    expect((await screen.findByRole('alert')).textContent).toContain(strings.errors.invalidVideo);
    click(strings.videoUpload);
    await screen.findByText(strings.videoSaved);
    const request = mock.history.put[0].data as FormData;
    expect(request.get('expected_version')).toBe('1');
    expect((request.get('file') as File).name).toBe('new.mp4');
    expect((screen.getByLabelText(strings.fields.source) as HTMLInputElement).value).toBe('');
  });

  it('shows prerequisites, handles a stale write and reloads only on request', async () => {
    await edit();
    mock.onPost(`${url}/transitions`).replyOnce(409, conflict('incomplete_revision', ['video', 'source', 'private payload']));
    click(strings.actions.approve);
    expect((await screen.findByRole('alert')).textContent).toContain(strings.fields.source);
    expect(screen.getByRole('alert').textContent).not.toContain('private');
    change(strings.fields.title, 'Локальное изменение');
    mock.onPut(url).replyOnce(409, conflict('stale_version', []));
    click(strings.save);
    await screen.findByRole('button', { name: strings.reloadVersion });
    expect((screen.getByLabelText(strings.fields.title) as HTMLInputElement).value).toBe('Локальное изменение');
    expect(screen.getByRole('button', { name: strings.save }).closest('fieldset')?.disabled).toBe(true);
    mock.onGet(url).reply(200, gesture({ version: 4, title: 'Серверная версия' }, { published_version: 3 }));
    click(strings.reloadVersion);
    await screen.findByRole('heading', { name: 'Серверная версия' });
    await screen.findByText('В словаре доступна версия 3.');
  });

  it('checks publication and confirms withdrawal for an explicit version', async () => {
    const approved = gesture({ ...full, version: 5, review_status: 'approved', review_note: 'Проверено', action: 'approve' });
    await edit(approved);
    const published = gesture({ ...approved.revision, version: 6, action: 'publish' }, { published_version: 6 });
    mock.onPost(`${url}/transitions`).replyOnce(200, published);
    mock.onGet(`${url}/versions`).reply(200, [published.revision, approved.revision]);
    click(strings.actions.publish);
    await screen.findByText('Опубликовано · Версия 6');
    fireEvent.click(await screen.findByText('Версия 6 · Привет · Опубликовано · Сейчас в словаре'));
    click('Отозвать согласие для видео версии 6');
    click(strings.cancel);
    expect(mock.history.post).toHaveLength(1);
    click('Отозвать согласие для видео версии 6');
    mock.onPost(`${url}/transitions`).replyOnce(200, gesture({
      ...full, version: 7, video_withdrawn: true, consent_reference: '', action: 'withdraw_consent',
    }));
    click(strings.confirmButton);
    await screen.findByText('Черновик · Версия 7');
    expect(JSON.parse(mock.history.post[1].data)).toMatchObject({ action: 'withdraw_consent', expected_version: 6, media_version: 6 });
    expect(screen.queryByRole('button', { name: strings.previewCurrent })).toBeNull();
  });

  it('loads a private preview on demand and releases its object URL when closed', async () => {
    const revoke = vi.fn();
    // jsdom uses the browser URL interface without object URL support.
    const previous = URL;
    vi.stubGlobal('URL', class extends previous {
      static createObjectURL = vi.fn(() => 'blob:local-preview');
      static revokeObjectURL = revoke;
    });
    await edit(gesture(full));
    const path = `${url}/versions/1/content`;
    expect(mock.history.get.some(request => request.url === path)).toBe(false);
    mock.onGet(path).reply(404);
    click(strings.previewCurrent);
    expect((await screen.findByRole('alert')).textContent).toContain(strings.errors.notFound);
    mock.onGet(path).reply(200, new Blob(['test clip'], { type: 'video/mp4' }));
    click(strings.retry);
    const region = screen.getByRole('region', { name: 'Смотреть видео версии 1' });
    expect((await within(region).findByLabelText(strings.fields.video)).getAttribute('src')).toBe('blob:local-preview');
    expect(mock.history.get.filter(request => request.url === path).at(-1)?.responseType).toBe('blob');
    click(strings.closePreview);
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Смотреть видео версии 1' })).toBeNull();
      expect(revoke).toHaveBeenCalledWith('blob:local-preview');
    });
  });
});
