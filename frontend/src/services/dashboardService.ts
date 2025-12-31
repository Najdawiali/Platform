// frontend/src/services/dashboardService.ts
import api from '../config/api';
import type { Dashboard, DashboardListItem, DashboardCreate } from '../types';

export const dashboardService = {
  // Get all dashboards for current user (excludes insights)
  async getDashboards(): Promise<DashboardListItem[]> {
    const response = await api.get('/api/dashboards/');
    return response.data;
  },

  // Get all insights for current user (excludes regular dashboards)
  async getInsights(): Promise<DashboardListItem[]> {
    const response = await api.get('/api/dashboards/insights');
    return response.data;
  },

  // Get a specific dashboard by ID
  async getDashboard(dashboardId: string): Promise<Dashboard> {
    const response = await api.get(`/api/dashboards/${dashboardId}`);
    return response.data;
  },

  // Create a new dashboard
  async createDashboard(dashboard: DashboardCreate): Promise<Dashboard> {
    const response = await api.post('/api/dashboards/', dashboard);
    return response.data;
  },

  // Create an Insight (dashboard) from SQL query results
  async createSqlInsight(payload: {
    name: string;
    description?: string;
    query: string;
    sources: Array<{ alias: string; type: string; id: string; source_identifier?: string }>;
    chart: { chart_type: string; x_column?: string; y_column?: string; title?: string; config?: Record<string, any> };
  }): Promise<Dashboard> {
    const response = await api.post('/api/dashboards/from-sql', payload);
    return response.data;
  },

  // Update dashboard metadata
  async updateDashboard(dashboardId: string, data: { name?: string; description?: string }): Promise<Dashboard> {
    const response = await api.put(`/api/dashboards/${dashboardId}`, data);
    return response.data;
  },
  
  // Update a SQL-based insight by re-materializing query results
  async updateSqlInsight(dashboardId: string, payload: {
    name: string;
    description?: string;
    query: string;
    sources: Array<{ alias: string; type: string; id: string; source_identifier?: string }>;
    chart: { chart_type: string; x_column?: string; y_column?: string; title?: string; config?: Record<string, any> };
  }): Promise<Dashboard> {
    const response = await api.put(`/api/dashboards/${dashboardId}/from-sql`, payload);
    return response.data;
  },

  // Delete a dashboard
  async deleteDashboard(dashboardId: string): Promise<void> {
    await api.delete(`/api/dashboards/${dashboardId}`);
  },

  // Add a chart to a dashboard
  async addChart(dashboardId: string, chart: any): Promise<any> {
    const response = await api.post(`/api/dashboards/${dashboardId}/charts`, chart);
    return response.data;
  },

  // Update a chart
  async updateChart(dashboardId: string, chartId: string, data: any): Promise<any> {
    const response = await api.put(`/api/dashboards/${dashboardId}/charts/${chartId}`, data);
    return response.data;
  },

  // Delete a chart
  async deleteChart(dashboardId: string, chartId: string): Promise<void> {
    await api.delete(`/api/dashboards/${dashboardId}/charts/${chartId}`);
  },

  // Get aggregated chart data (SNAPSHOT/SCHEDULED mode)
  async getChartAggregatedData(
    dashboardId: string,
    chartId: string,
    aggregationOrOptions?:
      | string
      | {
          aggregation?: string;
          columns?: string;
          offset?: number;
          limit?: number;
          sortColumn?: string;
          sortDir?: 'asc' | 'desc';
        },
  ): Promise<any> {
    const options = typeof aggregationOrOptions === 'string' ? { aggregation: aggregationOrOptions } : (aggregationOrOptions ?? {});
    const params: Record<string, any> = {};
    if (options.aggregation) params.aggregation = options.aggregation;
    if (options.columns) params.columns = options.columns;
    if (typeof options.offset === 'number') params.offset = options.offset;
    if (typeof options.limit === 'number') params.limit = options.limit;
    if (options.sortColumn) params.sort_column = options.sortColumn;
    if (options.sortDir) params.sort_dir = options.sortDir;
    const response = await api.get(`/api/dashboards/${dashboardId}/charts/${chartId}/aggregated-data`, { params });
    return response.data;
  },

  // Get paginated raw data for Data Preview tab
  async getChartRawData(dashboardId: string, chartId: string, page: number = 1, pageSize: number = 100): Promise<any> {
    const response = await api.get(`/api/dashboards/${dashboardId}/charts/${chartId}/raw-data`, {
      params: { page, page_size: pageSize }
    });
    return response.data;
  },

  // Refresh dashboard data (re-execute SQL query)
  async refreshDashboard(dashboardId: string): Promise<any> {
    const response = await api.post(`/api/dashboards/${dashboardId}/refresh`);
    return response.data;
  },

  // Get live query data (LIVE mode)
  async getChartLiveData(dashboardId: string, chartId: string): Promise<any> {
    const response = await api.get(`/api/dashboards/${dashboardId}/charts/${chartId}/live-data`);
    return response.data;
  },
};
