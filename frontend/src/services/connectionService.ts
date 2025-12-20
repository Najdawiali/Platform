import api from '../config/api';
import type { 
  Connection,
  ConnectionCreate,
  ConnectionTestRequest,
  ConnectionTestResponse,
  SourceSelectionResponse
} from '../types';

export const connectionService = {
  /**
   * Step 1: Select source type and get required fields
   */
  async selectSource(sourceType: string): Promise<SourceSelectionResponse> {
    const response = await api.post<SourceSelectionResponse>(
      '/api/connections/select-source',
      { source_type: sourceType }
    );
    return response.data;
  },

  /**
   * Step 2: Test connection with provided credentials
   */
  async testConnection(sourceType: string, credentials: Record<string, any>): Promise<any> {
    const response = await api.post('/api/connections/test', {
      source_type: sourceType,
      credentials
    });
    return response.data;
  },

  /**
   * Step 3: Create and save connection
   */
  async createConnection(data: ConnectionCreate): Promise<Connection> {
    const response = await api.post<Connection>('/api/connections/', data);
    return response.data;
  },

  /**
   * Get all connections for current user
   */
  async getConnections(): Promise<Connection[]> {
    const response = await api.get<Connection[]>('/api/connections/');
    return response.data;
  },

  /**
   * Get connection by ID
   */
  async getConnectionById(id: string): Promise<Connection> {
    const response = await api.get<Connection>(`/api/connections/${id}`);
    return response.data;
  },

  /**
   * Delete connection
   */
  async deleteConnection(id: string): Promise<void> {
    await api.delete(`/api/connections/${id}`);
  },

  /**
   * Update connection
   */
  async updateConnection(id: string, data: Partial<ConnectionCreate>): Promise<Connection> {
    const response = await api.put<Connection>(`/api/connections/${id}`, data);
    return response.data;
  },

  /**
   * Get collections/tables from a database connection
   */
  async getCollections(connectionId: string): Promise<string[]> {
    const response = await api.get<{ collections: string[] }>(`/api/connections/${connectionId}/collections`);
    return response.data.collections;
  },

  /**
   * Query data directly from a database connection
   */
  async queryData(
    connectionId: string,
    collection: string,
    limit: number = 1000,
    offset: number = 0
  ): Promise<any> {
    const response = await api.get(`/api/connections/${connectionId}/data`, {
      params: { collection, limit, offset }
    });
    return response.data;
  },
};