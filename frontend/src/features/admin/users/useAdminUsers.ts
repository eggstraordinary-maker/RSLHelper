import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { deleteUserById, fetchAllUsers } from '../../../services/adminService';
import type { User } from '../../../types/api';

export const USER_PAGE_SIZE = 20;
type ListState = { users: User[]; page: number; more: boolean; status: 'loading' | 'ready' | 'error' | 'forbidden' };

export function useAdminUsers(currentUserId: number) {
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [list, setList] = useState<ListState>({ users: [], page: 0, more: false, status: 'loading' });
  const [target, setTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(true);
  const busy = useRef(false);

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setList(previous => ({ ...previous, status: 'loading' }));
    fetchAllUsers(page * USER_PAGE_SIZE, USER_PAGE_SIZE + 1, controller.signal).then(users => {
      if (current) setList({ users: users.slice(0, USER_PAGE_SIZE), page, more: users.length > USER_PAGE_SIZE, status: 'ready' });
    }, error => {
      if (current) setList(previous => ({ ...previous, status: axios.isAxiosError(error) && error.response?.status === 403 ? 'forbidden' : 'error' }));
    });
    return () => { current = false; controller.abort(); };
  }, [page, revision]);

  const reload = () => {
    if (busy.current || list.status === 'loading') return;
    setList(previous => ({ ...previous, status: 'loading' }));
    setRevision(value => value + 1);
  };
  const move = (next: number) => {
    if (busy.current || list.status === 'loading' || next < 0 || next > page + 1 || (next > page && !list.more)) return;
    setNotice(''); setTarget(null); setDeleteError('');
    setList(previous => ({ ...previous, status: 'loading' }));
    setPage(next);
  };
  const requestDelete = (user: User) => {
    if (busy.current || list.status !== 'ready' || user.id === currentUserId) return;
    setNotice(''); setDeleteError(''); setTarget(user);
  };
  const cancelDelete = () => { if (!busy.current) { setTarget(null); setDeleteError(''); } };
  const confirmDelete = async () => {
    if (!target || target.id === currentUserId || busy.current) return;
    const id = target.id;
    busy.current = true; setDeleting(true); setDeleteError('');
    let removed = false;
    try {
      await deleteUserById(id);
      removed = true;
      if (active.current) setNotice('users.deleted');
    } catch (error) {
      if (!active.current) return;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 404) { removed = true; setNotice('users.alreadyDeleted'); }
      else if (status === 403) {
        setTarget(null); setList(previous => ({ ...previous, status: 'forbidden' }));
      } else setDeleteError(status === 400 ? 'users.deleteRejected' : 'users.deleteError');
    } finally {
      busy.current = false;
      if (active.current) {
        setDeleting(false);
        if (removed) {
          setTarget(null);
          setList(previous => ({ ...previous, users: previous.users.filter(user => user.id !== id), status: 'loading' }));
          if (list.users.length === 1 && page > 0) setPage(value => value - 1);
          else setRevision(value => value + 1);
        }
      }
    }
  };
  return { users: list.page === page && list.status !== 'forbidden' ? list.users : [],
    more: list.page === page && list.more, status: list.status, page, reload, move,
    target, deleting, deleteError, notice, requestDelete, cancelDelete, confirmDelete };
}
