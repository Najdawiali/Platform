// frontend/src/services/dashboardService.ts
import api from '../config/api';
import type { Dashboard, DashboardListItem, DashboardCreate } from '../types';

export const dashboardService = {
  // Get all dashboards for current user
  async getDashboards(): Promise<DashboardListItem[]> {
    const response = await api.get('/api/dashboards/');
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

  // Update dashboard metadata
  async updateDashboard(dashboardId: string, data: { name?: string; description?: string }): Promise<Dashboard> {
    const response = await api.put(`/api/dashboards/${dashboardId}`, data);
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
};
