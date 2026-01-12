import api from '../config/api';

// const API_URL = 'http://localhost:8000/api'; // api client handles base URL

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content?: string;
    tool_calls?: any[];
}

export interface ChatRequest {
    message: string;
    history?: ChatMessage[];
}

export interface ChatResponse {
    role: 'assistant';
    content?: string;
    tool_calls?: any[];
}

export const aiService = {
    sendMessage: async (message: string, history: ChatMessage[] = []): Promise<ChatResponse> => {
        const response = await api.post<ChatResponse>('/api/ai/chat', {
            message,
            history
        });
        return response.data;
    }
};
