import React, { useState } from 'react';
import { Plus, Trash2, Calculator } from 'lucide-react';

export type CalculatedFieldOperation = 
  | 'add' 
  | 'subtract' 
  | 'multiply' 
  | 'divide' 
  | 'percentage'
  | 'concat'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'length'
  | 'year'
  | 'month'
  | 'day'
  | 'dayofweek';

export interface CalculatedFieldDefinition {
  id: string;
  name: string;
  operation: CalculatedFieldOperation;
  sourceColumns: string[];
  constant?: number;
  format?: 'number' | 'currency' | 'percentage' | 'text' | 'date';
}

interface CalculatedFieldsEditorProps {
  columns: string[];
  calculatedFields: CalculatedFieldDefinition[];
  onChange: (fields: CalculatedFieldDefinition[]) => void;
}

export const CalculatedFieldsEditor: React.FC<CalculatedFieldsEditorProps> = ({
  columns,
  calculatedFields,
  onChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const operations: { value: CalculatedFieldOperation; label: string; minColumns: number; type: 'numeric' | 'string' | 'date' }[] = [
    { value: 'add', label: 'Add (+)', minColumns: 2, type: 'numeric' },
    { value: 'subtract', label: 'Subtract (-)', minColumns: 2, type: 'numeric' },
    { value: 'multiply', label: 'Multiply (×)', minColumns: 2, type: 'numeric' },
    { value: 'divide', label: 'Divide (÷)', minColumns: 2, type: 'numeric' },
    { value: 'percentage', label: 'Percentage (%)', minColumns: 2, type: 'numeric' },
    { value: 'concat', label: 'Concatenate', minColumns: 2, type: 'string' },
    { value: 'uppercase', label: 'Uppercase', minColumns: 1, type: 'string' },
    { value: 'lowercase', label: 'Lowercase', minColumns: 1, type: 'string' },
    { value: 'trim', label: 'Trim Spaces', minColumns: 1, type: 'string' },
    { value: 'length', label: 'Text Length', minColumns: 1, type: 'string' },
    { value: 'year', label: 'Extract Year', minColumns: 1, type: 'date' },
    { value: 'month', label: 'Extract Month', minColumns: 1, type: 'date' },
    { value: 'day', label: 'Extract Day', minColumns: 1, type: 'date' },
    { value: 'dayofweek', label: 'Day of Week', minColumns: 1, type: 'date' },
  ];

  const addField = () => {
    const newField: CalculatedFieldDefinition = {
      id: `calc_${Date.now()}`,
      name: `Calculated Field ${calculatedFields.length + 1}`,
      operation: 'add',
      sourceColumns: [],
      format: 'number',
    };
    onChange([...calculatedFields, newField]);
  };

  const updateField = (id: string, updates: Partial<CalculatedFieldDefinition>) => {
    onChange(
      calculatedFields.map(field =>
        field.id === id ? { ...field, ...updates } : field
      )
    );
  };

  const removeField = (id: string) => {
    onChange(calculatedFields.filter(field => field.id !== id));
  };

  const getOperationInfo = (operation: CalculatedFieldOperation) => {
    return operations.find(op => op.value === operation);
  };

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-800">Calculated Fields</h3>
          <span className="text-sm text-gray-500">
            ({calculatedFields.length} field{calculatedFields.length !== 1 ? 's' : ''})
          </span>
        </div>
        <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 space-y-4">
          {calculatedFields.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calculator className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No calculated fields yet</p>
              <p className="text-sm mt-1">Create derived columns from your data</p>
            </div>
          ) : (
            <div className="space-y-3">
              {calculatedFields.map(field => {
                const opInfo = getOperationInfo(field.operation);
                return (
                  <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-12 gap-3 items-start">
                      {/* Field Name */}
                      <div className="col-span-3">
                        <label className="block text-xs text-gray-600 mb-1">Field Name</label>
                        <input
                          type="text"
                          value={field.name}
                          onChange={e => updateField(field.id, { name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="My Field"
                        />
                      </div>

                      {/* Operation */}
                      <div className="col-span-3">
                        <label className="block text-xs text-gray-600 mb-1">Operation</label>
                        <select
                          value={field.operation}
                          onChange={e =>
                            updateField(field.id, {
                              operation: e.target.value as CalculatedFieldOperation,
                              sourceColumns: [],
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          {operations.map(op => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Source Columns */}
                      <div className="col-span-5">
                        <label className="block text-xs text-gray-600 mb-1">
                          Source Column{opInfo && opInfo.minColumns > 1 ? 's' : ''}
                        </label>
                        <div className="space-y-2">
                          {opInfo && opInfo.minColumns === 1 ? (
                            <select
                              value={field.sourceColumns[0] || ''}
                              onChange={e =>
                                updateField(field.id, { sourceColumns: [e.target.value] })
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            >
                              <option value="">Select column...</option>
                              {columns.map(col => (
                                <option key={col} value={col}>
                                  {col}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <>
                              <select
                                value={field.sourceColumns[0] || ''}
                                onChange={e => {
                                  const newCols = [...field.sourceColumns];
                                  newCols[0] = e.target.value;
                                  updateField(field.id, { sourceColumns: newCols });
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              >
                                <option value="">Column 1...</option>
                                {columns.map(col => (
                                  <option key={col} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={field.sourceColumns[1] || ''}
                                onChange={e => {
                                  const newCols = [...field.sourceColumns];
                                  newCols[1] = e.target.value;
                                  updateField(field.id, { sourceColumns: newCols });
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              >
                                <option value="">Column 2...</option>
                                {columns.map(col => (
                                  <option key={col} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Delete Button */}
                      <div className="col-span-1 pt-6">
                        <button
                          onClick={() => removeField(field.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove field"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Format */}
                    <div className="mt-3">
                      <label className="block text-xs text-gray-600 mb-1">Output Format</label>
                      <select
                        value={field.format}
                        onChange={e =>
                          updateField(field.id, {
                            format: e.target.value as CalculatedFieldDefinition['format'],
                          })
                        }
                        className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="number">Number</option>
                        <option value="currency">Currency</option>
                        <option value="percentage">Percentage</option>
                        <option value="text">Text</option>
                        <option value="date">Date</option>
                      </select>
                    </div>

                    {/* Preview Formula */}
                    <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-700 font-mono">
                      {field.name} = {field.operation}(
                      {field.sourceColumns.join(', ') || '...'})
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={addField}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Calculated Field
          </button>
        </div>
      )}
    </div>
  );
};

// Utility function to apply calculated fields to data
export const applyCalculatedFields = (
  data: any[],
  fields: CalculatedFieldDefinition[]
): any[] => {
  if (!data || data.length === 0 || fields.length === 0) {
    return data;
  }

  return data.map(row => {
    const newRow = { ...row };

    fields.forEach(field => {
      const { operation, sourceColumns } = field;
      const values = sourceColumns.map(col => row[col]);

      try {
        let result: any;

        switch (operation) {
          case 'add':
            result = values.reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
            break;
          case 'subtract':
            result = values.length >= 2 ? parseFloat(values[0]) - parseFloat(values[1]) : 0;
            break;
          case 'multiply':
            result = values.reduce((prod, val) => prod * (parseFloat(val) || 1), 1);
            break;
          case 'divide':
            result =
              values.length >= 2 && parseFloat(values[1]) !== 0
                ? parseFloat(values[0]) / parseFloat(values[1])
                : 0;
            break;
          case 'percentage':
            result =
              values.length >= 2 && parseFloat(values[1]) !== 0
                ? (parseFloat(values[0]) / parseFloat(values[1])) * 100
                : 0;
            break;
          case 'concat':
            result = values.map(v => String(v || '')).join(' ');
            break;
          case 'uppercase':
            result = String(values[0] || '').toUpperCase();
            break;
          case 'lowercase':
            result = String(values[0] || '').toLowerCase();
            break;
          case 'trim':
            result = String(values[0] || '').trim();
            break;
          case 'length':
            result = String(values[0] || '').length;
            break;
          case 'year':
            result = new Date(values[0]).getFullYear();
            break;
          case 'month':
            result = new Date(values[0]).getMonth() + 1;
            break;
          case 'day':
            result = new Date(values[0]).getDate();
            break;
          case 'dayofweek':
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            result = days[new Date(values[0]).getDay()];
            break;
          default:
            result = null;
        }

        // Apply formatting
        if (field.format === 'currency' && typeof result === 'number') {
          result = result.toFixed(2);
        } else if (field.format === 'percentage' && typeof result === 'number') {
          result = result.toFixed(2) + '%';
        }

        newRow[field.name] = result;
      } catch (error) {
        newRow[field.name] = null;
      }
    });

    return newRow;
  });
};
