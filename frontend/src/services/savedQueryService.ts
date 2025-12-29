import api from '../config/api';

export interface SavedQueryListItem {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
}

export interface SavedQueryDetail extends SavedQueryListItem {
  query: string;
}

export interface CreateSavedQueryRequest {
  name: string;
  description?: string;
  query: string;
}

export const savedQueryService = {
  listSavedQueries: async (): Promise<SavedQueryListItem[]> => {
    const res = await api.get('/api/saved-queries/');
    return res.data;
  },

  createSavedQuery: async (payload: CreateSavedQueryRequest): Promise<SavedQueryListItem> => {
    const res = await api.post('/api/saved-queries/', payload);
    return res.data;
  },

  getSavedQuery: async (id: string): Promise<SavedQueryDetail> => {
    const res = await api.get(`/api/saved-queries/${id}`);
    return res.data;
  },

  deleteSavedQuery: async (id: string): Promise<void> => {
    await api.delete(`/api/saved-queries/${id}`);
  },
};
