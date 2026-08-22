import { getAccessToken } from './supabaseAuth';
import { safeFetchJson } from './api';
import type { MaterialSource, MaterialSourcePage } from '../types/materialSource';

function authHeaders(json = true): HeadersInit {
  const token = getAccessToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token || ''}`,
  };
}

export const materialSourcesApi = {
  list: () => safeFetchJson<{ sources: MaterialSource[] }>('/api/sources', { headers: authHeaders(false) }),
  create: (title: string, sourceType: MaterialSource['source_type']) =>
    safeFetchJson<{ source: MaterialSource }>('/api/sources', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ title, sourceType }),
    }),
  uploadPage: (sourceId: string, payload: {
    base64: string; filename: string; mimeType: string; size: number; width?: number; height?: number;
  }) => safeFetchJson<{ page: MaterialSourcePage }>(`/api/sources/${sourceId}/pages`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(payload),
  }),
  processPage: (sourceId: string, pageId: string) =>
    safeFetchJson<{ page: MaterialSourcePage }>(`/api/sources/${sourceId}/pages/${pageId}/process`, {
      method: 'POST', headers: authHeaders(),
    }),
  reorder: (sourceId: string, pageIds: string[]) =>
    safeFetchJson<{ pages: MaterialSourcePage[] }>(`/api/sources/${sourceId}/pages/reorder`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ pageIds }),
    }),
  removePage: (sourceId: string, pageId: string) =>
    safeFetchJson<{ success: true }>(`/api/sources/${sourceId}/pages/${pageId}`, {
      method: 'DELETE', headers: authHeaders(false),
    }),
  remove: (sourceId: string) => safeFetchJson<{ success: true }>(`/api/sources/${sourceId}`, {
    method: 'DELETE', headers: authHeaders(false),
  }),
};
