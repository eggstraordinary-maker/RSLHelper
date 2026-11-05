// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { UserAdministration } from '../index';
import { apiClient, clearSessionTokens, setSessionTokens } from '../../../services/apiClient';
import type { User } from '../../../types/api';
import { accountWrapper, deferred, testUser, tokens } from '../../../../test-utils/accounts';
import ru from '../../../locales/ru/admin.json';
import en from '../../../locales/en/admin.json';

const administrator: User = { ...testUser, id: 1, username: 'administrator', email: 'administrator@example.com', role: 'admin' };
const learner: User = { ...testUser, id: 2, public_id: '22222222-2222-4222-8222-222222222222' };
let principal: User | null = administrator;
let loadingSession = false;
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: principal, isLoading: loadingSession }) }));
const api = new MockAdapter(apiClient);
const t = ru.users;
const remove = (name = learner.username) => screen.getByRole('button', { name: `Удалить пользователя ${name}` });
async function show(strict = false, language: 'ru' | 'en' = 'ru') {
  const Wrapper = await accountWrapper(language);
  return render(<Wrapper>{strict ? <StrictMode><UserAdministration /></StrictMode> : <UserAdministration />}</Wrapper>);
}

// jsdom has no native dialog lifecycle; browser focus trapping/Escape is checked
// separately by Playwright on the actual HTMLDialogElement.
const originalShow = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  api.reset(); principal = administrator; loadingSession = false;
  clearSessionTokens(); setSessionTokens(tokens);
});
afterEach(cleanup);
afterAll(() => { api.restore(); HTMLDialogElement.prototype.showModal = originalShow; HTMLDialogElement.prototype.close = originalClose; });

describe('admin users list', () => {
  it.each([null, learner])('denies access before fetching when principal is %s', async user => {
    principal = user; await show();
    expect(screen.getByRole('alert').textContent).toBe(t.forbidden);
    expect(api.history.get).toHaveLength(0);
  });

  it('waits for session initialization before any admin request', async () => {
    loadingSession = true; await show();
    expect(screen.getByRole('status').textContent).toBe(t.loading);
    expect(api.history.get).toHaveLength(0);
  });

  it('distinguishes loading, failure and empty, and retries only on explicit action', async () => {
    const pending = deferred(); api.onGet('/admin/users').replyOnce(() => pending.promise);
    api.onGet('/admin/users').reply(200, []);
    await show();
    expect(screen.getByRole('status').textContent).toBe(t.loading);
    expect(screen.queryByText(t.empty)).toBeNull();
    await act(async () => { pending.resolve([503, { detail: 'Internal private diagnostic' }]); });
    expect(screen.getByRole('alert').textContent).toBe(t.loadError);
    expect(screen.queryByText(t.empty)).toBeNull();
    expect(screen.queryByText(/Internal private/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t.retry }));
    await screen.findByText(t.empty);
    expect(api.history.get).toHaveLength(2);
    expect(api.history.get[1].params).toEqual({ skip: 0, limit: 21 });
  });

  it('keeps a confirmed page on a refresh error but hides it after a server 403', async () => {
    api.onGet('/admin/users').replyOnce(200, [administrator, learner]);
    api.onGet('/admin/users').replyOnce(503); api.onGet('/admin/users').reply(403);
    await show(); await screen.findByText(learner.email);
    fireEvent.click(screen.getByRole('button', { name: t.refresh })); await screen.findByText(t.loadError);
    expect(screen.getByText(learner.email)).toBeTruthy();
    expect((remove() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t.retry })); await screen.findByText(t.forbidden);
    expect(screen.queryByText(learner.email)).toBeNull();
  });

  it('pages with a lookahead item without inventing a total count', async () => {
    const first = Array.from({ length: 21 }, (_, id) => ({ ...learner, id: id + 2, username: `learner_${id}`, email: `learner_${id}@example.com` }));
    api.onGet('/admin/users').reply(config => [200, config.params.skip === 0 ? first : [first[20]]]);
    await show(); await screen.findByText('learner_0@example.com');
    expect(screen.queryByText('learner_20@example.com')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t.next }));
    await screen.findByText('learner_20@example.com');
    expect(api.history.get[1].params).toEqual({ skip: 20, limit: 21 });
    expect(screen.getByText('Страница 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: t.next }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t.previous })); await screen.findByText('learner_0@example.com');
  });

  it('aborts obsolete StrictMode requests and ignores their late results', async () => {
    const old = deferred(); api.onGet('/admin/users').replyOnce(() => old.promise);
    api.onGet('/admin/users').reply(200, [administrator]);
    await show(true); await screen.findByText(administrator.email);
    expect(api.history.get[0].signal?.aborted).toBe(true);
    await act(async () => { old.resolve([200, [learner]]); });
    expect(screen.queryByText(learner.email)).toBeNull();
  });
});

describe('confirmed admin deletion', () => {
  it('blocks self-delete and performs no request on cancel, restoring keyboard focus', async () => {
    api.onGet('/admin/users').reply(200, [administrator, learner]);
    await show(); await screen.findByText(learner.email);
    expect((remove(administrator.username) as HTMLButtonElement).disabled).toBe(true);
    const trigger = remove(); fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: t.confirmTitle });
    const cancel = within(dialog).getByRole('button', { name: t.cancel });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(api.history.delete).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);
  });

  it('waits for the API, prevents double-delete, and refreshes the page after success', async () => {
    api.onGet('/admin/users').replyOnce(200, [administrator, learner]); api.onGet('/admin/users').reply(200, [administrator]);
    const pending = deferred(); api.onDelete('/admin/users/2').reply(() => pending.promise);
    await show(); fireEvent.click(await screen.findByRole('button', { name: 'Удалить пользователя learner' }));
    const confirm = screen.getByRole('button', { name: t.confirm });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(screen.getByText(learner.email, { selector: 'td' })).toBeTruthy();
    expect(api.history.delete).toHaveLength(1);
    expect((screen.getByRole('button', { name: t.cancel }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { pending.resolve([204, null]); });
    await screen.findByText(t.deleted);
    await waitFor(() => expect(api.history.get).toHaveLength(2));
    expect(screen.queryByText(learner.email)).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the user after a network failure and allows an explicit deletion retry', async () => {
    api.onGet('/admin/users').replyOnce(200, [administrator, learner]); api.onGet('/admin/users').reply(200, [administrator]);
    api.onDelete('/admin/users/2').replyOnce(503); api.onDelete('/admin/users/2').reply(204);
    await show(); fireEvent.click(await screen.findByRole('button', { name: 'Удалить пользователя learner' }));
    fireEvent.click(screen.getByRole('button', { name: t.confirm })); await screen.findByText(t.deleteError);
    expect(screen.getByText(learner.email, { selector: 'td' })).toBeTruthy(); expect(screen.queryByText(t.deleted)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t.confirm })); await screen.findByText(t.deleted);
    expect(api.history.delete).toHaveLength(2);
  });

  it('handles an already removed user as an authoritative 404 and refreshes', async () => {
    api.onGet('/admin/users').replyOnce(200, [administrator, learner]); api.onGet('/admin/users').reply(200, [administrator]);
    api.onDelete('/admin/users/2').reply(404);
    await show(); fireEvent.click(await screen.findByRole('button', { name: 'Удалить пользователя learner' }));
    fireEvent.click(screen.getByRole('button', { name: t.confirm })); await screen.findByText(t.alreadyDeleted);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hides admin data when the server rejects deletion with 403', async () => {
    api.onGet('/admin/users').reply(200, [administrator, learner]); api.onDelete('/admin/users/2').reply(403);
    await show(); fireEvent.click(await screen.findByRole('button', { name: 'Удалить пользователя learner' }));
    fireEvent.click(screen.getByRole('button', { name: t.confirm })); await screen.findByText(t.forbidden);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByText(learner.email)).toBeNull();
  });

  it('ignores deletion completion after the admin view is unmounted', async () => {
    api.onGet('/admin/users').reply(200, [administrator, learner]);
    const pending = deferred(); api.onDelete('/admin/users/2').reply(() => pending.promise);
    const view = await show(); fireEvent.click(await screen.findByRole('button', { name: 'Удалить пользователя learner' }));
    fireEvent.click(screen.getByRole('button', { name: t.confirm })); view.unmount();
    principal = learner; await show();
    await act(async () => { pending.resolve([204, null]); });
    expect(screen.getByRole('alert').textContent).toBe(t.forbidden);
    expect(api.history.get).toHaveLength(1);
  });

  it.each(['ru', 'en'] as const)('localizes table, confirmation and error in %s', async language => {
    const text = (language === 'ru' ? ru : en).users;
    api.onGet('/admin/users').reply(200, [administrator, learner]); api.onDelete('/admin/users/2').reply(400);
    await show(false, language);
    const name = text.deleteNamed.replace('{{name}}', learner.username);
    fireEvent.click(await screen.findByRole('button', { name }));
    expect(screen.getByRole('dialog', { name: text.confirmTitle })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: text.confirm })); await screen.findByText(text.deleteRejected);
    expect(screen.getByRole('region', { name: text.table })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: text.pagination })).toBeTruthy();
  });

  it('returns to the previous page when its only user is deleted', async () => {
    const first = Array.from({ length: 21 }, (_, index) => ({ ...learner, id: index + 2, username: `learner_${index}`, email: `learner_${index}@example.com` }));
    let removed = false;
    api.onGet('/admin/users').reply(config => [200, config.params.skip === 0 ? first.slice(0, removed ? 20 : 21) : [first[20]]]);
    api.onDelete('/admin/users/22').reply(() => { removed = true; return [204]; });
    await show(); await screen.findByText(first[0].email); fireEvent.click(screen.getByRole('button', { name: t.next }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить пользователя learner_20' }));
    fireEvent.click(screen.getByRole('button', { name: t.confirm }));
    await screen.findByText(first[0].email); expect(screen.getByText('Страница 1')).toBeTruthy();
    expect(api.history.get[2].params.skip).toBe(0);
  });
});
