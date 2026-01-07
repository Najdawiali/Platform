import React, { useState } from 'react';

interface ColumnInfo {
  name: string;
  type: string;
}

interface TableNode {
  id: string;
  name: string;
  columns: ColumnInfo[];
  type: string;
}

interface TransformationConfigModalProps {
  isOpen: boolean;
  transformationType: string;
  transformationCategory: string;
  sourceNode: TableNode | null;
  onSave: (config: any) => void;
  onCancel: () => void;
}

export const TransformationConfigModal: React.FC<TransformationConfigModalProps> = ({
  isOpen,
  transformationType,
  transformationCategory,
  sourceNode,
  onSave,
  onCancel,
}) => {
  const [config, setConfig] = useState<any>({});
  const [selectedOperation, setSelectedOperation] = useState<string>('');

  if (!isOpen) return null;

  const sourceColumns = sourceNode?.columns || [];

  // Define operations for each category
  const categoryOperations: Record<string, string[]> = {
    filters: [
      'Filter by condition',
      'Remove nulls',
      'Remove duplicates',
      'Keep top/bottom N rows'
    ],
    'join-combine': [
      'Inner Join',
      'Left Join',
      'Right Join',
      'Full Outer Join',
      'Union'
    ],
    aggregate: [
      'Group by columns',
      'Sum',
      'Count',
      'Average',
      'Min/Max',
      'Count distinct'
    ],
    columns: [
      'Select specific columns',
      'Reorder columns'
    ],
    'date-time': [
      'Extract year/month/day',
      'Date difference'
    ],
    text: [
      'Split columns',
      'Trim whitespace',
      'Upper/lower case'
    ],
    pivot: [
      'Pivot (rows to columns)',
      'Unpivot (columns to rows)'
    ]
  };

  const operations = categoryOperations[transformationCategory] || [];

  const renderFormFields = () => {
    // First, show operation selection if not selected
    if (!selectedOperation && operations.length > 0) {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3">
              Select Operation
            </label>
            <div className="grid grid-cols-1 gap-2">
              {operations.map((op) => (
                <button
                  key={op}
                  onClick={() => setSelectedOperation(op)}
                  className="px-4 py-3 text-left rounded-lg border-2 border-slate-200 text-sm font-medium text-slate-700 hover:border-blue-500 hover:bg-blue-50 transition-all"
                >
                  {op}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Then show the specific form based on selected operation
    switch (transformationCategory) {
      case 'filters':
        if (selectedOperation === 'Filter by condition') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Select Column to Filter
                </label>
                <select
                  value={config.column || ''}
                  onChange={(e) => setConfig({ ...config, column: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Operator
                </label>
                <select
                  value={config.operator || '='}
                  onChange={(e) => setConfig({ ...config, operator: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="=">=</option>
                  <option value="!=">!=</option>
                  <option value=">">{'>'}</option>
                  <option value="<">{'<'}</option>
                  <option value=">=">{'>=</'}</option>
                  <option value="<=">{'<='}</option>
                  <option value="CONTAINS">contains</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Value
                </label>
                <input
                  type="text"
                  value={config.value || ''}
                  onChange={(e) => setConfig({ ...config, value: e.target.value })}
                  placeholder="Enter filter value"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                />
              </div>
            </div>
          );
        } else if (selectedOperation === 'Remove nulls') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Select Columns to Check for Nulls
                </label>
                {sourceColumns.map((col) => (
                  <div key={col.name} className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={config.columns?.includes(col.name) || false}
                      onChange={(e) => {
                        const columns = config.columns || [];
                        if (e.target.checked) {
                          setConfig({ ...config, columns: [...columns, col.name] });
                        } else {
                          setConfig({ ...config, columns: columns.filter((c: string) => c !== col.name) });
                        }
                      }}
                      className="rounded"
                    />
                    <label className="text-sm">{col.name}</label>
                  </div>
                ))}
              </div>
            </div>
          );
        } else if (selectedOperation === 'Remove duplicates') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Select Columns to Check for Duplicates
                </label>
                {sourceColumns.map((col) => (
                  <div key={col.name} className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={config.columns?.includes(col.name) || false}
                      onChange={(e) => {
                        const columns = config.columns || [];
                        if (e.target.checked) {
                          setConfig({ ...config, columns: [...columns, col.name] });
                        } else {
                          setConfig({ ...config, columns: columns.filter((c: string) => c !== col.name) });
                        }
                      }}
                      className="rounded"
                    />
                    <label className="text-sm">{col.name}</label>
                  </div>
                ))}
              </div>
            </div>
          );
        } else if (selectedOperation === 'Keep top/bottom N rows') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Keep
                </label>
                <select
                  value={config.type || 'top'}
                  onChange={(e) => setConfig({ ...config, type: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Number of Rows
                </label>
                <input
                  type="number"
                  value={config.n || 10}
                  onChange={(e) => setConfig({ ...config, n: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Order By Column
                </label>
                <select
                  value={config.orderColumn || ''}
                  onChange={(e) => setConfig({ ...config, orderColumn: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        }
        break;

      case 'columns':
        if (selectedOperation === 'Select specific columns') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Select Columns to Keep
                </label>
                {sourceColumns.map((col) => (
                  <div key={col.name} className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={config.columns?.includes(col.name) || false}
                      onChange={(e) => {
                        const columns = config.columns || [];
                        if (e.target.checked) {
                          setConfig({ ...config, columns: [...columns, col.name] });
                        } else {
                          setConfig({ ...config, columns: columns.filter((c: string) => c !== col.name) });
                        }
                      }}
                      className="rounded"
                    />
                    <label className="text-sm">{col.name}</label>
                  </div>
                ))}
              </div>
            </div>
          );
        } else if (selectedOperation === 'Reorder columns') {
          return (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Drag and drop to reorder columns (coming soon)</p>
            </div>
          );
        }
        break;

      case 'aggregate':
        if (selectedOperation === 'Group by columns') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Group By Columns
                </label>
                {sourceColumns.map((col) => (
                  <div key={col.name} className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={config.groupBy?.includes(col.name) || false}
                      onChange={(e) => {
                        const groupBy = config.groupBy || [];
                        if (e.target.checked) {
                          setConfig({ ...config, groupBy: [...groupBy, col.name] });
                        } else {
                          setConfig({ ...config, groupBy: groupBy.filter((c: string) => c !== col.name) });
                        }
                      }}
                      className="rounded"
                    />
                    <label className="text-sm">{col.name}</label>
                  </div>
                ))}
              </div>
            </div>
          );
        } else if (['Sum', 'Count', 'Average', 'Min/Max', 'Count distinct'].includes(selectedOperation)) {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Select Column to {selectedOperation}
                </label>
                <select
                  value={config.column || ''}
                  onChange={(e) => setConfig({ ...config, column: e.target.value, aggregation: selectedOperation.toLowerCase() })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        }
        break;

      case 'join-combine':
        if (['Inner Join', 'Left Join', 'Right Join', 'Full Outer Join'].includes(selectedOperation)) {
          return (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Drag another table to the canvas and connect it to this join transformation to specify the second table.
                </p>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Join Type
                </label>
                <input
                  type="text"
                  value={selectedOperation}
                  disabled
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-100 border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Left Table Key Column
                </label>
                <select
                  value={config.leftKey || ''}
                  onChange={(e) => setConfig({ ...config, leftKey: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Right Table Key Column
                </label>
                <input
                  type="text"
                  value={config.rightKey || ''}
                  onChange={(e) => setConfig({ ...config, rightKey: e.target.value })}
                  placeholder="Enter column name from second table"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                />
              </div>
            </div>
          );
        } else if (selectedOperation === 'Union') {
          return (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Union combines rows from multiple tables with the same column structure.
                </p>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Remove Duplicates
                </label>
                <select
                  value={config.removeDuplicates || 'true'}
                  onChange={(e) => setConfig({ ...config, removeDuplicates: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="true">Yes (UNION)</option>
                  <option value="false">No (UNION ALL)</option>
                </select>
              </div>
            </div>
          );
        }
        break;

      case 'date-time':
        if (selectedOperation === 'Extract year/month/day') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Select Date Column
                </label>
                <select
                  value={config.column || ''}
                  onChange={(e) => setConfig({ ...config, column: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Extract Components
                </label>
                {['Year', 'Month', 'Day', 'Hour', 'Minute', 'Day of Week'].map((component) => (
                  <div key={component} className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={config.components?.includes(component) || false}
                      onChange={(e) => {
                        const components = config.components || [];
                        if (e.target.checked) {
                          setConfig({ ...config, components: [...components, component] });
                        } else {
                          setConfig({ ...config, components: components.filter((c: string) => c !== component) });
                        }
                      }}
                      className="rounded"
                    />
                    <label className="text-sm">{component}</label>
                  </div>
                ))}
              </div>
            </div>
          );
        } else if (selectedOperation === 'Date difference') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Start Date Column
                </label>
                <select
                  value={config.startDate || ''}
                  onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  End Date Column
                </label>
                <select
                  value={config.endDate || ''}
                  onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Unit
                </label>
                <select
                  value={config.unit || 'days'}
                  onChange={(e) => setConfig({ ...config, unit: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                  <option value="hours">Hours</option>
                  <option value="minutes">Minutes</option>
                </select>
              </div>
            </div>
          );
        }
        break;

      case 'text':
        if (selectedOperation === 'Split columns') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Select Column to Split
                </label>
                <select
                  value={config.column || ''}
                  onChange={(e) => setConfig({ ...config, column: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Delimiter
                </label>
                <input
                  type="text"
                  value={config.delimiter || ','}
                  onChange={(e) => setConfig({ ...config, delimiter: e.target.value })}
                  placeholder="e.g., , or ; or |"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Number of New Columns
                </label>
                <input
                  type="number"
                  value={config.numColumns || 2}
                  onChange={(e) => setConfig({ ...config, numColumns: parseInt(e.target.value) })}
                  min="2"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                />
              </div>
            </div>
          );
        } else if (selectedOperation === 'Trim whitespace') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Select Columns to Trim
                </label>
                {sourceColumns.map((col) => (
                  <div key={col.name} className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={config.columns?.includes(col.name) || false}
                      onChange={(e) => {
                        const columns = config.columns || [];
                        if (e.target.checked) {
                          setConfig({ ...config, columns: [...columns, col.name] });
                        } else {
                          setConfig({ ...config, columns: columns.filter((c: string) => c !== col.name) });
                        }
                      }}
                      className="rounded"
                    />
                    <label className="text-sm">{col.name}</label>
                  </div>
                ))}
              </div>
            </div>
          );
        } else if (selectedOperation === 'Upper/lower case') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Select Column
                </label>
                <select
                  value={config.column || ''}
                  onChange={(e) => setConfig({ ...config, column: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Convert To
                </label>
                <select
                  value={config.caseType || 'upper'}
                  onChange={(e) => setConfig({ ...config, caseType: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="upper">UPPERCASE</option>
                  <option value="lower">lowercase</option>
                  <option value="title">Title Case</option>
                </select>
              </div>
            </div>
          );
        }
        break;

      case 'pivot':
        if (selectedOperation === 'Pivot (rows to columns)') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Row Column (will become row labels)
                </label>
                <select
                  value={config.rowColumn || ''}
                  onChange={(e) => setConfig({ ...config, rowColumn: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Column to Pivot (will become column headers)
                </label>
                <select
                  value={config.pivotColumn || ''}
                  onChange={(e) => setConfig({ ...config, pivotColumn: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Value Column (data to populate cells)
                </label>
                <select
                  value={config.valueColumn || ''}
                  onChange={(e) => setConfig({ ...config, valueColumn: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="">-- Select Column --</option>
                  {sourceColumns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Aggregation Function
                </label>
                <select
                  value={config.aggFunc || 'sum'}
                  onChange={(e) => setConfig({ ...config, aggFunc: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                >
                  <option value="sum">Sum</option>
                  <option value="count">Count</option>
                  <option value="avg">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                </select>
              </div>
            </div>
          );
        } else if (selectedOperation === 'Unpivot (columns to rows)') {
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  ID Columns (columns to keep as-is)
                </label>
                {sourceColumns.map((col) => (
                  <div key={col.name} className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={config.idColumns?.includes(col.name) || false}
                      onChange={(e) => {
                        const idColumns = config.idColumns || [];
                        if (e.target.checked) {
                          setConfig({ ...config, idColumns: [...idColumns, col.name] });
                        } else {
                          setConfig({ ...config, idColumns: idColumns.filter((c: string) => c !== col.name) });
                        }
                      }}
                      className="rounded"
                    />
                    <label className="text-sm">{col.name}</label>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  New Column Name for Variable Names
                </label>
                <input
                  type="text"
                  value={config.varName || 'variable'}
                  onChange={(e) => setConfig({ ...config, varName: e.target.value })}
                  placeholder="e.g., Category, Metric"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  New Column Name for Values
                </label>
                <input
                  type="text"
                  value={config.valueName || 'value'}
                  onChange={(e) => setConfig({ ...config, valueName: e.target.value })}
                  placeholder="e.g., Amount, Count"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300"
                />
              </div>
            </div>
          );
        }
        break;

      default:
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Configuration for <strong>{selectedOperation || transformationType}</strong> coming soon...
            </p>
          </div>
        );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Configuration coming soon...</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-800">
            {selectedOperation ? `Configure: ${selectedOperation}` : `Configure: ${transformationType}`}
          </h2>
          {selectedOperation && (
            <button
              onClick={() => {
                setSelectedOperation('');
                setConfig({});
              }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              ← Change Operation
            </button>
          )}
        </div>

        {sourceNode && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-slate-600">
              Source: <strong className="text-blue-600">{sourceNode.name}</strong>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {sourceNode.columns.length} columns available
            </p>
          </div>
        )}

        {renderFormFields()}

        <div className="flex gap-3 mt-8 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-semibold text-slate-700 border-2 border-slate-300 rounded-lg hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ ...config, operation: selectedOperation })}
            disabled={!selectedOperation}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all shadow-md hover:shadow-lg ${
              selectedOperation
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            Apply Transformation
          </button>
        </div>
      </div>
    </div>
  );
};
