import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, Type, LayoutTemplate, Share2, Send, GripVertical, MoreVertical, Maximize2, Trash2, X, Upload } from 'lucide-react';
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
  marginLeft?: string;
}

interface DragItemInfo {
  index: number;
  parentId: string; // 'root' or section ID
}

interface DraggableInsightCardProps {
  item: CanvasItem;
  index: number;
  parentId: string;
  onDragStart: (index: number, parentId: string) => void;
  onDragEnter: (index: number, parentId: string) => void;
  onDragEnd: () => void;
  onUpdate: (index: number, updates: Partial<CanvasItem>, parentId: string) => void;
  onRemove: (index: number, parentId: string) => void;
  containerWidth?: number;
}

const DraggableInsightCard: React.FC<DraggableInsightCardProps> = ({ item, index, parentId, onDragStart, onDragEnter, onDragEnd, onUpdate, onRemove, containerWidth }) => {
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

  const handleResizeStart = (e: React.MouseEvent, direction: 'width' | 'height' | 'both' | 'left') => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    
    const startWidth = cardRef.current?.getBoundingClientRect().width || 0;
    const startHeight = chartContainerRef.current?.getBoundingClientRect().height || 0;
    const startMarginLeft = parseFloat(cardRef.current?.style.marginLeft || '0') || 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (direction === 'width' || direction === 'both') {
        const deltaX = moveEvent.clientX - startX;
        let newWidth = Math.max(300, startWidth + deltaX);
        
        // Constrain to container width if provided
        if (containerWidth) {
            newWidth = Math.min(newWidth, containerWidth - 48); // 48px for padding
        }

        if (cardRef.current) {
            cardRef.current.style.width = `${newWidth}px`;
        }
      }

      if (direction === 'left') {
        const deltaX = moveEvent.clientX - startX;
        let newWidth = Math.max(300, startWidth - deltaX);
        let newMarginLeft = Math.max(0, startMarginLeft + deltaX);
        
        // Constrain to container width if provided
        if (containerWidth) {
            newWidth = Math.min(newWidth, containerWidth - 48);
        }

        if (cardRef.current) {
            cardRef.current.style.width = `${newWidth}px`;
            cardRef.current.style.marginLeft = `${newMarginLeft}px`;
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
      if (direction === 'left') {
         updates.width = cardRef.current?.style.width;
         updates.marginLeft = cardRef.current?.style.marginLeft;
      }
      if (direction === 'height' || direction === 'both') {
         updates.height = chartContainerRef.current?.style.height;
      }
      onUpdate(index, updates, parentId);
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
      onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(index, parentId);
      }}
      onDragEnter={(e) => {
          e.stopPropagation();
          onDragEnter(index, parentId);
      }}
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
        marginLeft: item.marginLeft || '0',
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
                                    onUpdate(index, { width: opt.value }, parentId);
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

      <div ref={chartContainerRef} style={{ height: item.height || '400px', width: '100%', overflow: 'hidden' }}>
          {renderChart()}
      </div>

      {/* Resize Handles */}
      <div
         onMouseDown={(e) => handleResizeStart(e, 'left')}
         className="resize-handle-left"
         style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '8px',
            cursor: 'col-resize',
            zIndex: 10,
         }}
       />
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

const DraggableTextCard: React.FC<DraggableInsightCardProps> = ({ item, index, parentId, onDragStart, onDragEnter, onDragEnd, onUpdate, onRemove, containerWidth }) => {
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
        let newWidth = Math.max(300, startWidth + deltaX);
        
        // Constrain to container width if provided
        if (containerWidth) {
            newWidth = Math.min(newWidth, containerWidth - 48); // 48px for padding
        }

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
      onUpdate(index, updates, parentId);
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
      onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(index, parentId);
      }}
      onDragEnter={(e) => {
          e.stopPropagation();
          onDragEnter(index, parentId);
      }}
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
                                    onUpdate(index, { width: opt.value }, parentId);
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
                                onRemove(index, parentId);
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
                onChange={(e) => onUpdate(index, { content: { ...item.content, text: e.target.value } }, parentId)}
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
                onChange={(e) => onUpdate(index, { content: { ...item.content, text: e.target.value } }, parentId)}
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

const DraggableSectionCard: React.FC<DraggableInsightCardProps> = ({ item, index, parentId, onDragStart, onDragEnter, onDragEnd, onUpdate, onRemove }) => {
  const navigate = useNavigate();
  const [isDraggable, setIsDraggable] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(item.content.title || 'MAIN SECTION');
  const [isPublishing, setIsPublishing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditingTitle]);

  const handlePublishSection = async () => {
    const sectionItems = item.content.items || [];
    
    if (sectionItems.length === 0) {
      alert('Cannot publish an empty section. Please add at least one chart.');
      return;
    }

    // Validate that all items are insights with chart data
    const insights = sectionItems.filter((i: CanvasItem) => i.type === 'insight');
    if (insights.length === 0) {
      alert('Section must contain at least one insight/chart to publish.');
      return;
    }

    setIsPublishing(true);
    try {
      // Get section container width to calculate proportional widths
      const sectionWidth = contentRef.current?.getBoundingClientRect().width || 1200;
      
      // Collect text blocks to add to description
      const textBlocks = sectionItems
        .filter((i: CanvasItem) => i.type === 'text')
        .map((i: CanvasItem) => i.content.text)
        .filter(Boolean);
      
      const description = textBlocks.length > 0 
        ? `Published from section: ${title}\n\n${textBlocks.join('\n\n')}`
        : `Published from section: ${title}`;
      
      // Prepare charts data preserving the layout
      let currentY = 0; // Track vertical position (in grid units)
      let currentRowX = 0; // Track horizontal position in current row
      let currentRowHeight = 0; // Track height of current row
      
      const charts = insights.map((insight: CanvasItem, idx: number) => {
        const { dashboardId, chart } = insight.content;
        
        // Calculate grid width (12-column system)
        // Parse width from CSS values like '100%', 'calc(50% - 12px)', or '600px'
        let gridWidth = 12; // Default full width
        if (insight.width) {
          const widthStr = insight.width;
          if (widthStr.includes('%')) {
            const percentage = parseInt(widthStr);
            gridWidth = Math.round((percentage / 100) * 12);
          } else if (widthStr.includes('px')) {
            const pixels = parseInt(widthStr);
            const percentage = (pixels / sectionWidth) * 100;
            gridWidth = Math.round((percentage / 100) * 12);
          } else if (widthStr.includes('calc')) {
            // Handle calc expressions like 'calc(50% - 12px)'
            if (widthStr.includes('50%')) gridWidth = 6;
            else if (widthStr.includes('33%')) gridWidth = 4;
            else if (widthStr.includes('66%')) gridWidth = 8;
            else if (widthStr.includes('25%')) gridWidth = 3;
            else if (widthStr.includes('75%')) gridWidth = 9;
          }
        }
        
        // Constrain to valid grid values
        gridWidth = Math.max(1, Math.min(12, gridWidth));
        
        // Calculate grid height - add extra space for better visibility
        let gridHeight = 5; // Increased default height for better spacing
        if (insight.height) {
          const heightStr = insight.height;
          if (heightStr.includes('px')) {
            const pixels = parseInt(heightStr);
            // Increase height calculation for proper spacing (add 50px for gaps)
            gridHeight = Math.max(4, Math.round((pixels + 50) / 100));
          }
        }
        
        // Calculate position based on layout flow
        let posX = currentRowX;
        let posY = currentY;
        
        // Check if chart fits in current row
        if (currentRowX + gridWidth > 12) {
          // Move to next row
          currentY += currentRowHeight;
          currentRowX = 0;
          currentRowHeight = 0;
          posX = 0;
          posY = currentY;
        }
        
        // Update tracking variables
        currentRowX += gridWidth;
        currentRowHeight = Math.max(currentRowHeight, gridHeight);
        
        // If this chart takes full width, move to next row for next chart
        if (gridWidth === 12) {
          currentY += gridHeight;
          currentRowX = 0;
          currentRowHeight = 0;
        }
        
        return {
          dataset_id: chart.dataset_id,
          chart_type: chart.chart_type,
          x_column: chart.x_column || null,
          y_column: chart.y_column || null,
          title: chart.title || insight.content.title,
          config: chart.config || {},
          position_x: posX,
          position_y: posY,
          width: gridWidth,
          height: gridHeight
        };
      });

      // Create the dashboard
      const dashboardPayload = {
        name: title,
        description: description,
        charts: charts
      };

      console.log('Publishing dashboard with payload:', {
        name: dashboardPayload.name,
        chartCount: charts.length,
        charts: charts.map(c => ({
          title: c.title,
          position: `(${c.position_x}, ${c.position_y})`,
          size: `${c.width}x${c.height}`,
          type: c.chart_type
        }))
      });

      const createdDashboard = await dashboardService.createDashboard(dashboardPayload);
      
      // Invalidate dashboards cache so the new dashboard appears in the list
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      
      // Success feedback
      alert(`Dashboard "${title}" published successfully! A new section has been created.`);
      
      // Remove the published section from canvas (a new one will auto-create)
      onRemove(index, parentId);
    } catch (error: any) {
      console.error('Failed to publish section:', error);
      alert(`Failed to publish dashboard: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    onUpdate(index, { content: { ...item.content, title } }, parentId);
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
            // Update minHeight instead of height for dynamic sizing
            contentRef.current.style.minHeight = `${newHeight}px`;
            contentRef.current.style.height = 'auto';
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
         // For sections, we store the min-height as the height preference
         updates.height = contentRef.current?.style.minHeight;
      }
      onUpdate(index, updates, parentId);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const sectionItems = item.content.items || [];

  return (
    <div 
      ref={cardRef}
      draggable={isDraggable}
      onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(index, parentId);
      }}
      onDragEnter={(e) => {
          e.stopPropagation();
          onDragEnter(index, parentId);
      }}
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
        <div 
            ref={contentRef}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Allow drop
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // This will be handled by the parent's onDragEnd logic if we set the dragOverItem correctly
                // But since we need to know we dropped INTO the section, we might need a special handler
                // For now, let's rely on onDragEnter setting the dragOverItem to a special value or handling it in onDragEnd
                onDragEnter(-1, item.id); // -1 indicates dropping into the container, not replacing an item
            }}
            style={{ 
                minHeight: item.height || '300px', 
                height: 'auto',
                width: '100%',
                border: sectionItems.length === 0 ? '2px dashed #e2e8f0' : 'none',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: sectionItems.length === 0 ? 'column' : 'row',
                flexWrap: 'wrap',
                alignItems: sectionItems.length === 0 ? 'center' : 'flex-start',
                justifyContent: sectionItems.length === 0 ? 'center' : 'flex-start',
                backgroundColor: '#f8fafc',
                gap: '24px',
                padding: sectionItems.length === 0 ? 0 : '24px',
                overflow: 'visible', // Allow content to expand container
                position: 'relative'
            }}
        >
            {sectionItems.length === 0 ? (
                <>
                    <LayoutTemplate size={32} color="#94a3b8" style={{ marginBottom: '12px' }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748b' }}>Grid Canvas</span>
                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#94a3b8', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Drag elements here and use the layout icon to resize
                    </span>
                </>
            ) : (
                sectionItems.map((subItem: CanvasItem, subIndex: number) => {
                    if (subItem.type === 'insight') {
                        return (
                            <DraggableInsightCard
                                key={subItem.id}
                                item={subItem}
                                index={subIndex}
                                parentId={item.id}
                                onDragStart={onDragStart}
                                onDragEnter={onDragEnter}
                                onDragEnd={onDragEnd}
                                onUpdate={onUpdate}
                                onRemove={onRemove}
                                containerWidth={contentRef.current?.getBoundingClientRect().width}
                            />
                        );
                    }
                    if (subItem.type === 'text') {
                        return (
                            <DraggableTextCard
                                key={subItem.id}
                                item={subItem}
                                index={subIndex}
                                parentId={item.id}
                                onDragStart={onDragStart}
                                onDragEnter={onDragEnter}
                                onDragEnd={onDragEnd}
                                onUpdate={onUpdate}
                                onRemove={onRemove}
                                containerWidth={contentRef.current?.getBoundingClientRect().width}
                            />
                        );
                    }
                    return null;
                })
            )}
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
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const editDashboardId = searchParams.get('edit');
  
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [showTextMenu, setShowTextMenu] = useState(false);
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [isEditingHeaderTitle, setIsEditingHeaderTitle] = useState(false);
  const [headerTitle, setHeaderTitle] = useState('MAIN SECTION');
  
  const dragItem = useRef<DragItemInfo | null>(null);
  const dragOverItem = useRef<DragItemInfo | null>(null);
  const textMenuRef = useRef<HTMLDivElement>(null);
  const headerTitleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (textMenuRef.current && !textMenuRef.current.contains(event.target as Node)) {
        setShowTextMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-create section on mount (only for new dashboards, not editing)
  useEffect(() => {
    if (!editDashboardId && canvasItems.length === 0) {
      setCanvasItems([{
        id: 'main-section',
        type: 'section',
        content: {
          title: 'MAIN SECTION',
          items: []
        },
        width: '100%',
        height: '300px'
      }]);
    }
  }, [editDashboardId]);

  // Load dashboard for editing
  useEffect(() => {
    if (editDashboardId) {
      setIsLoadingDashboard(true);
      dashboardService.getDashboard(editDashboardId)
        .then(dashboard => {
          // Convert dashboard charts to canvas items (insights)
          const items: CanvasItem[] = dashboard.charts.map((chart: any) => ({
            id: `insight-${chart.id}`,
            type: 'insight' as const,
            content: {
              dashboardId: editDashboardId,
              chart: chart,
              title: chart.title
            },
            width: `${(chart.width / 12) * 100}%`,
            height: `${chart.height * 100}px`,
            marginLeft: `${(chart.position_x / 12) * 100}%`
          }));
          
          // Wrap items in a section for consistency
          setCanvasItems([{
            id: 'main-section',
            type: 'section',
            content: {
              title: dashboard.name,
              items: items
            },
            width: '100%',
            height: '300px'
          }]);
          setIsLoadingDashboard(false);
        })
        .catch(err => {
          console.error('Failed to load dashboard for editing:', err);
          setIsLoadingDashboard(false);
        });
    }
  }, [editDashboardId]);

  const handleSort = () => {
    if (!dragItem.current || !dragOverItem.current) return;
    
    const sourceParentId = dragItem.current.parentId;
    const destParentId = dragOverItem.current.parentId;
    const sourceIndex = dragItem.current.index;
    const destIndex = dragOverItem.current.index;

    // Deep clone to avoid mutation issues
    const items = JSON.parse(JSON.stringify(canvasItems));

    // Helper to find list by parentId
    const getList = (parentId: string): CanvasItem[] => {
        if (parentId === 'root') return items;
        const section = items.find((i: CanvasItem) => i.id === parentId);
        if (section && section.type === 'section') {
            if (!section.content.items) section.content.items = [];
            return section.content.items;
        }
        return [];
    };

    const sourceList = getList(sourceParentId);
    const destList = getList(destParentId);

    let movedItem: CanvasItem;

    // If dropping into a section container (special case index -1)
    if (destIndex === -1) {
        // Remove from source
        [movedItem] = sourceList.splice(sourceIndex, 1);
        // Add to end of destination
        destList.push(movedItem);
    } else {
        // Standard reorder or move
        if (sourceParentId === destParentId) {
            [movedItem] = sourceList.splice(sourceIndex, 1);
            sourceList.splice(destIndex, 0, movedItem);
        } else {
            [movedItem] = sourceList.splice(sourceIndex, 1);
            destList.splice(destIndex, 0, movedItem);
        }
    }

    // Auto-resize if moving into a section from outside
    if (destParentId !== 'root' && sourceParentId !== destParentId) {
        movedItem.width = '100%';
    }
    
    dragItem.current = null;
    dragOverItem.current = null;
    setCanvasItems(items);
  };

  const handleUpdateItem = (index: number, updates: Partial<CanvasItem>, parentId: string = 'root') => {
    const newItems = JSON.parse(JSON.stringify(canvasItems));
    
    if (parentId === 'root') {
        newItems[index] = { ...newItems[index], ...updates };
    } else {
        const section = newItems.find((i: CanvasItem) => i.id === parentId);
        if (section && section.type === 'section' && section.content.items) {
            section.content.items[index] = { ...section.content.items[index], ...updates };
        }
    }
    
    setCanvasItems(newItems);
  };

  const handleRemoveItem = (index: number, parentId: string = 'root') => {
    const newItems = JSON.parse(JSON.stringify(canvasItems));
    let removedItemType: string | null = null;
    
    if (parentId === 'root') {
        removedItemType = newItems[index]?.type;
        newItems.splice(index, 1);
    } else {
        const section = newItems.find((i: CanvasItem) => i.id === parentId);
        if (section && section.type === 'section' && section.content.items) {
            section.content.items.splice(index, 1);
        }
    }
    
    setCanvasItems(newItems);
    
    // If a section was removed, auto-create a new one
    if (removedItemType === 'section') {
      setTimeout(() => {
        setCanvasItems(prev => [...prev, {
          id: 'main-section',
          type: 'section',
          content: {
            title: 'MAIN SECTION',
            items: []
          },
          width: '100%',
          height: '300px'
        }]);
      }, 100);
    }
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
    // Only allow one section at a time
    const existingSection = canvasItems.find(item => item.type === 'section');
    if (existingSection) {
      alert('You can only create one section at a time. Publish the current section before creating a new one.');
      return;
    }
    
    setCanvasItems(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      type: 'section',
      content: {
        title: 'MAIN SECTION',
        items: []
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
        const newInsight = {
          id: Math.random().toString(36).substr(2, 9),
          type: 'insight' as const,
          content: {
            dashboardId: dashboard.id,
            chart: chart,
            title: dashboard.name
          }
        };
        
        // Find the section and add insight to it
        setCanvasItems(prev => prev.map(item => {
          if (item.type === 'section') {
            return {
              ...item,
              content: {
                ...item.content,
                items: [...(item.content.items || []), newInsight]
              }
            };
          }
          return item;
        }));
      }
    } catch (error) {
      console.error("Failed to load insight details", error);
    }
  };

  const handleSaveDashboard = async () => {
    // Collect all insights from canvas
    const allInsights = canvasItems.filter(item => item.type === 'insight');
    
    if (allInsights.length === 0) {
      alert('Cannot save an empty dashboard. Please add at least one chart.');
      return;
    }

    let dashboardName = 'New Dashboard';
    
    // Only prompt for name when creating new dashboard
    if (!editDashboardId) {
      const promptedName = prompt('Enter dashboard name:', 'New Dashboard');
      if (!promptedName) return;
      dashboardName = promptedName;
    }

    setIsLoadingDashboard(true);
    try {
      // Get container width for calculations
      const containerWidth = 1200; // Default width
      
      // Prepare charts data preserving the layout
      let currentY = 0;
      let currentRowX = 0;
      let currentRowHeight = 0;
      
      const charts = allInsights.map((insight: CanvasItem) => {
        const { dashboardId, chart } = insight.content;
        
        // Calculate grid width (12-column system)
        let gridWidth = 12;
        if (insight.width) {
          const widthStr = insight.width;
          if (widthStr.includes('%')) {
            const percentage = parseInt(widthStr);
            gridWidth = Math.round((percentage / 100) * 12);
          } else if (widthStr.includes('px')) {
            const pixels = parseInt(widthStr);
            const percentage = (pixels / containerWidth) * 100;
            gridWidth = Math.round((percentage / 100) * 12);
          } else if (widthStr.includes('calc')) {
            if (widthStr.includes('50%')) gridWidth = 6;
            else if (widthStr.includes('33%')) gridWidth = 4;
            else if (widthStr.includes('66%')) gridWidth = 8;
            else if (widthStr.includes('25%')) gridWidth = 3;
            else if (widthStr.includes('75%')) gridWidth = 9;
          }
        }
        
        gridWidth = Math.max(1, Math.min(12, gridWidth));
        
        // Calculate grid height
        let gridHeight = 5;
        if (insight.height) {
          const heightStr = insight.height;
          if (heightStr.includes('px')) {
            const pixels = parseInt(heightStr);
            gridHeight = Math.max(4, Math.round((pixels + 50) / 100));
          }
        }
        
        // Calculate position based on layout flow
        let posX = currentRowX;
        let posY = currentY;
        
        // Check if chart fits in current row
        if (currentRowX + gridWidth > 12) {
          currentY += currentRowHeight;
          currentRowX = 0;
          currentRowHeight = 0;
          posX = 0;
          posY = currentY;
        }
        
        // Update tracking variables
        currentRowX += gridWidth;
        currentRowHeight = Math.max(currentRowHeight, gridHeight);
        
        // If this chart takes full width, move to next row for next chart
        if (gridWidth === 12) {
          currentY += gridHeight;
          currentRowX = 0;
          currentRowHeight = 0;
        }
        
        return {
          dataset_id: chart.dataset_id,
          chart_type: chart.chart_type,
          x_column: chart.x_column || null,
          y_column: chart.y_column || null,
          title: chart.title || insight.content.title,
          config: chart.config || {},
          position_x: posX,
          position_y: posY,
          width: gridWidth,
          height: gridHeight
        };
      });

      const dashboardPayload = {
        name: dashboardName,
        description: `Created with ${charts.length} chart(s)`,
        charts: charts
      };

      if (editDashboardId) {
        // Update existing dashboard - delete old charts and create new ones
        const dashboard = await dashboardService.getDashboard(editDashboardId);
        
        // Delete all existing charts
        for (const chart of dashboard.charts) {
          await dashboardService.deleteChart(editDashboardId, chart.id);
        }
        
        // Update dashboard description (keep existing name)
        await dashboardService.updateDashboard(editDashboardId, {
          description: dashboardPayload.description
        });
        
        // Add new charts
        for (const chart of charts) {
          await dashboardService.addChart(editDashboardId, chart);
        }
        
        alert('Dashboard updated successfully!');
        navigate(`/dashboards/${editDashboardId}`);
      } else {
        // Create new dashboard
        const createdDashboard = await dashboardService.createDashboard(dashboardPayload);
        
        if (window.confirm(`Dashboard "${dashboardName}" created successfully!\n\nWould you like to view it now?`)) {
          navigate(`/dashboards/${createdDashboard.id}`);
        }
      }
    } catch (error: any) {
      console.error('Failed to save dashboard:', error);
      alert(`Failed to save dashboard: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f8fafc' }}>
      {isLoadingDashboard && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '32px 48px',
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>Loading dashboard...</div>
          </div>
        </div>
      )}
      
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
          
          {/* Dashboard Title */}
          {canvasItems.length > 0 && canvasItems[0].type === 'section' && (
            isEditingHeaderTitle ? (
              <input
                ref={headerTitleInputRef}
                value={headerTitle}
                onChange={(e) => setHeaderTitle(e.target.value)}
                onBlur={() => {
                  setIsEditingHeaderTitle(false);
                  // Update the section title
                  setCanvasItems(prev => prev.map((item, idx) => 
                    idx === 0 && item.type === 'section' 
                      ? { ...item, content: { ...item.content, title: headerTitle } }
                      : item
                  ));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingHeaderTitle(false);
                    setCanvasItems(prev => prev.map((item, idx) => 
                      idx === 0 && item.type === 'section' 
                        ? { ...item, content: { ...item.content, title: headerTitle } }
                        : item
                    ));
                  }
                }}
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#0f172a',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  border: '1px solid #4f46e5',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  outline: 'none',
                  width: '250px',
                  backgroundColor: 'white'
                }}
                autoFocus
              />
            ) : (
              <h1 
                onClick={() => {
                  setHeaderTitle(canvasItems[0].content.title || 'MAIN SECTION');
                  setIsEditingHeaderTitle(true);
                }}
                style={{ 
                  fontSize: '16px', 
                  fontWeight: 700, 
                  color: '#0f172a', 
                  margin: 0, 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {canvasItems[0].content.title || 'MAIN SECTION'}
              </h1>
            )
          )}
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
          </div>
          
          {/* Update Button - only show in edit mode */}
          {editDashboardId && canvasItems.length > 0 && canvasItems[0].type === 'section' && (() => {
            const section = canvasItems[0];
            const sectionItems = section.type === 'section' ? (section.content.items || []) : [];
            const insights = sectionItems.filter((i: CanvasItem) => i.type === 'insight');
            const hasInsights = insights.length > 0;
            
            return (
              <button 
                disabled={!hasInsights}
                onClick={async () => {
                  if (!hasInsights) {
                    return;
                  }
                  
                  try {
                    setIsLoadingDashboard(true);
                    const containerWidth = 1200;
                    let currentY = 0;
                    let currentRowX = 0;
                    let currentRowHeight = 0;
                    
                    const charts = insights.map((insight: CanvasItem) => {
                      const { dashboardId, chart } = insight.content;
                      let gridWidth = 12;
                      if (insight.width) {
                        const widthStr = insight.width;
                        if (widthStr.includes('%')) {
                          const percentage = parseInt(widthStr);
                          gridWidth = Math.round((percentage / 100) * 12);
                        } else if (widthStr.includes('px')) {
                          const pixels = parseInt(widthStr);
                          const percentage = (pixels / containerWidth) * 100;
                          gridWidth = Math.round((percentage / 100) * 12);
                        } else if (widthStr.includes('calc')) {
                          if (widthStr.includes('50%')) gridWidth = 6;
                          else if (widthStr.includes('33%')) gridWidth = 4;
                          else if (widthStr.includes('66%')) gridWidth = 8;
                          else if (widthStr.includes('25%')) gridWidth = 3;
                          else if (widthStr.includes('75%')) gridWidth = 9;
                        }
                      }
                      
                      gridWidth = Math.max(1, Math.min(12, gridWidth));
                      
                      let gridHeight = 5;
                      if (insight.height) {
                        const heightStr = insight.height;
                        if (heightStr.includes('px')) {
                          const pixels = parseInt(heightStr);
                          gridHeight = Math.max(4, Math.round((pixels + 50) / 100));
                        }
                      }
                      
                      let posX = currentRowX;
                      let posY = currentY;
                      
                      if (currentRowX + gridWidth > 12) {
                        currentY += currentRowHeight;
                        currentRowX = 0;
                        currentRowHeight = 0;
                        posX = 0;
                        posY = currentY;
                      }
                      
                      currentRowX += gridWidth;
                      currentRowHeight = Math.max(currentRowHeight, gridHeight);
                      
                      if (gridWidth === 12) {
                        currentY += gridHeight;
                        currentRowX = 0;
                        currentRowHeight = 0;
                      }
                      
                      return {
                        dataset_id: chart.dataset_id,
                        chart_type: chart.chart_type,
                        x_column: chart.x_column || null,
                        y_column: chart.y_column || null,
                        title: chart.title || insight.content.title,
                        config: chart.config || {},
                        position_x: posX,
                        position_y: posY,
                        width: gridWidth,
                        height: gridHeight
                      };
                    });

                    // Update existing dashboard - delete old charts and create new ones
                    const dashboard = await dashboardService.getDashboard(editDashboardId);
                    
                    // Delete all existing charts
                    for (const chart of dashboard.charts) {
                      await dashboardService.deleteChart(editDashboardId, chart.id);
                    }
                    
                    // Update dashboard description (keep existing name)
                    await dashboardService.updateDashboard(editDashboardId, {
                      description: `Updated with ${charts.length} chart(s)`
                    });
                    
                    // Add new charts
                    for (const chart of charts) {
                      await dashboardService.addChart(editDashboardId, chart);
                    }
                    
                    queryClient.invalidateQueries({ queryKey: ['dashboards'] });
                    navigate(`/dashboards/${editDashboardId}`);
                  } catch (error: any) {
                    console.error('Failed to update dashboard:', error);
                    alert(`Failed to update dashboard: ${error.response?.data?.detail || error.message}`);
                  } finally {
                    setIsLoadingDashboard(false);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  backgroundColor: hasInsights ? '#10b981' : '#94a3b8',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'white',
                  cursor: hasInsights ? 'pointer' : 'not-allowed',
                  opacity: hasInsights ? 1 : 0.6
                }}
                onMouseEnter={(e) => {
                  if (hasInsights) e.currentTarget.style.backgroundColor = '#059669';
                }}
                onMouseLeave={(e) => {
                  if (hasInsights) e.currentTarget.style.backgroundColor = '#10b981';
                }}
              >
                <Upload size={16} />
                Update Dashboard
              </button>
            );
          })()}
          
          {/* Publish Button - only show in create mode */}
          {!editDashboardId && canvasItems.length > 0 && canvasItems[0].type === 'section' && (() => {
            const section = canvasItems[0];
            const sectionItems = section.type === 'section' ? (section.content.items || []) : [];
            const insights = sectionItems.filter((i: CanvasItem) => i.type === 'insight');
            const hasInsights = insights.length > 0;
            
            return (
              <button 
                disabled={!hasInsights}
                onClick={async () => {
                  if (!hasInsights) {
                    return;
                  }
                  
                  if (section.type === 'section') {
                    const sectionItems = section.content.items || [];
                    const insights = sectionItems.filter((i: CanvasItem) => i.type === 'insight');

                  try {
                    const containerWidth = 1200;
                    let currentY = 0;
                    let currentRowX = 0;
                    let currentRowHeight = 0;
                    
                    const charts = insights.map((insight: CanvasItem) => {
                      const { dashboardId, chart } = insight.content;
                      let gridWidth = 12;
                      if (insight.width) {
                        const widthStr = insight.width;
                        if (widthStr.includes('%')) {
                          const percentage = parseInt(widthStr);
                          gridWidth = Math.round((percentage / 100) * 12);
                        } else if (widthStr.includes('px')) {
                          const pixels = parseInt(widthStr);
                          const percentage = (pixels / containerWidth) * 100;
                          gridWidth = Math.round((percentage / 100) * 12);
                        } else if (widthStr.includes('calc')) {
                          if (widthStr.includes('50%')) gridWidth = 6;
                          else if (widthStr.includes('33%')) gridWidth = 4;
                          else if (widthStr.includes('66%')) gridWidth = 8;
                          else if (widthStr.includes('25%')) gridWidth = 3;
                          else if (widthStr.includes('75%')) gridWidth = 9;
                        }
                      }
                      
                      gridWidth = Math.max(1, Math.min(12, gridWidth));
                      
                      let gridHeight = 5;
                      if (insight.height) {
                        const heightStr = insight.height;
                        if (heightStr.includes('px')) {
                          const pixels = parseInt(heightStr);
                          gridHeight = Math.max(4, Math.round((pixels + 50) / 100));
                        }
                      }
                      
                      let posX = currentRowX;
                      let posY = currentY;
                      
                      if (currentRowX + gridWidth > 12) {
                        currentY += currentRowHeight;
                        currentRowX = 0;
                        currentRowHeight = 0;
                        posX = 0;
                        posY = currentY;
                      }
                      
                      currentRowX += gridWidth;
                      currentRowHeight = Math.max(currentRowHeight, gridHeight);
                      
                      if (gridWidth === 12) {
                        currentY += gridHeight;
                        currentRowX = 0;
                        currentRowHeight = 0;
                      }
                      
                      return {
                        dataset_id: chart.dataset_id,
                        chart_type: chart.chart_type,
                        x_column: chart.x_column || null,
                        y_column: chart.y_column || null,
                        title: chart.title || insight.content.title,
                        config: chart.config || {},
                        position_x: posX,
                        position_y: posY,
                        width: gridWidth,
                        height: gridHeight
                      };
                    });

                    const dashboardPayload = {
                      name: section.content.title || 'MAIN SECTION',
                      description: `Created with ${charts.length} chart(s)`,
                      charts: charts
                    };

                    const createdDashboard = await dashboardService.createDashboard(dashboardPayload);
                    queryClient.invalidateQueries({ queryKey: ['dashboards'] });
                    alert(`Dashboard "${section.content.title}" published successfully! A new section has been created.`);
                    
                    // Remove section and auto-create new one
                    setCanvasItems([{
                      id: 'main-section',
                      type: 'section',
                      content: {
                        title: 'MAIN SECTION',
                        items: []
                      },
                      width: '100%',
                      height: '300px'
                    }]);
                  } catch (error: any) {
                    console.error('Failed to publish:', error);
                    alert(`Failed to publish dashboard: ${error.response?.data?.detail || error.message}`);
                  }
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                backgroundColor: hasInsights ? '#4f46e5' : '#94a3b8',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                color: 'white',
                cursor: hasInsights ? 'pointer' : 'not-allowed',
                opacity: hasInsights ? 1 : 0.6
              }}
              onMouseEnter={(e) => {
                if (hasInsights) e.currentTarget.style.backgroundColor = '#4338ca';
              }}
              onMouseLeave={(e) => {
                if (hasInsights) e.currentTarget.style.backgroundColor = '#4f46e5';
              }}
            >
              <Upload size={16} />
              Publish
            </button>
            );
          })()}
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
                      <LayoutTemplate size={48} color="#4f46e5" strokeWidth={1.5} />
                  </div>
                  <h2 style={{ fontSize: '24px', fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.5px', color: '#0f172a' }}>Start by Creating a Section</h2>
                  <p style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>Click the "Section" button above, then add insights to build your dashboard</p>
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
                    parentId="root"
                    onDragStart={(idx, pid) => (dragItem.current = { index: idx, parentId: pid })}
                    onDragEnter={(idx, pid) => (dragOverItem.current = { index: idx, parentId: pid })}
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
                    parentId="root"
                    onDragStart={(idx, pid) => (dragItem.current = { index: idx, parentId: pid })}
                    onDragEnter={(idx, pid) => (dragOverItem.current = { index: idx, parentId: pid })}
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
                    parentId="root"
                    onDragStart={(idx, pid) => (dragItem.current = { index: idx, parentId: pid })}
                    onDragEnter={(idx, pid) => (dragOverItem.current = { index: idx, parentId: pid })}
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
