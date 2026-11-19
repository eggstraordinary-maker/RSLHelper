import type { CatalogCreate, CatalogEdit, CatalogGesture, CatalogRevision, CatalogTransition } from '../types/api';
import { apiClient } from './apiClient';

const endpoint = '/admin/catalog';
const gesturePath = (id: string) => `${endpoint}/${encodeURIComponent(id)}`;

export const adminCatalogApi = {
  async list(offset: number, limit: number, signal: AbortSignal): Promise<CatalogGesture[]> {
    const { data } = await apiClient.get<CatalogGesture[]>(endpoint, { params: { offset, limit }, signal });
    return data;
  },
  async get(id: string, signal: AbortSignal): Promise<CatalogGesture> {
    const { data } = await apiClient.get<CatalogGesture>(gesturePath(id), { signal });
    return data;
  },
  async create(fields: CatalogCreate, signal: AbortSignal): Promise<CatalogGesture> {
    const { data } = await apiClient.post<CatalogGesture>(endpoint, fields, { signal });
    return data;
  },
  async edit(id: string, fields: CatalogEdit, signal: AbortSignal): Promise<CatalogGesture> {
    const { data } = await apiClient.put<CatalogGesture>(gesturePath(id), fields, { signal });
    return data;
  },
  async upload(id: string, version: number, file: File, signal: AbortSignal): Promise<CatalogGesture> {
    const form = new FormData();
    form.set('expected_version', String(version));
    form.set('file', file);
    const { data } = await apiClient.put<CatalogGesture>(`${gesturePath(id)}/video`, form, { signal });
    return data;
  },
  async transition(id: string, change: CatalogTransition, signal: AbortSignal): Promise<CatalogGesture> {
    const { data } = await apiClient.post<CatalogGesture>(`${gesturePath(id)}/transitions`, change, { signal });
    return data;
  },
  async history(id: string, beforeVersion: number | undefined, limit: number, signal: AbortSignal): Promise<CatalogRevision[]> {
    const { data } = await apiClient.get<CatalogRevision[]>(`${gesturePath(id)}/versions`, {
      params: { before_version: beforeVersion, limit }, signal,
    });
    return data;
  },
  async preview(id: string, version: number, signal: AbortSignal): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(`${gesturePath(id)}/versions/${version}/content`, {
      responseType: 'blob', signal,
    });
    return data;
  },
};
