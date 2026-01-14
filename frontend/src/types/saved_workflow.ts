export interface SavedWorkflow {
    id: string;
    user_id: string;
    name: string;
    workflow_data: any;
    created_at: string;
    updated_at?: string;
}

export interface SavedWorkflowCreate {
    name: string;
    workflow_data: any;
}

export interface SavedWorkflowUpdate {
    name?: string;
    workflow_data?: any;
}
