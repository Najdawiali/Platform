import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

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

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue.trim(),
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        // Simulate AI response (replace with actual API call)
        setTimeout(() => {
            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `I understand you're asking about: "${userMessage.content}"\n\nThis is a placeholder response. Connect this to your AI backend to get real insights from your data.`,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, aiMessage]);
            setIsLoading(false);
        }, 1500);
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
                                        maxWidth: '80%',
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
                                            whiteSpace: 'pre-wrap',
                                        }}
                                    >
                                        {message.content}
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
