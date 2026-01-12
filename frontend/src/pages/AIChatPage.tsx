import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiService, type ChatMessage as ServiceChatMessage } from '../services/aiService';
import { datasetService } from '../services/datasetService';
import { connectionService } from '../services/connectionService';
import { ChartCard } from '../components/ChartCard';
import { useQuery } from '@tanstack/react-query';

// --- Type Definitions ---

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content?: string;
    tool_calls?: ToolCall[];
    timestamp: Date;
    isLoading?: boolean;
}

interface ToolCall {
    id: string;
    function: {
        name: string;
        arguments: string; // JSON string
    };
    tool?: string; // Backend custom property
    result?: any; // The result of the tool call
}

// --- Helper Components ---

const SQLResultMessage: React.FC<{ data: any, query: string }> = ({ data, query }) => {
    // data is expected to be { columns: string[], rows: any[] }
    const columns = data?.columns || [];
    const rows = data?.rows || [];

    if (!columns.length || !rows.length) {
        return <div style={{ padding: '12px', color: '#64748b', fontStyle: 'italic' }}>No results found.</div>;
    }

    return (
        <div style={{ marginTop: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white' }}>
            <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
                {query}
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f1f5f9' }}>
                            {columns.map((col: string, idx: number) => (
                                <th key={idx} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row: any, rIdx: number) => (
                            <tr key={rIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                {columns.map((col: string, cIdx: number) => (
                                    <td key={cIdx} style={{ padding: '8px 12px', color: '#334155', whiteSpace: 'nowrap' }}>
                                        {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '11px', color: '#94a3b8' }}>
                Showing {rows.length} rows
            </div>
        </div>
    );
};

const ChartMessage: React.FC<{ config: any }> = ({ config }) => {
    // Config comes from the LLM tool call. It should match DashboardChartCreate structure roughly.
    // We need to fetch data for it.

    // 1. Construct ChartConfig from the tool payload
    const chartConfig: any = useMemo(() => {
        // The tool returns a structure like DashboardChartCreate.
        // We need to merge top-level props into config for ChartCard.
        return {
            id: `ai-chart-${Date.now()}`,
            type: config.chart_type,
            title: config.title || 'Generated Chart',
            columnSelections: config.config?.columnSelections || [],
            rowColumns: config.config?.rowColumns || [],
            colColumns: config.config?.colColumns || [],
            ...config.config
        };
    }, [config]);

    // 2. Fetch Data
    // Logic adapted from VisualizePage.tsx
    const { data: chartData = [], isLoading, error } = useQuery({
        queryKey: ['ai-chart-data', chartConfig],
        queryFn: async () => {
            const allSelections = [
                ...(chartConfig.columnSelections || []),
                ...(chartConfig.rowColumns || []),
                ...(chartConfig.colColumns || [])
            ];

            if (allSelections.length === 0) return [];

            // Group by dataset/connection
            const datasetGroups = allSelections.reduce((acc: any, sel: any) => {
                if (!acc[sel.datasetId]) acc[sel.datasetId] = [];
                if (!acc[sel.datasetId].some((s: any) => s.columnName === sel.columnName)) {
                    acc[sel.datasetId].push(sel);
                }
                return acc;
            }, {});

            for (const [datasetId] of Object.entries(datasetGroups)) {
                try {
                    // Check if this is a database connection (format: "conn:{connectionId}:collection:{collectionName}")
                    if (datasetId.startsWith('conn:')) {
                        const [, connId, , collectionName] = datasetId.split(':');
                        const dbData = await connectionService.queryData(connId, collectionName, 1000, 0);
                        const rows = dbData?.data ?? [];

                        // Extract data for each selected column - simplifying to return full rows for now as ChartCard expects arrays of objects
                        // Ideally we should join if multiple datasets, but for AI chat single dataset is likely.
                        return rows;

                    } else {
                        // Regular dataset
                        const previewData = await datasetService.getDatasetPreview(datasetId);
                        const rows = previewData?.rows ?? [];
                        return rows;
                    }
                } catch (err) {
                    console.error("Error fetching chart data", err);
                    return [];
                }
            }
            return [];
        }
    });

    return (
        <div style={{ marginTop: '16px', maxWidth: '100%', overflowX: 'auto' }}>
            <ChartCard
                chart={chartConfig}
                chartIndex={0}
                isEditing={false}
                selectedDatasets={[]}
                allDatasetDetails={[]}
                datasetDetailsLoading={false}
                datasetDetailsError={false}
                chartData={chartData}
                isChartDataLoading={isLoading}
                hasChartDataError={!!error}
                colors={['#4f46e5', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']}
                onEdit={() => { }}
                onRemove={() => { }}
                onUpdateTitle={() => { }}
                onAddColumn={() => { }}
                onRemoveColumn={() => { }}
            />
        </div>
    );
};

const WorkflowMessage: React.FC<{ workflow: any }> = ({ workflow }) => {
    return (
        <div style={{ marginTop: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', backgroundColor: '#f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '20px' }}>⚡</span>
                <span style={{ fontWeight: 600, color: '#334155' }}>Workflow Created</span>
            </div>
            <div style={{ fontSize: '14px', color: '#475569', marginBottom: '8px' }}>
                <strong>Title:</strong> {workflow.title}
            </div>
            {workflow.steps && (
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                    {workflow.steps.length} steps configured.
                </div>
            )}
            <button style={{ marginTop: '12px', padding: '6px 12px', backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                Open in Workflow Builder
            </button>
        </div>
    );
};

// --- Main Page Component ---

const suggestedPrompts = [
    "Show me the top 5 products by revenue",
    "Compare sales between Q1 and Q2",
    "What are my most active customers?",
    "Summarize my data sources",
];

export const AIChatPage: React.FC = () => {
    const navigate = useNavigate();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return;

        const userText = inputValue.trim();
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: userText,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            // Prepare history for API
            const history: ServiceChatMessage[] = messages.map(m => ({
                role: m.role,
                content: m.content || '',
                tool_calls: m.tool_calls // Pass previous tool calls if any
            }));

            // Call API
            const response = await aiService.sendMessage(userText, history);

            // Construct assistant message
            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response.content || '',
                // @ts-ignore
                tool_calls: response.tool_calls,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, aiMessage]);

        } catch (err) {
            console.error(err);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: "Sorry, I encountered an error communicating with the server.",
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handlePromptClick = (prompt: string) => {
        setInputValue(prompt);
        inputRef.current?.focus();
    };

    // Render message content with potential tool outputs
    const renderMessageContent = (msg: Message) => {
        return (
            <div>
                {msg.content && <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>}

                {msg.tool_calls && msg.tool_calls.map((toolCall, idx) => {
                    // Backend returns structure: { tool: string, args: any, result: any }
                    const toolName = toolCall.tool || toolCall.function?.name;

                    if (toolName === 'execute_sql_query') {
                        // Show data table for SQL results
                        const result = toolCall.result;
                        if (result && result.data && !result.data.error) {
                            return <SQLResultMessage key={idx} data={result.data} query={result.query} />;
                        } else if (result?.data?.error) {
                            return (
                                <div key={idx} style={{ padding: '12px', backgroundColor: '#fef2f2', borderRadius: '8px', color: '#b91c1c', marginTop: '8px' }}>
                                    Query error: {result.data.error}
                                </div>
                            );
                        }
                    }
                    else if (toolName === 'create_dashboard_chart') {
                        // Show success message for chart creation
                        const result = toolCall.result;
                        if (result?.status === 'created') {
                            return (
                                <div key={idx} style={{ marginTop: '12px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '20px' }}>📊</span>
                                        <span style={{ fontWeight: 600, color: '#166534' }}>
                                            {result.message || 'Chart created!'}
                                        </span>
                                    </div>
                                    {result.insight_name && (
                                        <div style={{ marginTop: '8px', fontSize: '13px', color: '#15803d' }}>
                                            Saved as Insight: <strong>{result.insight_name}</strong>
                                        </div>
                                    )}
                                </div>
                            );
                        }
                    }
                    else if (toolName === 'create_workflow') {
                        // Show workflow creation message
                        const result = toolCall.result;
                        const workflow = result?.workflow;
                        if (workflow) {
                            return (
                                <div key={idx} style={{ marginTop: '12px', padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '20px' }}>⚡</span>
                                        <span style={{ fontWeight: 600, color: '#92400e' }}>
                                            {result.message || `Workflow "${workflow.name}" created`}
                                        </span>
                                    </div>
                                    {workflow.steps && workflow.steps.length > 0 && (
                                        <div style={{ marginTop: '8px', fontSize: '13px', color: '#a16207' }}>
                                            {workflow.steps.length} step{workflow.steps.length > 1 ? 's' : ''}: {workflow.steps.map((s: any) => s.name || s.operation).join(' → ')}
                                        </div>
                                    )}
                                </div>
                            );
                        }
                    }
                    return null;
                })}
            </div>
        );
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                backgroundColor: '#f8fafc',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 24px',
                    borderBottom: '1px solid #e2e8f0',
                    backgroundColor: 'white',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '20px',
                        }}
                    >
                        ✨
                    </div>
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                            AI Assistant
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                            Ask questions about your data
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => navigate('/')}
                    style={{
                        background: 'transparent',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#64748b',
                        cursor: 'pointer',
                    }}
                >
                    ← Back
                </button>
            </div>

            {/* Messages Container */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {messages.length === 0 ? (
                    /* Welcome State */
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            maxWidth: '600px',
                            margin: '0 auto',
                        }}
                    >
                        <div
                            style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '24px',
                                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: '40px',
                                marginBottom: '24px',
                                boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
                            }}
                        >
                            ✨
                        </div>
                        <h1
                            style={{
                                fontSize: '28px',
                                fontWeight: 800,
                                color: '#0f172a',
                                marginBottom: '12px',
                            }}
                        >
                            How can I help you today?
                        </h1>
                        <p
                            style={{
                                fontSize: '15px',
                                color: '#64748b',
                                marginBottom: '32px',
                                lineHeight: 1.6,
                            }}
                        >
                            Ask me anything about your data. I can help you analyze trends,
                            find insights, and answer questions in natural language.
                        </p>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: '12px',
                                width: '100%',
                            }}
                        >
                            {suggestedPrompts.map((prompt, index) => (
                                <button
                                    key={index}
                                    onClick={() => handlePromptClick(prompt)}
                                    style={{
                                        padding: '14px 16px',
                                        backgroundColor: 'white',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '12px',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        color: '#475569',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = '#6366f1';
                                        e.currentTarget.style.backgroundColor = '#f8fafc';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = '#e2e8f0';
                                        e.currentTarget.style.backgroundColor = 'white';
                                    }}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* Chat Messages */
                    <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                                    marginBottom: '16px',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '12px',
                                        maxWidth: '90%',
                                        flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                                    }}
                                >
                                    {/* Avatar */}
                                    <div
                                        style={{
                                            width: '36px',
                                            height: '36px',
                                            borderRadius: '10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            background:
                                                message.role === 'user'
                                                    ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                                                    : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                            color: 'white',
                                            fontSize: '16px',
                                        }}
                                    >
                                        {message.role === 'user' ? '👤' : '✨'}
                                    </div>

                                    {/* Message Bubble */}
                                    <div
                                        style={{
                                            padding: '14px 18px',
                                            borderRadius: '16px',
                                            backgroundColor: message.role === 'user' ? '#3b82f6' : 'white',
                                            color: message.role === 'user' ? 'white' : '#0f172a',
                                            fontSize: '14px',
                                            lineHeight: 1.6,
                                            boxShadow:
                                                message.role === 'user'
                                                    ? '0 2px 8px rgba(59, 130, 246, 0.2)'
                                                    : '0 2px 8px rgba(0, 0, 0, 0.05)',
                                            border: message.role === 'user' ? 'none' : '1px solid #e2e8f0',
                                            width: message.role === 'user' ? 'auto' : '100%',
                                        }}
                                    >
                                        {renderMessageContent(message)}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Loading Indicator */}
                        {isLoading && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '12px',
                                    marginBottom: '16px',
                                }}
                            >
                                <div
                                    style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                        color: 'white',
                                        fontSize: '16px',
                                    }}
                                >
                                    ✨
                                </div>
                                <div
                                    style={{
                                        padding: '14px 18px',
                                        borderRadius: '16px',
                                        backgroundColor: 'white',
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                                    }}
                                >
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {[0, 1, 2].map((i) => (
                                            <div
                                                key={i}
                                                style={{
                                                    width: '8px',
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    backgroundColor: '#94a3b8',
                                                    animation: `bounce 1.4s infinite ease-in-out ${i * 0.16}s`,
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div
                style={{
                    padding: '16px 24px 24px',
                    backgroundColor: 'white',
                    borderTop: '1px solid #e2e8f0',
                }}
            >
                <div
                    style={{
                        maxWidth: '800px',
                        margin: '0 auto',
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: '12px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '12px 16px',
                    }}
                >
                    <textarea
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask me anything about your data..."
                        rows={1}
                        style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            backgroundColor: 'transparent',
                            fontSize: '15px',
                            color: '#0f172a',
                            resize: 'none',
                            fontFamily: 'inherit',
                            lineHeight: 1.5,
                            maxHeight: '120px',
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isLoading}
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            border: 'none',
                            background:
                                inputValue.trim() && !isLoading
                                    ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                                    : '#e2e8f0',
                            color: inputValue.trim() && !isLoading ? 'white' : '#94a3b8',
                            cursor: inputValue.trim() && !isLoading ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            flexShrink: 0,
                            transition: 'all 0.15s ease',
                        }}
                    >
                        ↑
                    </button>
                </div>
                <div
                    style={{
                        textAlign: 'center',
                        marginTop: '12px',
                        fontSize: '12px',
                        color: '#94a3b8',
                    }}
                >
                    Press Enter to send, Shift+Enter for new line
                </div>
            </div>

            {/* CSS Animation for loading dots */}
            <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
        </div>
    );
};
