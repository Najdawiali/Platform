import api from '../config/api';
import type { SavedWorkflow, SavedWorkflowCreate, SavedWorkflowUpdate } from '../types/saved_workflow';

class SavedWorkflowService {
    async getSavedWorkflows(): Promise<SavedWorkflow[]> {
        const response = await api.get('/api/saved_workflows');
        return response.data;
    }

    async getSavedWorkflow(id: string): Promise<SavedWorkflow> {
        const response = await api.get(`/api/saved_workflows/${id}`);
        return response.data;
    }

    async createSavedWorkflow(data: SavedWorkflowCreate): Promise<SavedWorkflow> {
        const response = await api.post('/api/saved_workflows', data);
        return response.data;
    }

    async updateSavedWorkflow(id: string, data: SavedWorkflowUpdate): Promise<SavedWorkflow> {
        const response = await api.put(`/api/saved_workflows/${id}`, data);
        return response.data;
    }

    async deleteSavedWorkflow(id: string): Promise<void> {
        await api.delete(`/api/saved_workflows/${id}`);
    }
}

export const savedWorkflowService = new SavedWorkflowService();
