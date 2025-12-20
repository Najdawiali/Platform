import api from '../config/api';
import type { 
  Dataset, 
  DatasetDetail, 
  DatasetPreview, 
  DatasetUploadResponse,
  DatasetFullData
} from '../types';

export const datasetService = {
  /**
   * POST /api/datasets/upload
   * Upload file (CSV or Excel) - creates one or more datasets
   */
  async uploadFile(
    file: File,
    connectionId: string,
    name?: string,
    description?: string
  ): Promise<DatasetUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('connection_id', connectionId);
    if (name) formData.append('name', name);
    if (description) formData.append('description', description);

    const response = await api.post<DatasetUploadResponse>(
      '/api/datasets/upload', 
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  /**
   * POST /api/datasets/from-database
   * Create dataset from database source (Snowflake, SQL Server, MongoDB, etc.)
   */
  async createFromDatabase(
    connectionId: string,
    sourceIdentifier: string,
    name: string,
    description?: string
  ): Promise<DatasetUploadResponse> {
    const formData = new FormData();
    formData.append('connection_id', connectionId);
    formData.append('source_identifier', sourceIdentifier);
    formData.append('name', name);
    if (description) formData.append('description', description);

    const response = await api.post<DatasetUploadResponse>(
      '/api/datasets/from-database',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  /**
   * Create dataset from MongoDB connection
   */
  async createDatasetFromConnection(
    connectionId: string,
    config: { name: string; description?: string; collection?: string }
  ): Promise<Dataset> {
    const formData = new FormData();
    formData.append('connection_id', connectionId);
    formData.append('name', config.name);
    if (config.description) formData.append('description', config.description);
    if (config.collection) formData.append('source_identifier', config.collection);

    const response = await api.post('/api/datasets/from-database', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.results[0].dataset;
  },

  /**
   * GET /api/datasets/
   * Get all datasets for current user
   */
  async getDatasets(connectionId?: string): Promise<Dataset[]> {
    const params = connectionId ? { connection_id: connectionId } : {};
    const response = await api.get<Dataset[]>('/api/datasets/', { params });
    return response.data;
  },

  /**
   * GET /api/datasets/{id}
   * Get dataset details including schema_info
   */
  async getDatasetById(id: string): Promise<DatasetDetail> {
    const response = await api.get<DatasetDetail>(`/api/datasets/${id}`);
    return response.data;
  },

  /**
   * GET /api/datasets/{id}/preview?limit={limit}
   * Get preview of dataset (first N rows with preprocessing applied)
   */
  async getDatasetPreview(id: string, limit: number = 100): Promise<DatasetPreview> {
    const response = await api.get<DatasetPreview>(
      `/api/datasets/${id}/preview`,
      { params: { limit } }
    );
    return response.data;
  },

  /**
   * GET /api/datasets/{id}/full-data
   * Get full dataset data for visualization (up to 100k rows)
   */
  async getFullDatasetData(id: string): Promise<DatasetFullData> {
    const response = await api.get<DatasetFullData>(`/api/datasets/${id}/full-data`);
    return response.data;
  },

  /**
   * GET /api/datasets/{id}/quality-report
   * Get quality report for dataset
   */
  async getQualityReport(id: string): Promise<any> {
    const response = await api.get(`/api/datasets/${id}/quality-report`);
    return response.data;
  },

  /**
   * DELETE /api/datasets/{id}
   * Delete a dataset
   */
  async deleteDataset(id: string): Promise<void> {
    await api.delete(`/api/datasets/${id}`);
  },
};