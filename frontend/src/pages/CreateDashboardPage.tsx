import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, Type, LayoutTemplate, Share2, Send, GripVertical, MoreVertical, Maximize2, Trash2, X } from 'lucide-react';
import { LibraryModal } from '../components/LibraryModal';
import { dashboardService } from '../services/dashboardService';
import { ProgressiveXYChart } from '../components/ProgressiveXYChart';
import { SavedTableChart } from '../components/SavedTableChart';
import { SavedChartRenderer } from '../components/SavedChartRenderer';

interface CanvasItem {
  id: string;
  type: 'insight' | 'text' | 'section';
  content: any;
  width?: string;
  height?: string;
}

interface DraggableInsightCardProps {
  item: CanvasItem;
  index: number;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
  onUpdate: (index: number, updates: Partial<CanvasItem>) => void;
  onRemove: (index: number) => void;
}

const DraggableInsightCard: React.FC<DraggableInsightCardProps> = ({ item, index, onDragStart, onDragEnter, onDragEnd, onUpdate, onRemove }) => {
  const [isDraggable, setIsDraggable] = useState(false);
  const [showWidthMenu, setShowWidthMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { dashboardId, chart, title } = item.content;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowWidthMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResizeStart = (e: React.MouseEvent, direction: 'width' | 'height' | 'both') => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    
    const startWidth = cardRef.current?.getBoundingClientRect().width || 0;
    const startHeight = chartContainerRef.current?.getBoundingClientRect().height || 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (direction === 'width' || direction === 'both') {
        const deltaX = moveEvent.clientX - startX;
        const newWidth = Math.max(300, startWidth + deltaX);
        if (cardRef.current) {
            cardRef.current.style.width = `${newWidth}px`;
        }
      }
      
      if (direction === 'height' || direction === 'both') {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.max(200, startHeight + deltaY);
        if (chartContainerRef.current) {
            chartContainerRef.current.style.height = `${newHeight}px`;
        }
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      const updates: Partial<CanvasItem> = {};
      if (direction === 'width' || direction === 'both') {
         updates.width = cardRef.current?.style.width;
      }
      if (direction === 'height' || direction === 'both') {
         updates.height = chartContainerRef.current?.style.height;
      }
      onUpdate(index, updates);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const widthOptions = [
    { label: 'Full Width', value: '100%' },
    { label: 'Half Width (1/2)', value: 'calc(50% - 12px)' },
    { label: 'Two Thirds (2/3)', value: 'calc(66.66% - 8px)' },
    { label: 'One Third (1/3)', value: 'calc(33.33% - 16px)' },
    { label: 'One Quarter (1/4)', value: 'calc(25% - 18px)' },
  ];

  const renderChart = (isFull = false) => (
    <div style={{ height: isFull ? 'calc(100vh - 100px)' : (item.height || '400px'), width: '100%' }}>
        {['bar', 'line', 'area'].includes(chart.chart_type) ? (
        <ProgressiveXYChart
            dashboardId={dashboardId}
            chart={chart}
        />
        ) : chart.chart_type === 'table' ? (
        <SavedTableChart
            dashboardId={dashboardId}
            chartId={chart.id}
            cfg={chart.config || {}}
        />
        ) : (
        <SavedChartRenderer
            dashboardId={dashboardId}
            chart={chart}
        />
        )}
    </div>
  );

  return (
    <>
    {isFullscreen && (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255,255,255,0.98)',
            zIndex: 9999,
            padding: '40px',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{title}</h2>
                <button 
                    onClick={() => setIsFullscreen(false)}
                    style={{ padding: '8px', borderRadius: '8px', border: 'none', background: '#f1f5f9', cursor: 'pointer' }}
                >
                    <X size={24} color="#64748b" />
                </button>
            </div>
            <div style={{ flex: 1, backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', padding: '24px' }}>
                {renderChart(true)}
            </div>
        </div>
    )}

    <div 
      ref={cardRef}
      draggable={isDraggable}
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className="insight-card"
      style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: '24px',
        marginBottom: '0',
        width: item.width || '100%',
        transition: 'box-shadow 0.2s ease', // Removed width transition to avoid lag during resize
        position: 'relative',
        ...(isDraggable ? { cursor: 'move' } : {})
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', color: '#64748b', fontSize: '12px', fontWeight: 600, letterSpacing: '0.5px' }}>
        <div 
            onMouseEnter={() => setIsDraggable(true)}
            onMouseLeave={() => setIsDraggable(false)}
            style={{ cursor: 'grab', display: 'flex', alignItems: 'center', padding: '4px', margin: '-4px 4px -4px -4px', borderRadius: '4px' }}
            onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
            onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
        >
            <GripVertical size={16} style={{ marginRight: '4px' }} />
        </div>
        <BarChart3 size={16} style={{ marginRight: '8px', color: '#4f46e5' }} />
        INSIGHT

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative' }} ref={menuRef}>
                <button 
                    onClick={() => setShowWidthMenu(!showWidthMenu)}
                    style={{ padding: '4px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <LayoutTemplate size={16} />
                </button>
                {showWidthMenu && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        border: '1px solid #e2e8f0',
                        width: '200px',
                        zIndex: 50,
                        padding: '4px'
                    }}>
                        <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                            Width
                        </div>
                        {widthOptions.map(opt => (
                            <button
                                key={opt.label}
                                onClick={() => {
                                    onUpdate(index, { width: opt.value });
                                    setShowWidthMenu(false);
                                }}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '8px 12px',
                                    fontSize: '14px',
                                    color: '#334155',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    borderRadius: '4px'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            
            <div style={{ position: 'relative' }} ref={moreMenuRef}>
                <button 
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    style={{ padding: '4px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <MoreVertical size={16} />
                </button>
                {showMoreMenu && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        border: '1px solid #e2e8f0',
                        width: '180px',
                        zIndex: 50,
                        padding: '4px'
                    }}>
                        <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                            Actions
                        </div>
                        <button
                            onClick={() => {
                                setIsFullscreen(true);
                                setShowMoreMenu(false);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                width: '100%',
                                textAlign: 'left',
                                padding: '8px 12px',
                                fontSize: '14px',
                                color: '#334155',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                borderRadius: '4px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Maximize2 size={14} />
                            Fullscreen
                        </button>
                        <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }} />
                        <button
                            onClick={() => {
                                onRemove(index);
                                setShowMoreMenu(false);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                width: '100%',
                                textAlign: 'left',
                                padding: '8px 12px',
                                fontSize: '14px',
                                color: '#ef4444',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                borderRadius: '4px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Trash2 size={14} />
                            Remove
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>
      
      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '24px' }}>
        {title}
      </h3>

      <div ref={chartContainerRef} style={{ height: item.height || '400px', width: '100%' }}>
          {renderChart()}
      </div>

      {/* Resize Handles */}
      <div
         onMouseDown={(e) => handleResizeStart(e, 'width')}
         className="resize-handle-right"
         style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '8px',
            cursor: 'col-resize',
            zIndex: 10,
         }}
       />
       <div
         onMouseDown={(e) => handleResizeStart(e, 'height')}
         className="resize-handle-bottom"
         style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '8px',
            cursor: 'row-resize',
            zIndex: 10,
         }}
       />
       <div
         onMouseDown={(e) => handleResizeStart(e, 'both')}
         className="resize-handle-corner"
         style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: '16px',
            height: '16px',
            cursor: 'nwse-resize',
            zIndex: 20,
         }}
       >
         <div style={{
            position: 'absolute',
            right: '4px',
            bottom: '4px',
            width: '6px',
            height: '6px',
            borderRight: '2px solid #cbd5e1',
            borderBottom: '2px solid #cbd5e1',
         }} />
       </div>
    </div>
    </>
  );
};

const DraggableTextCard: React.FC<DraggableInsightCardProps> = ({ item, index, onDragStart, onDragEnter, onDragEnd, onUpdate, onRemove }) => {
  const [isDraggable, setIsDraggable] = useState(false);
  const [showWidthMenu, setShowWidthMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { subtype, text } = item.content;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowWidthMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResizeStart = (e: React.MouseEvent, direction: 'width' | 'height' | 'both') => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    
    const startWidth = cardRef.current?.getBoundingClientRect().width || 0;
    const startHeight = contentRef.current?.getBoundingClientRect().height || 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (direction === 'width' || direction === 'both') {
        const deltaX = moveEvent.clientX - startX;
        const newWidth = Math.max(300, startWidth + deltaX);
        if (cardRef.current) {
            cardRef.current.style.width = `${newWidth}px`;
        }
      }
      
      if (direction === 'height' || direction === 'both') {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.max(100, startHeight + deltaY);
        if (contentRef.current) {
            contentRef.current.style.height = `${newHeight}px`;
        }
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      const updates: Partial<CanvasItem> = {};
      if (direction === 'width' || direction === 'both') {
         updates.width = cardRef.current?.style.width;
      }
      if (direction === 'height' || direction === 'both') {
         updates.height = contentRef.current?.style.height;
      }
      onUpdate(index, updates);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const widthOptions = [
    { label: 'Full Width', value: '100%' },
    { label: 'Half Width (1/2)', value: 'calc(50% - 12px)' },
    { label: 'Two Thirds (2/3)', value: 'calc(66.66% - 8px)' },
    { label: 'One Third (1/3)', value: 'calc(33.33% - 16px)' },
    { label: 'One Quarter (1/4)', value: 'calc(25% - 18px)' },
  ];

  return (
    <div 
      ref={cardRef}
      draggable={isDraggable}
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className="insight-card"
      style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: '24px',
        marginBottom: '0',
        width: item.width || '100%',
        transition: 'box-shadow 0.2s ease',
        position: 'relative',
        ...(isDraggable ? { cursor: 'move' } : {})
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', color: '#64748b', fontSize: '12px', fontWeight: 600, letterSpacing: '0.5px' }}>
        <div 
            onMouseEnter={() => setIsDraggable(true)}
            onMouseLeave={() => setIsDraggable(false)}
            style={{ cursor: 'grab', display: 'flex', alignItems: 'center', padding: '4px', margin: '-4px 4px -4px -4px', borderRadius: '4px' }}
            onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
            onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
        >
            <GripVertical size={16} style={{ marginRight: '4px' }} />
        </div>
        <Type size={16} style={{ marginRight: '8px', color: '#4f46e5' }} />
        {subtype === 'header' ? 'TITLE' : 'BODY'}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative' }} ref={menuRef}>
                <button 
                    onClick={() => setShowWidthMenu(!showWidthMenu)}
                    style={{ padding: '4px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <LayoutTemplate size={16} />
                </button>
                {showWidthMenu && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        border: '1px solid #e2e8f0',
                        width: '200px',
                        zIndex: 50,
                        padding: '4px'
                    }}>
                        <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                            Width
                        </div>
                        {widthOptions.map(opt => (
                            <button
                                key={opt.label}
                                onClick={() => {
                                    onUpdate(index, { width: opt.value });
                                    setShowWidthMenu(false);
                                }}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '8px 12px',
                                    fontSize: '14px',
                                    color: '#334155',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    borderRadius: '4px'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            
            <div style={{ position: 'relative' }} ref={moreMenuRef}>
                <button 
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    style={{ padding: '4px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <MoreVertical size={16} />
                </button>
                {showMoreMenu && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        border: '1px solid #e2e8f0',
                        width: '180px',
                        zIndex: 50,
                        padding: '4px'
                    }}>
                        <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                            Actions
                        </div>
                        <button
                            onClick={() => {
                                onRemove(index);
                                setShowMoreMenu(false);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                width: '100%',
                                textAlign: 'left',
                                padding: '8px 12px',
                                fontSize: '14px',
                                color: '#ef4444',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                borderRadius: '4px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Trash2 size={14} />
                            Remove
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>
      
      <div ref={contentRef} style={{ height: item.height || 'auto', width: '100%', minHeight: '50px' }}>
          {subtype === 'header' ? (
            <input
                value={text}
                onChange={(e) => onUpdate(index, { content: { ...item.content, text: e.target.value } })}
                placeholder="Title"
                style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#0f172a',
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    background: 'transparent',
                    fontFamily: 'inherit'
                }}
            />
          ) : (
            <textarea
                value={text}
                onChange={(e) => onUpdate(index, { content: { ...item.content, text: e.target.value } })}
                placeholder="Analysis content goes here..."
                style={{
                    fontSize: '16px',
                    color: '#334155',
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    height: '100%',
                    background: 'transparent',
                    resize: 'none',
                    fontFamily: 'inherit',
                    lineHeight: '1.6'
                }}
            />
          )}
      </div>

      {/* Resize Handles */}
      <div
         onMouseDown={(e) => handleResizeStart(e, 'width')}
         className="resize-handle-right"
         style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '8px',
            cursor: 'col-resize',
            zIndex: 10,
         }}
       />
       <div
         onMouseDown={(e) => handleResizeStart(e, 'height')}
         className="resize-handle-bottom"
         style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '8px',
            cursor: 'row-resize',
            zIndex: 10,
         }}
       />
       <div
         onMouseDown={(e) => handleResizeStart(e, 'both')}
         className="resize-handle-corner"
         style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: '16px',
            height: '16px',
            cursor: 'nwse-resize',
            zIndex: 20,
         }}
       >
         <div style={{
            position: 'absolute',
            right: '4px',
            bottom: '4px',
            width: '6px',
            height: '6px',
            borderRight: '2px solid #cbd5e1',
            borderBottom: '2px solid #cbd5e1',
         }} />
       </div>
    </div>
  );
};

const DraggableSectionCard: React.FC<DraggableInsightCardProps> = ({ item, index, onDragStart, onDragEnter, onDragEnd, onUpdate, onRemove }) => {
  const [isDraggable, setIsDraggable] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(item.content.title || 'MAIN SECTION');
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditingTitle]);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    onUpdate(index, { content: { ...item.content, title } });
  };

  const handleResizeStart = (e: React.MouseEvent, direction: 'width' | 'height' | 'both') => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    
    const startWidth = cardRef.current?.getBoundingClientRect().width || 0;
    const startHeight = contentRef.current?.getBoundingClientRect().height || 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (direction === 'width' || direction === 'both') {
        const deltaX = moveEvent.clientX - startX;
        const newWidth = Math.max(300, startWidth + deltaX);
        if (cardRef.current) {
            cardRef.current.style.width = `${newWidth}px`;
        }
      }
      
      if (direction === 'height' || direction === 'both') {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.max(100, startHeight + deltaY);
        if (contentRef.current) {
            contentRef.current.style.height = `${newHeight}px`;
        }
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      const updates: Partial<CanvasItem> = {};
      if (direction === 'width' || direction === 'both') {
         updates.width = cardRef.current?.style.width;
      }
      if (direction === 'height' || direction === 'both') {
         updates.height = contentRef.current?.style.height;
      }
      onUpdate(index, updates);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      ref={cardRef}
      draggable={isDraggable}
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className="section-card"
      style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        padding: '24px',
        marginBottom: '0',
        width: item.width || '100%',
        transition: 'all 0.2s ease',
        position: 'relative',
        ...(isDraggable ? { cursor: 'move' } : {})
      }}
    >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
            <div 
                onMouseEnter={() => setIsDraggable(true)}
                onMouseLeave={() => setIsDraggable(false)}
                style={{ cursor: 'grab', display: 'flex', alignItems: 'center', padding: '4px', marginRight: '12px', color: '#94a3b8' }}
                onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
                onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
            >
                <GripVertical size={20} />
            </div>
            
            {isEditingTitle ? (
                <input
                    ref={inputRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleTitleSubmit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTitleSubmit();
                    }}
                    style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: '#0f172a',
                        margin: 0,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        border: '1px solid #4f46e5',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        outline: 'none',
                        width: '200px'
                    }}
                />
            ) : (
                <h3 
                    onClick={() => setIsEditingTitle(true)}
                    style={{ 
                        fontSize: '14px', 
                        fontWeight: 700, 
                        color: '#0f172a', 
                        margin: 0, 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.5px',
                        cursor: 'text',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid transparent'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    {item.content.title || 'MAIN SECTION'}
                </h3>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                    onClick={() => {
                        const newExpanded = !isExpanded;
                        setIsExpanded(newExpanded);
                        onUpdate(index, { height: newExpanded ? '600px' : '300px' });
                    }}
                    style={{ padding: '8px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <Maximize2 size={18} />
                </button>
                <button 
                    onClick={() => onRemove(index)}
                    style={{ padding: '8px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>

        <div 
            ref={contentRef}
            style={{ 
                height: item.height || '300px', 
                width: '100%',
                border: '2px dashed #e2e8f0',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f8fafc'
            }}
        >
            <LayoutTemplate size={32} color="#94a3b8" style={{ marginBottom: '12px' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748b' }}>Grid Canvas</span>
            <span style={{ fontSize: '11px', fontWeight: 500, color: '#94a3b8', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Drag elements here and use the layout icon to resize
            </span>
        </div>

       <div
         onMouseDown={(e) => handleResizeStart(e, 'width')}
         className="resize-handle-right"
         style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '8px',
            cursor: 'col-resize',
            zIndex: 10,
         }}
       />
       <div
         onMouseDown={(e) => handleResizeStart(e, 'height')}
         className="resize-handle-bottom"
         style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '8px',
            cursor: 'row-resize',
            zIndex: 10,
         }}
       />
       <div
         onMouseDown={(e) => handleResizeStart(e, 'both')}
         className="resize-handle-corner"
         style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: '16px',
            height: '16px',
            cursor: 'nwse-resize',
            zIndex: 20,
         }}
       >
         <div style={{
            position: 'absolute',
            right: '4px',
            bottom: '4px',
            width: '6px',
            height: '6px',
            borderRight: '2px solid #cbd5e1',
            borderBottom: '2px solid #cbd5e1',
         }} />
       </div>
    </div>
  );
};

export const CreateDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [showTextMenu, setShowTextMenu] = useState(false);
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const textMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (textMenuRef.current && !textMenuRef.current.contains(event.target as Node)) {
        setShowTextMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    
    const _canvasItems = [...canvasItems];
    const draggedItemContent = _canvasItems.splice(dragItem.current, 1)[0];
    _canvasItems.splice(dragOverItem.current, 0, draggedItemContent);
    
    dragItem.current = null;
    dragOverItem.current = null;
    setCanvasItems(_canvasItems);
  };

  const handleUpdateItem = (index: number, updates: Partial<CanvasItem>) => {
    const newItems = [...canvasItems];
    newItems[index] = { ...newItems[index], ...updates };
    setCanvasItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...canvasItems];
    newItems.splice(index, 1);
    setCanvasItems(newItems);
  };

  const handleTextAdd = (subtype: 'header' | 'body') => {
    setCanvasItems(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      type: 'text',
      content: {
        subtype,
        text: ''
      },
      width: '100%',
      height: subtype === 'header' ? 'auto' : '150px'
    }]);
    setShowTextMenu(false);
  };

  const handleSectionAdd = () => {
    setCanvasItems(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      type: 'section',
      content: {
        title: 'MAIN SECTION'
      },
      width: '100%',
      height: '300px'
    }]);
  };

  const handleInsightSelect = async (insightSummary: any) => {
    try {
      const dashboard = await dashboardService.getDashboard(insightSummary.id);
      if (dashboard && dashboard.charts && dashboard.charts.length > 0) {
        const chart = dashboard.charts[0];
        setCanvasItems(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          type: 'insight',
          content: {
            dashboardId: dashboard.id,
            chart: chart,
            title: dashboard.name // Use dashboard name as title for the insight card
          }
        }]);
      }
    } catch (error) {
      console.error("Failed to load insight details", error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f8fafc' }}>
      <LibraryModal 
        isOpen={isLibraryOpen} 
        onClose={() => setIsLibraryOpen(false)} 
        onSelect={handleInsightSelect}
      />
      
      {/* Header */}
      <header style={{
        height: '64px',
        backgroundColor: 'white',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => navigate('/dashboards')}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <ArrowLeft size={20} color="#64748b" />
          </button>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: 0 }}>Executive Review 2025</h1>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#4f46e5', letterSpacing: '0.5px' }}>LIVE ARCHITECT</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            backgroundColor: '#f1f5f9', 
            borderRadius: '8px', 
            padding: '4px',
            marginRight: '12px'
          }}>
            <button className="toolbar-btn" onClick={() => setIsLibraryOpen(true)}>
              <BarChart3 size={16} />
              <span>Insight</span>
            </button>
            <div style={{ position: 'relative' }} ref={textMenuRef}>
                <button className="toolbar-btn" onClick={() => setShowTextMenu(!showTextMenu)}>
                <Type size={16} />
                <span>Text</span>
                </button>
                {showTextMenu && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '4px',
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        border: '1px solid #e2e8f0',
                        width: '160px',
                        zIndex: 50,
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}>
                        <button
                            onClick={() => handleTextAdd('header')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                width: '100%',
                                textAlign: 'left',
                                padding: '10px 12px',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#334155',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                borderRadius: '8px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Type size={16} color="#4f46e5" />
                            Header Text
                        </button>
                        <button
                            onClick={() => handleTextAdd('body')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                width: '100%',
                                textAlign: 'left',
                                padding: '10px 12px',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#334155',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                borderRadius: '8px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ width: '12px', height: '2px', backgroundColor: '#4f46e5' }} />
                                <div style={{ width: '12px', height: '2px', backgroundColor: '#4f46e5' }} />
                                <div style={{ width: '8px', height: '2px', backgroundColor: '#4f46e5' }} />
                            </div>
                            Body Text
                        </button>
                    </div>
                )}
            </div>
            <button className="toolbar-btn" onClick={handleSectionAdd}>
              <LayoutTemplate size={16} />
              <span>Section</span>
            </button>
          </div>

          <button style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            color: '#0f172a',
            cursor: 'pointer'
          }}>
            <Share2 size={16} />
            Share
          </button>

          <button style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: '#4f46e5',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            color: 'white',
            cursor: 'pointer'
          }}>
            <Send size={16} />
            PUBLISH
          </button>
        </div>
      </header>

      {/* Canvas Area */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', padding: '24px' }}>
        {canvasItems.length === 0 ? (
          <div style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'white',
            borderRadius: '24px',
            border: '2px dashed #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}>
              <div style={{ textAlign: 'center', color: '#cbd5e1' }}>
                  <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                      <BarChart3 size={48} color="#4f46e5" strokeWidth={1.5} />
                  </div>
                  <h2 style={{ fontSize: '24px', fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.5px' }}>Start Building Your Dashboard</h2>
              </div>
          </div>
        ) : (
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start' }}>
            {canvasItems.map((item, index) => {
              if (item.type === 'insight') {
                return (
                  <DraggableInsightCard
                    key={item.id}
                    item={item}
                    index={index}
                    onDragStart={(idx) => (dragItem.current = idx)}
                    onDragEnter={(idx) => (dragOverItem.current = idx)}
                    onDragEnd={handleSort}
                    onUpdate={handleUpdateItem}
                    onRemove={handleRemoveItem}
                  />
                );
              }
              if (item.type === 'text') {
                return (
                  <DraggableTextCard
                    key={item.id}
                    item={item}
                    index={index}
                    onDragStart={(idx) => (dragItem.current = idx)}
                    onDragEnter={(idx) => (dragOverItem.current = idx)}
                    onDragEnd={handleSort}
                    onUpdate={handleUpdateItem}
                    onRemove={handleRemoveItem}
                  />
                );
              }
              if (item.type === 'section') {
                return (
                  <DraggableSectionCard
                    key={item.id}
                    item={item}
                    index={index}
                    onDragStart={(idx) => (dragItem.current = idx)}
                    onDragEnter={(idx) => (dragOverItem.current = idx)}
                    onDragEnd={handleSort}
                    onUpdate={handleUpdateItem}
                    onRemove={handleRemoveItem}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
      
      <style>{`
        .toolbar-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border: none;
          background-color: transparent;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
        }
        .toolbar-btn:hover {
          background-color: white;
          color: #0f172a;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
      `}</style>
    </div>
  );
};
