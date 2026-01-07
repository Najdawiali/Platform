import api from '../config/api';
import type { 
  Connection,
  ConnectionCreate,
  // ConnectionTestRequest,
  // ConnectionTestResponse,
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
   * Get connection config including credentials (for edit UI)
   */
  async getConnectionConfig(id: string): Promise<any> {
    const response = await api.get(`/api/connections/${id}/config`, {
      timeout: 15000 // 15 second timeout
    });
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
    const response = await api.put<Connection>(`/api/connections/${id}`, data, {
      timeout: 120000 // 2 minute timeout for sync operations
    });
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
   * Get all databases with their tables from a connection
   */
  async getDatabases(connectionId: string): Promise<Record<string, string[]>> {
    const response = await api.get<{ databases: Record<string, string[]> }>(`/api/connections/${connectionId}/databases`);
    return response.data.databases;
  },

  /**
   * Query data directly from a database connection
   */
  async queryData(
    connectionId: string,
    collection: string,
    limit: number = 1000,
    offset: number = 0,
    database?: string
  ): Promise<any> {
    const response = await api.get(`/api/connections/${connectionId}/data`, {
      params: { collection, limit, offset, database }
    });
    return response.data;
  },

  /**
   * Get connection statistics (total tables/collections and total rows)
   */
  async getConnectionStats(connectionId: string): Promise<{ total_tables: number; total_rows: number }> {
    const response = await api.get<{ total_tables: number; total_rows: number }>(`/api/connections/${connectionId}/stats`);
    return response.data;
  },

  /**
   * Sync connection schema using stored credentials
   */
  async syncConnection(connectionId: string): Promise<any> {
    const response = await api.post(`/api/connections/${connectionId}/sync`);
    return response.data;
  },

  /**
   * Start Salesforce OAuth flow.
   * Backend returns an authorize_url to redirect the browser to.
   */
  async startSalesforceOAuth(params?: { name?: string; auth_base_url?: string; api_version?: string }): Promise<{ authorize_url: string }> {
    const response = await api.post('/api/connections/salesforce/oauth/start', params || {}, {
      timeout: 10000 // 10 second timeout
    });
    return response.data;
  },

  /**
   * List fields for a Salesforce object (for search/selection UI).
   */
  async getSalesforceFields(connectionId: string, objectName: string): Promise<Array<{ name: string; label?: string; type?: string; nillable?: boolean; custom?: boolean }>> {
    const response = await api.get<{ fields: Array<{ name: string; label?: string; type?: string; nillable?: boolean; custom?: boolean }> }>(
      `/api/connections/${connectionId}/fields`,
      { 
        params: { object_name: objectName },
        timeout: 15000 // 15 second timeout
      }
    );
    return response.data?.fields || [];
  },
};