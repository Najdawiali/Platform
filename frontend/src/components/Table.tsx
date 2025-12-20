import React, { useState, useMemo } from 'react';

interface TableColumn {
  datasetId: string;
  columnName: string;
  displayName: string;
  datasetName: string;
}

interface TableProps {
  data: Record<string, any[]>; // Map of columnName to array of values
  columnSelections: TableColumn[];
  colors: string[];
  isLoading?: boolean;
  hasError?: boolean;
  height?: number;
}

export const Table: React.FC<TableProps> = ({
  data,
  columnSelections,
  colors,
  isLoading = false,
  hasError = false,
  height = 600,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [columnSearchTerms, setColumnSearchTerms] = useState<Record<string, string>>({});
  const [searchMode, setSearchMode] = useState<'global' | 'column'>('global');

  // Transform data into rows
  const tableRows = useMemo(() => {
    if (columnSelections.length === 0) return [];

    // Get the maximum length across all columns
    const maxLength = Math.max(
      ...columnSelections.map(col => data[col.displayName]?.length || 0)
    );

    // Create rows
    const rows: Record<string, any>[] = [];
    for (let i = 0; i < maxLength; i++) {
      const row: Record<string, any> = { _rowIndex: i };
      columnSelections.forEach(col => {
        row[col.displayName] = data[col.displayName]?.[i] ?? '';
      });
      rows.push(row);
    }

    return rows;
  }, [data, columnSelections]);

  // Filter rows based on search
  const filteredRows = useMemo(() => {
    if (searchMode === 'global' && searchTerm) {
      return tableRows.filter(row =>
        columnSelections.some(col =>
          String(row[col.displayName] || '')
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        )
      );
    }

    if (searchMode === 'column') {
      return tableRows.filter(row =>
        Object.entries(columnSearchTerms).every(([colName, term]) => {
          if (!term) return true;
          return String(row[colName] || '')
            .toLowerCase()
            .includes(term.toLowerCase());
        })
      );
    }

    return tableRows;
  }, [tableRows, searchTerm, columnSearchTerms, searchMode, columnSelections]);

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedRows = filteredRows.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, columnSearchTerms, rowsPerPage]);

  const handleColumnSearch = (columnName: string, value: string) => {
    setColumnSearchTerms(prev => ({
      ...prev,
      [columnName]: value
    }));
  };

  const clearAllSearches = () => {
    setSearchTerm('');
    setColumnSearchTerms({});
  };

  if (isLoading) {
    return (
      <div style={{
        height: `${height}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#4f46e5',
        fontSize: '16px',
        gap: '12px'
      }}>
        <span style={{ fontSize: '32px' }}>🔄</span>
        <div>Loading table data...</div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          Fetching {columnSelections.length} column{columnSelections.length !== 1 ? 's' : ''}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div style={{
        height: `${height}px`,
        backgroundColor: '#fef2f2',
        border: '2px dashed #fecaca',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ef4444',
        fontSize: '16px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
          <div>Error loading data from service</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
            Check the browser console for details
          </div>
        </div>
      </div>
    );
  }

  if (tableRows.length === 0) {
    return (
      <div style={{
        height: `${height}px`,
        backgroundColor: '#f9fafb',
        border: '2px dashed #d1d5db',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280',
        fontSize: '16px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>Drag columns to display data</div>
          <div style={{ fontSize: '14px', color: '#9ca3af' }}>
            Drag columns from the data panel to Rows or Columns to view table data
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Search and Controls */}
      <div style={{
        marginBottom: '16px',
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Search Mode Toggle */}
          <div style={{ display: 'flex', gap: '4px', backgroundColor: 'white', borderRadius: '6px', padding: '4px', border: '1px solid #e5e7eb' }}>
            <button
              onClick={() => setSearchMode('global')}
              style={{
                padding: '6px 12px',
                backgroundColor: searchMode === 'global' ? '#4f46e5' : 'transparent',
                color: searchMode === 'global' ? 'white' : '#6b7280',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              🔍 Global Search
            </button>
            <button
              onClick={() => setSearchMode('column')}
              style={{
                padding: '6px 12px',
                backgroundColor: searchMode === 'column' ? '#4f46e5' : 'transparent',
                color: searchMode === 'column' ? 'white' : '#6b7280',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              📊 Column Search
            </button>
          </div>

          {/* Global Search */}
          {searchMode === 'global' && (
            <input
              type="text"
              placeholder="Search across all columns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                minWidth: '250px',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                outline: 'none'
              }}
            />
          )}

          {/* Rows per page */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>
              Rows per page:
            </label>
            <select
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              style={{
                padding: '6px 10px',
                fontSize: '13px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* Clear filters */}
          {(searchTerm || Object.values(columnSearchTerms).some(v => v)) && (
            <button
              onClick={clearAllSearches}
              style={{
                padding: '6px 12px',
                backgroundColor: '#fef2f2',
                color: '#ef4444',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* Results info */}
        <div style={{ marginTop: '12px', fontSize: '13px', color: '#6b7280' }}>
          Showing {startIndex + 1}-{Math.min(endIndex, filteredRows.length)} of {filteredRows.length} rows
          {filteredRows.length !== tableRows.length && (
            <span style={{ color: '#4f46e5', fontWeight: 500 }}>
              {' '}(filtered from {tableRows.length} total)
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{
        overflowX: 'auto',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        backgroundColor: 'white'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '14px'
        }}>
          <thead>
            {/* Column headers */}
            <tr style={{ backgroundColor: '#f9fafb' }}>
              {columnSelections.map((col, idx) => (
                <th
                  key={idx}
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#111827',
                    borderBottom: '2px solid #e5e7eb',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: colors[idx % colors.length],
                      display: 'inline-block'
                    }}></span>
                    <div>
                      <div>{col.displayName}</div>
                      <div style={{ fontSize: '11px', fontWeight: 400, color: '#9ca3af', marginTop: '2px' }}>
                        {col.datasetName}
                      </div>
                    </div>
                  </div>
                </th>
              ))}
            </tr>

            {/* Column search row */}
            {searchMode === 'column' && (
              <tr style={{ backgroundColor: '#f9fafb' }}>
                {columnSelections.map((col, idx) => (
                  <th
                    key={idx}
                    style={{
                      padding: '8px 16px',
                      borderBottom: '1px solid #e5e7eb'
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Filter..."
                      value={columnSearchTerms[col.displayName] || ''}
                      onChange={(e) => handleColumnSearch(col.displayName, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        outline: 'none'
                      }}
                    />
                  </th>
                ))}
              </tr>
            )}
          </thead>

          <tbody>
            {paginatedRows.map((row, rowIdx) => (
              <tr
                key={row._rowIndex}
                style={{
                  backgroundColor: rowIdx % 2 === 0 ? 'white' : '#f9fafb',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = rowIdx % 2 === 0 ? 'white' : '#f9fafb';
                }}
              >
                {columnSelections.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    style={{
                      padding: '12px 16px',
                      color: '#374151',
                      borderBottom: '1px solid #e5e7eb'
                    }}
                  >
                    {String(row[col.displayName] || '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          marginTop: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            Page {currentPage} of {totalPages}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              style={{
                padding: '6px 12px',
                backgroundColor: currentPage === 1 ? '#f3f4f6' : 'white',
                color: currentPage === 1 ? '#9ca3af' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              « First
            </button>

            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '6px 12px',
                backgroundColor: currentPage === 1 ? '#f3f4f6' : 'white',
                color: currentPage === 1 ? '#9ca3af' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              ‹ Previous
            </button>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '6px 12px',
                backgroundColor: currentPage === totalPages ? '#f3f4f6' : 'white',
                color: currentPage === totalPages ? '#9ca3af' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              Next ›
            </button>

            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              style={{
                padding: '6px 12px',
                backgroundColor: currentPage === totalPages ? '#f3f4f6' : 'white',
                color: currentPage === totalPages ? '#9ca3af' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              Last »
            </button>
          </div>
        </div>
      )}

      {/* Table info */}
      <div style={{
        marginTop: '16px',
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        fontSize: '14px',
        color: '#6b7280'
      }}>
        <strong style={{ color: '#374151' }}>Table Info:</strong> Displaying {columnSelections.length} column{columnSelections.length !== 1 ? 's' : ''} with {tableRows.length} total row{tableRows.length !== 1 ? 's' : ''} of data.
      </div>
    </div>
  );
};