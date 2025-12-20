import React, { useState } from 'react';
import { Download, FileImage, FileText, File } from 'lucide-react';

interface ExportDashboardProps {
  dashboardName: string;
  onExportPDF: () => Promise<void>;
  onExportPNG: () => Promise<void>;
  onExportCSV: () => Promise<void>;
  onExportJSON: () => Promise<void>;
}

export const ExportDashboard: React.FC<ExportDashboardProps> = ({
  dashboardName,
  onExportPDF,
  onExportPNG,
  onExportCSV,
  onExportJSON,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<string>('');
  const [showMenu, setShowMenu] = useState(false);

  const handleExport = async (
    type: 'pdf' | 'png' | 'csv' | 'json',
    exportFn: () => Promise<void>
  ) => {
    setIsExporting(true);
    setExportType(type);
    setShowMenu(false);

    try {
      await exportFn();
    } catch (error) {
      console.error(`Export failed:`, error);
      alert(`Failed to export as ${type.toUpperCase()}`);
    } finally {
      setIsExporting(false);
      setExportType('');
    }
  };

  const exportOptions = [
    {
      type: 'pdf' as const,
      label: 'Export as PDF',
      description: 'High-quality document',
      icon: FileText,
      color: '#ef4444',
      action: onExportPDF,
    },
    {
      type: 'png' as const,
      label: 'Export as PNG',
      description: 'Image screenshot',
      icon: FileImage,
      color: '#10b981',
      action: onExportPNG,
    },
    {
      type: 'csv' as const,
      label: 'Export as CSV',
      description: 'Raw data file',
      icon: File,
      color: '#f59e0b',
      action: onExportCSV,
    },
    {
      type: 'json' as const,
      label: 'Export as JSON',
      description: 'Structured data',
      icon: File,
      color: '#8b5cf6',
      action: onExportJSON,
    },
  ];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Export Button */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isExporting}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          fontSize: '14px',
          fontWeight: 600,
          borderRadius: '8px',
          border: 'none',
          backgroundColor: isExporting ? '#d1d5db' : '#4f46e5',
          color: 'white',
          cursor: isExporting ? 'not-allowed' : 'pointer',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!isExporting) {
            e.currentTarget.style.backgroundColor = '#4338ca';
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.15)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isExporting) {
            e.currentTarget.style.backgroundColor = '#4f46e5';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
          }
        }}
      >
        <Download size={18} />
        {isExporting ? `Exporting ${exportType.toUpperCase()}...` : 'Export Dashboard'}
      </button>

      {/* Export Menu */}
      {showMenu && !isExporting && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
            }}
            onClick={() => setShowMenu(false)}
          />

          {/* Menu */}
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              minWidth: '280px',
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
              zIndex: 1000,
              overflow: 'hidden',
            }}
          >
            {/* Menu Header */}
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Export Options
              </h4>
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: '12px',
                  color: '#9ca3af',
                }}
              >
                {dashboardName}
              </p>
            </div>

            {/* Export Options */}
            <div style={{ padding: '8px' }}>
              {exportOptions.map((option) => (
                <button
                  key={option.type}
                  onClick={() => handleExport(option.type, option.action)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      backgroundColor: `${option.color}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <option.icon size={20} color={option.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#111827',
                        marginBottom: '2px',
                      }}
                    >
                      {option.label}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#6b7280',
                      }}
                    >
                      {option.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Footer Tip */}
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#f9fafb',
                borderTop: '1px solid #e5e7eb',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '11px',
                  color: '#9ca3af',
                }}
              >
                💡 Tip: CSV and JSON exports include raw data only
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Export utility functions that can be imported separately
export const exportUtils = {
  /**
   * Export dashboard as PDF using html2canvas + jsPDF
   */
  exportToPDF: async (elementId: string, filename: string) => {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;

      const element = document.getElementById(elementId);
      if (!element) throw new Error('Element not found');

      const canvas = await html2canvas(element, {
        scale: 2,
        logging: false,
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height],
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${filename}.pdf`);
    } catch (error) {
      console.error('PDF export failed:', error);
      throw error;
    }
  },

  /**
   * Export dashboard as PNG using html2canvas
   */
  exportToPNG: async (elementId: string, filename: string) => {
    try {
      const html2canvas = (await import('html2canvas')).default;

      const element = document.getElementById(elementId);
      if (!element) throw new Error('Element not found');

      const canvas = await html2canvas(element, {
        scale: 2,
        logging: false,
        useCORS: true,
      });

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${filename}.png`;
          link.click();
          URL.revokeObjectURL(url);
        }
      });
    } catch (error) {
      console.error('PNG export failed:', error);
      throw error;
    }
  },

  /**
   * Export data as CSV
   */
  exportToCSV: (data: any[], filename: string) => {
    try {
      if (!data || data.length === 0) {
        throw new Error('No data to export');
      }

      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map((row) =>
          headers.map((header) => {
            const value = row[header];
            // Escape values that contain commas, quotes, or newlines
            if (typeof value === 'string' && /[,"\n]/.test(value)) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('CSV export failed:', error);
      throw error;
    }
  },

  /**
   * Export data as JSON
   */
  exportToJSON: (data: any, filename: string) => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('JSON export failed:', error);
      throw error;
    }
  },
};
