import api from '../config/api';

export interface ValidationResponse {
  valid: boolean;
  errors: string[];
}

export interface QueryRequest {
  query: string;
  // NOTE: Backend expects `sources` (dataset/connection sources) for federated queries.
  // `source_mapping` was an older approach; keep optional for compatibility.
  sources?: any[];
  source_mapping?: Record<string, string>; // table_name -> source_id
  page?: number;
  page_size?: number;
}

export const queryService = {
  validateQuery: async (query: string): Promise<ValidationResponse> => {
    const response = await api.post('/api/query/validate', { query });
    return response.data;
  },

  executeQuery: async (request: QueryRequest): Promise<any> => {
    const response = await api.post('/api/query/', request);
    return response.data;
  }
};
