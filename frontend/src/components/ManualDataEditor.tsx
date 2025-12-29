import React, { useState } from 'react';

interface ManualDataEditorProps {
  onSave: (csvContent: string, filename: string) => void;
  onCancel: () => void;
}

export const ManualDataEditor: React.FC<ManualDataEditorProps> = ({ onSave, onCancel }) => {
  const [headers, setHeaders] = useState<string[]>(['Column 1', 'Column 2', 'Column 3']);
  const [rows, setRows] = useState<string[][]>([
    ['', '', ''],
    ['', '', ''],
    ['', '', '']
  ]);
  const [filename, setFilename] = useState<string>('manual_data');

  const handleHeaderChange = (index: number, value: string) => {
    const newHeaders = [...headers];
    newHeaders[index] = value;
    setHeaders(newHeaders);
  };

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = [...rows];
    newRows[rowIndex][colIndex] = value;
    setRows(newRows);
  };

  const addRow = () => {
    setRows([...rows, new Array(headers.length).fill('')]);
  };

  const addColumn = () => {
    setHeaders([...headers, `Column ${headers.length + 1}`]);
    setRows(rows.map(row => [...row, '']));
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const removeColumn = (index: number) => {
    if (headers.length <= 1) return;
    setHeaders(headers.filter((_, i) => i !== index));
    setRows(rows.map(row => row.filter((_, i) => i !== index)));
  };

  const handleSave = () => {
    // Convert to CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape quotes and wrap in quotes if necessary
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(','))
    ].join('\n');

    const finalFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    onSave(csvContent, finalFilename);
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '24px',
      width: '90vw',
      maxWidth: '1000px',
      height: '80vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
          ✍️ Manually Enter Data
        </h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="Filename"
            style={{
              padding: '8px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
          <span style={{ alignSelf: 'center', color: '#64748b', fontSize: '14px' }}>.csv</span>
        </div>
      </div>

      <div style={{ 
        flex: 1, 
        overflow: 'auto', 
        border: '1px solid #e2e8f0', 
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
          <thead>
            <tr>
              <th style={{ width: '40px', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}></th>
              {headers.map((header, i) => (
                <th key={i} style={{ padding: '8px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', minWidth: '150px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="text"
                      value={header}
                      onChange={(e) => handleHeaderChange(i, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        border: '1px solid transparent',
                        borderRadius: '4px',
                        fontWeight: 600,
                        fontSize: '13px',
                        backgroundColor: 'transparent'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#cbd5e1'}
                      onBlur={(e) => e.target.style.borderColor = 'transparent'}
                    />
                    <button
                      onClick={() => removeColumn(i)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: '0 4px'
                      }}
                      title="Remove column"
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
              <th style={{ width: '40px', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <button
                  onClick={addColumn}
                  style={{
                    border: 'none',
                    background: '#eff6ff',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px'
                  }}
                  title="Add column"
                >
                  +
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                  <button
                    onClick={() => removeRow(rowIndex)}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }}
                    title="Remove row"
                  >
                    ×
                  </button>
                </td>
                {row.map((cell, colIndex) => (
                  <td key={colIndex} style={{ padding: '0', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9' }}>
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: 'none',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    />
                  </td>
                ))}
                <td style={{ borderBottom: '1px solid #f1f5f9' }}></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '12px' }}>
          <button
            onClick={addRow}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#f0f9ff',
              color: '#0284c7',
              border: '1px solid #bae6fd',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            <span>+</span> Add Row
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '10px 20px',
            backgroundColor: 'white',
            color: '#64748b',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          style={{
            padding: '10px 20px',
            backgroundColor: '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
          }}
        >
          Save & Import
        </button>
      </div>
    </div>
  );
};
