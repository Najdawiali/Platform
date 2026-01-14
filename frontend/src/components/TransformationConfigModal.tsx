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
  transformationConfig?: any;
}

interface TransformationConfigModalProps {
  isOpen: boolean;
  transformationType: string;
  transformationCategory: string;
  sourceNode: TableNode | null;
  incomingNodes?: TableNode[];
  onSave: (config: any) => void;
  onCancel: () => void;
}

export const TransformationConfigModal: React.FC<TransformationConfigModalProps> = ({
  isOpen,
  transformationCategory,
  sourceNode,
  incomingNodes = [],
  onSave,
  onCancel,
}) => {
  // State for managing the pipeline of operations
  const [pipeline, setPipeline] = useState<any[]>([]);
  // -1 means showing the list of operations, >= 0 means editing a specific step
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  // Top-level selected columns for the entire filter pipeline
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  // State for Join Configuration
  const [joinConfig, setJoinConfig] = useState<{
    joinType: string;
    leftTableId: string;
    rightTableId: string;
    conditions: { leftCol: string; rightCol: string }[];
    selectedColumns?: string[];
  }>({
    joinType: 'inner',
    leftTableId: '',
    rightTableId: '',
    conditions: [{ leftCol: '', rightCol: '' }],
    selectedColumns: []
  });

  const isJoinMode = transformationCategory === 'joins' || transformationCategory === 'join';

  // Initialize pipeline state
  React.useEffect(() => {
    if (isOpen) {
      if (isJoinMode) {
        // Init Join State
        if (sourceNode?.transformationConfig?.joinType) {
          setJoinConfig(sourceNode.transformationConfig);
        } else {
          // Default init: Pick first two available nodes if not configured
          if (incomingNodes && incomingNodes.length >= 2) {
            setJoinConfig(prev => ({
              ...prev,
              leftTableId: incomingNodes[0].id,
              rightTableId: incomingNodes[1].id
            }));
          }
        }
      } else {
        // Init Pipeline State
        if (sourceNode?.transformationConfig?.pipeline) {
          setPipeline([...sourceNode.transformationConfig.pipeline]);
        } else if (sourceNode?.transformationConfig?.operation) {
          // Legacy: Convert single operation config to pipeline step
          setPipeline([{ ...sourceNode.transformationConfig, id: Date.now() + Math.random() }]);
        } else {
          setPipeline([]);
        }
        setEditingIndex(-1); // Always start at the list view
        setSelectedColumns(sourceNode?.transformationConfig?.selectedColumns || []);
      }
    }
  }, [isOpen, sourceNode, isJoinMode, incomingNodes]);

  const handleJoinSave = () => {
    onSave({
      operation: 'Join',
      ...joinConfig,
      pipeline: []
    });
  };

  // Helper to update a specific step in the pipeline
  const updateStep = (index: number, newAttrs: any) => {
    const newPipeline = [...pipeline];
    newPipeline[index] = { ...newPipeline[index], ...newAttrs };
    setPipeline(newPipeline);
  };

  const removeStep = (index: number) => {
    setPipeline(pipeline.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(-1);
    } else if (editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  };

  const addStep = (opType: string) => {
    // Check if operation of this type already exists
    const existingIndex = pipeline.findIndex(step => step.operation === opType);

    if (existingIndex >= 0) {
      // If found, navigate to it
      setEditingIndex(existingIndex);

      // Special logic for filters & column transforms: add a new empty item automatically
      if (opType === 'Filter by condition') {
        const existingStep = pipeline[existingIndex];
        const newConditions = [...(existingStep.conditions || []), { column: '', operator: '=', value: '' }];
        updateStep(existingIndex, { conditions: newConditions });
      } else if (opType === 'Type & Format') {
        const existingStep = pipeline[existingIndex];
        const newTransformations = [...(existingStep.transformations || []), {
          id: Date.now() + Math.random(),
          column: '',
          operator: '',
          castTo: 'string',
          format: '',
          caseType: 'upper',
          find: '',
          replaceWith: '',
          concatColumns: [],
          separator: ''
        }];
        updateStep(existingIndex, { transformations: newTransformations });
      } else if (opType === 'Aggregate') {
        const existingStep = pipeline[existingIndex];
        const newAggregations = [...(existingStep.aggregations || []), {
          id: Date.now() + Math.random(),
          column: '',
          operator: 'Count',
          alias: ''
        }];
        updateStep(existingIndex, { aggregations: newAggregations });
      }
      return;
    }

    // Default configs for different types
    let initialStepConfig: any = {
      id: Date.now() + Math.random(),
      operation: opType
    };

    if (opType === 'Filter by condition') {
      initialStepConfig = {
        ...initialStepConfig,
        logic: 'AND',
        conditions: [{ column: '', operator: '=', value: '' }]
      };
    } else if (opType === 'Keep top/bottom N rows') {
      initialStepConfig = {
        ...initialStepConfig,
        type: 'top',
        n: 10,
        orderColumn: ''
      };
    } else if (['Remove nulls', 'Remove duplicates', 'Select specific columns', 'Trim whitespace'].includes(opType)) {
      initialStepConfig = {
        ...initialStepConfig,
        columns: []
      };
    } else if (opType === 'Group by columns') {
      initialStepConfig = {
        ...initialStepConfig,
        groupBy: []
      };
    } else if (['Sum', 'Count', 'Average', 'Min/Max', 'Count distinct'].includes(opType)) {
      initialStepConfig = {
        ...initialStepConfig,
        column: '',
        aggregation: opType.toLowerCase().replace(' ', '')
      };
    } else if (['Inner Join', 'Left Join', 'Right Join', 'Full Outer Join'].includes(opType)) {
      initialStepConfig = {
        ...initialStepConfig,
        joinType: opType,
        leftKey: '',
        rightKey: ''
      };
    } else if (opType === 'Union') {
      initialStepConfig = {
        ...initialStepConfig,
        removeDuplicates: 'true'
      };
    } else if (opType === 'Extract year/month/day') {
      initialStepConfig = {
        ...initialStepConfig,
        column: '',
        components: []
      };
    } else if (opType === 'Date difference') {
      initialStepConfig = {
        ...initialStepConfig,
        startDate: '',
        endDate: '',
        unit: 'days'
      };
    } else if (opType === 'Split columns') {
      initialStepConfig = {
        ...initialStepConfig,
        column: '',
        delimiter: ',',
        numColumns: 2
      };
    } else if (opType === 'Upper/lower case') {
      initialStepConfig = {
        ...initialStepConfig,
        column: '',
        caseType: 'upper'
      };
    } else if (opType === 'Pivot (rows to columns)') {
      initialStepConfig = {
        ...initialStepConfig,
        rowColumn: '',
        pivotColumn: '',
        valueColumn: '',
        aggFunc: 'sum'
      };
    } else if (opType === 'Unpivot (columns to rows)') {
      initialStepConfig = {
        ...initialStepConfig,
        idColumns: [],
        varName: 'variable',
        valueName: 'value'
      };
    } else if (opType === 'Type & Format') {
      initialStepConfig = {
        ...initialStepConfig,
        transformations: [{
          id: Date.now() + Math.random(),
          column: '',
          operator: '',
          castTo: 'string',
          format: '',
          caseType: 'upper',
          find: '',
          replaceWith: '',
          concatColumns: [],
          separator: ''
        }]
      };
    } else if (opType === 'Aggregate') {
      initialStepConfig = {
        ...initialStepConfig,
        groupBy: [],
        aggregations: [{
          id: Date.now() + Math.random(),
          column: '',
          operator: 'Count',
          alias: ''
        }],
        having: ''
      };
    }

    const newPipeline = [...pipeline, initialStepConfig];
    setPipeline(newPipeline);
    setEditingIndex(newPipeline.length - 1);
  };

  const sourceColumns = sourceNode?.columns || [];

  // Render configuration for a single step based on its operation type
  const renderStepConfig = (step: any, index: number) => {
    const { operation } = step;

    // --- FILTER BY CONDITION ---
    if (operation === 'Filter by condition') {
      const conditions = step.conditions || [{ column: '', operator: '=', value: '' }];

      const handleConditionChange = (cIndex: number, field: string, value: string) => {
        const newConditions = [...conditions];
        newConditions[cIndex] = { ...newConditions[cIndex], [field]: value };
        updateStep(index, { conditions: newConditions });
      };

      const addCondition = () => {
        updateStep(index, { conditions: [...conditions, { column: '', operator: '=', value: '' }] });
      };

      const removeCondition = (cIndex: number) => {
        updateStep(index, { conditions: conditions.filter((_: any, i: number) => i !== cIndex) });
      };

      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conditions</label>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => updateStep(index, { logic: 'AND' })}
                className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${step.logic !== 'OR' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                AND
              </button>
              <button
                onClick={() => updateStep(index, { logic: 'OR' })}
                className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${step.logic === 'OR' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                OR
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {conditions.map((cond: any, cIndex: number) => (
              <div key={cIndex} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <select
                      value={cond.column || ''}
                      onChange={(e) => handleConditionChange(cIndex, 'column', e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm focus:border-blue-500 outline-none"
                    >
                      <option value="">Col</option>
                      {sourceColumns.map((col) => (
                        <option key={col.name} value={col.name}>{col.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <select
                      value={cond.operator || '='}
                      onChange={(e) => handleConditionChange(cIndex, 'operator', e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm focus:border-blue-500 outline-none"
                    >
                      <option value="=">=</option>
                      <option value="!=">!=</option>
                      <option value=">">{'>'}</option>
                      <option value="<">{'<'}</option>
                      <option value=">=">{'>='}</option>
                      <option value="<=">{'<='}</option>
                      <option value="CONTAINS">contains</option>
                      <option value="STARTS WITH">starts</option>
                      <option value="ENDS WITH">ends</option>
                      <option value="IN">in</option>
                      <option value="NOT IN">not in</option>
                    </select>
                  </div>
                  <div className="col-span-4">
                    <input
                      type="text"
                      value={cond.value || ''}
                      onChange={(e) => handleConditionChange(cIndex, 'value', e.target.value)}
                      placeholder="Val"
                      className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
                {conditions.length > 1 && (
                  <button onClick={() => removeCondition(cIndex)} className="text-slate-400 hover:text-red-500 px-1">×</button>
                )}
              </div>
            ))}
            <button onClick={addCondition} className="text-xs text-blue-600 hover:underline font-medium">+ Add Condition</button>
          </div>
        </div>
      );
    }

    // --- REMOVE NULLS ---
    if (operation === 'Remove nulls') {
      return (
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Check Columns for Nulls</label>
          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border rounded bg-slate-50">
            {sourceColumns.map((col) => (
              <div key={col.name} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={step.columns?.includes(col.name) || false}
                  onChange={(e) => {
                    const cols = step.columns || [];
                    updateStep(index, { columns: e.target.checked ? [...cols, col.name] : cols.filter((c: string) => c !== col.name) });
                  }}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label className="text-sm truncate" title={col.name}>{col.name}</label>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // --- REMOVE DUPLICATES ---
    if (operation === 'Remove duplicates') {
      return (
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unique Constraints</label>
          <p className="text-xs text-slate-400 mb-1">Select columns to enforce uniqueness. Leave empty to check entire row.</p>
          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border rounded bg-slate-50">
            {sourceColumns.map((col) => (
              <div key={col.name} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={step.columns?.includes(col.name) || false}
                  onChange={(e) => {
                    const cols = step.columns || [];
                    updateStep(index, { columns: e.target.checked ? [...cols, col.name] : cols.filter((c: string) => c !== col.name) });
                  }}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label className="text-sm truncate" title={col.name}>{col.name}</label>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // --- KEEP TOP/BOTTOM N ---
    if (operation === 'Keep top/bottom N rows') {
      return (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Keep</label>
            <select
              value={step.type || 'top'}
              onChange={(e) => updateStep(index, { type: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Count</label>
            <input
              type="number"
              value={step.n || 10}
              onChange={(e) => updateStep(index, { n: parseInt(e.target.value) })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Order By</label>
            <select
              value={step.orderColumn || ''}
              onChange={(e) => updateStep(index, { orderColumn: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="">Col</option>
              {sourceColumns.map((col) => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    // --- SELECT SPECIFIC COLUMNS ---
    if (operation === 'Select specific columns') {
      return (
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Select Columns to Keep
          </label>
          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border rounded bg-slate-50">
            {sourceColumns.map((col) => (
              <div key={col.name} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={step.columns?.includes(col.name) || false}
                  onChange={(e) => {
                    const cols = step.columns || [];
                    updateStep(index, { columns: e.target.checked ? [...cols, col.name] : cols.filter((c: string) => c !== col.name) });
                  }}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label className="text-sm truncate" title={col.name}>{col.name}</label>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // --- REORDER COLUMNS ---
    if (operation === 'Reorder columns') {
      return (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Drag and drop to reorder columns (coming soon)</p>
        </div>
      );
    }

    // --- GROUP BY COLUMNS ---
    if (operation === 'Group by columns') {
      return (
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Group By Columns
          </label>
          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border rounded bg-slate-50">
            {sourceColumns.map((col) => (
              <div key={col.name} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={step.groupBy?.includes(col.name) || false}
                  onChange={(e) => {
                    const groupBy = step.groupBy || [];
                    updateStep(index, { groupBy: e.target.checked ? [...groupBy, col.name] : groupBy.filter((c: string) => c !== col.name) });
                  }}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label className="text-sm truncate" title={col.name}>{col.name}</label>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // --- AGGREGATION OPERATIONS (SUM, COUNT, AVG, MIN/MAX, COUNT DISTINCT) ---
    if (['Sum', 'Count', 'Average', 'Min/Max', 'Count distinct'].includes(operation)) {
      return (
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Select Column to {operation}
          </label>
          <select
            value={step.column || ''}
            onChange={(e) => updateStep(index, { column: e.target.value, aggregation: operation.toLowerCase().replace(' ', '') })}
            className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
          >
            <option value="">-- Select Column --</option>
            {sourceColumns.map((col) => (
              <option key={col.name} value={col.name}>{col.name}</option>
            ))}
          </select>
        </div>
      );
    }

    // --- JOIN OPERATIONS ---
    if (['Inner Join', 'Left Join', 'Right Join', 'Full Outer Join'].includes(operation)) {
      return (
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-xs text-amber-800">
              <strong>Note:</strong> Drag another table to the canvas and connect it to this join transformation to specify the second table.
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Join Type
            </label>
            <input
              type="text"
              value={operation}
              disabled
              className="w-full px-2 py-1.5 rounded border border-slate-200 bg-slate-100 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Left Table Key Column
            </label>
            <select
              value={step.leftKey || ''}
              onChange={(e) => updateStep(index, { leftKey: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="">-- Select Column --</option>
              {sourceColumns.map((col) => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Right Table Key Column
            </label>
            <input
              type="text"
              value={step.rightKey || ''}
              onChange={(e) => updateStep(index, { rightKey: e.target.value })}
              placeholder="Column from second table"
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            />
          </div>
        </div>
      );
    }

    // --- UNION OPERATION ---
    if (operation === 'Union') {
      return (
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-xs text-amber-800">
              <strong>Note:</strong> Union combines rows from multiple tables with the same column structure.
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Remove Duplicates
            </label>
            <select
              value={step.removeDuplicates || 'true'}
              onChange={(e) => updateStep(index, { removeDuplicates: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="true">Yes (UNION)</option>
              <option value="false">No (UNION ALL)</option>
            </select>
          </div>
        </div>
      );
    }

    // --- EXTRACT DATE COMPONENTS ---
    if (operation === 'Extract year/month/day') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Select Date Column
            </label>
            <select
              value={step.column || ''}
              onChange={(e) => updateStep(index, { column: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="">-- Select Column --</option>
              {sourceColumns.map((col) => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Extract Components
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border rounded bg-slate-50">
              {['Year', 'Month', 'Day', 'Hour', 'Minute', 'Day of Week'].map((component) => (
                <div key={component} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={step.components?.includes(component) || false}
                    onChange={(e) => {
                      const components = step.components || [];
                      updateStep(index, { components: e.target.checked ? [...components, component] : components.filter((c: string) => c !== component) });
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <label className="text-sm truncate" title={component}>{component}</label>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // --- DATE DIFFERENCE ---
    if (operation === 'Date difference') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Start Date Column
            </label>
            <select
              value={step.startDate || ''}
              onChange={(e) => updateStep(index, { startDate: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="">-- Select Column --</option>
              {sourceColumns.map((col) => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              End Date Column
            </label>
            <select
              value={step.endDate || ''}
              onChange={(e) => updateStep(index, { endDate: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="">-- Select Column --</option>
              {sourceColumns.map((col) => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Unit
            </label>
            <select
              value={step.unit || 'days'}
              onChange={(e) => updateStep(index, { unit: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
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

    // --- SPLIT COLUMNS ---
    if (operation === 'Split columns') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Select Column to Split
            </label>
            <select
              value={step.column || ''}
              onChange={(e) => updateStep(index, { column: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="">-- Select Column --</option>
              {sourceColumns.map((col) => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Delimiter
            </label>
            <input
              type="text"
              value={step.delimiter || ','}
              onChange={(e) => updateStep(index, { delimiter: e.target.value })}
              placeholder="e.g., , or ; or |"
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Number of New Columns
            </label>
            <input
              type="number"
              value={step.numColumns || 2}
              onChange={(e) => updateStep(index, { numColumns: parseInt(e.target.value) })}
              min="2"
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            />
          </div>
        </div>
      );
    }

    // --- TRIM WHITESPACE ---
    if (operation === 'Trim whitespace') {
      return (
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Select Columns to Trim
          </label>
          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border rounded bg-slate-50">
            {sourceColumns.map((col) => (
              <div key={col.name} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={step.columns?.includes(col.name) || false}
                  onChange={(e) => {
                    const cols = step.columns || [];
                    updateStep(index, { columns: e.target.checked ? [...cols, col.name] : cols.filter((c: string) => c !== col.name) });
                  }}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label className="text-sm truncate" title={col.name}>{col.name}</label>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // --- UPPER/LOWER CASE ---
    if (operation === 'Upper/lower case') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Select Column
            </label>
            <select
              value={step.column || ''}
              onChange={(e) => updateStep(index, { column: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="">-- Select Column --</option>
              {sourceColumns.map((col) => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Convert To
            </label>
            <select
              value={step.caseType || 'upper'}
              onChange={(e) => updateStep(index, { caseType: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="upper">UPPERCASE</option>
              <option value="lower">lowercase</option>
              <option value="title">Title Case</option>
            </select>
          </div>
        </div>
      );
    }

    // --- PIVOT ---
    if (operation === 'Pivot (rows to columns)') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Row Column (will become row labels)
            </label>
            <select
              value={step.rowColumn || ''}
              onChange={(e) => updateStep(index, { rowColumn: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="">-- Select Column --</option>
              {sourceColumns.map((col) => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Column to Pivot (will become column headers)
            </label>
            <select
              value={step.pivotColumn || ''}
              onChange={(e) => updateStep(index, { pivotColumn: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="">-- Select Column --</option>
              {sourceColumns.map((col) => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Value Column (data to populate cells)
            </label>
            <select
              value={step.valueColumn || ''}
              onChange={(e) => updateStep(index, { valueColumn: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            >
              <option value="">-- Select Column --</option>
              {sourceColumns.map((col) => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Aggregation Function
            </label>
            <select
              value={step.aggFunc || 'sum'}
              onChange={(e) => updateStep(index, { aggFunc: e.target.value })}
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
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
    }

    // --- UNPIVOT ---
    if (operation === 'Unpivot (columns to rows)') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              ID Columns (columns to keep as-is)
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border rounded bg-slate-50">
              {sourceColumns.map((col) => (
                <div key={col.name} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={step.idColumns?.includes(col.name) || false}
                    onChange={(e) => {
                      const idColumns = step.idColumns || [];
                      updateStep(index, { idColumns: e.target.checked ? [...idColumns, col.name] : idColumns.filter((c: string) => c !== col.name) });
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <label className="text-sm truncate" title={col.name}>{col.name}</label>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              New Column Name for Variable Names
            </label>
            <input
              type="text"
              value={step.varName || 'variable'}
              onChange={(e) => updateStep(index, { varName: e.target.value })}
              placeholder="e.g., Category, Metric"
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              New Column Name for Values
            </label>
            <input
              type="text"
              value={step.valueName || 'value'}
              onChange={(e) => updateStep(index, { valueName: e.target.value })}
              placeholder="e.g., Amount, Count"
              className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
            />
          </div>
        </div>
      );
    }

    // --- TYPE & FORMAT ---
    if (operation === 'Type & Format') {
      const transformations = step.transformations || [];

      const updateItem = (iIdx: number, updates: any) => {
        const newItems = [...transformations];
        newItems[iIdx] = { ...newItems[iIdx], ...updates };
        updateStep(index, { transformations: newItems });
      };

      const removeItem = (iIdx: number) => {
        const newItems = transformations.filter((_: any, i: number) => i !== iIdx);
        updateStep(index, { transformations: newItems });
      };

      const addItem = () => {
        updateStep(index, {
          transformations: [...transformations, {
            id: Date.now() + Math.random(),
            column: '',
            operator: '',
            castTo: 'string',
            format: '',
            caseType: 'upper',
            find: '',
            replaceWith: '',
            concatColumns: [],
            separator: ''
          }]
        });
      };

      return (
        <div className="space-y-8">
          {transformations.map((item: any, iIdx: number) => (
            <div key={item.id} className="relative p-6 bg-white rounded-2xl border-2 border-slate-100 shadow-sm hover:shadow-md transition-all space-y-4">
              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  onClick={() => removeItem(iIdx)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                  title="Remove this transformation"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Target Column
                  </label>
                  <select
                    value={item.column || ''}
                    onChange={(e) => updateItem(iIdx, { column: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-semibold focus:border-blue-500 focus:bg-white outline-none transition-all"
                  >
                    <option value="">-- Select Column --</option>
                    {sourceColumns.map((col) => (
                      <option key={col.name} value={col.name}>{col.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Operator
                  </label>
                  <select
                    value={item.operator || ''}
                    onChange={(e) => updateItem(iIdx, { operator: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-semibold focus:border-blue-500 focus:bg-white outline-none transition-all"
                  >
                    <option value="">-- Select Operator --</option>
                    {['Cast type', 'Format string', 'Trim', 'Uppercase / Lowercase', 'Replace text', 'Concatenate'].map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
              </div>

              {item.operator && (
                <div className="p-5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-4">
                  {item.operator === 'Cast type' && (
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold text-blue-600 uppercase">Cast to:</span>
                      <div className="flex gap-2 flex-1">
                        {['string', 'number', 'boolean'].map((t) => (
                          <button
                            key={t}
                            onClick={() => updateItem(iIdx, { castTo: t })}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${item.castTo === t
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                              }`}
                          >
                            {t.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.operator === 'Format string' && (
                    <div>
                      <label className="block text-xs font-bold text-blue-600 uppercase mb-2">Format Pattern</label>
                      <input
                        type="text"
                        value={item.format || ''}
                        onChange={(e) => updateItem(iIdx, { format: e.target.value })}
                        placeholder="e.g. YYYY-MM-DD, #,##0.00"
                        className="w-full px-4 py-2 rounded-lg border-2 border-slate-200 focus:border-blue-500 outline-none text-sm transition-all"
                      />
                    </div>
                  )}

                  {item.operator === 'Trim' && (
                    <div className="flex items-center gap-2 text-blue-700 font-medium text-sm">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      Removes leading and trailing whitespace from <span className="underline decoration-blue-300 decoration-2">{item.column || 'selected column'}</span>
                    </div>
                  )}

                  {item.operator === 'Uppercase / Lowercase' && (
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold text-blue-600 uppercase">Case:</span>
                      <div className="flex gap-2 flex-1">
                        <button
                          onClick={() => updateItem(iIdx, { caseType: 'upper' })}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${item.caseType !== 'lower'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                            }`}
                        >
                          UPPERCASE
                        </button>
                        <button
                          onClick={() => updateItem(iIdx, { caseType: 'lower' })}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${item.caseType === 'lower'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                            }`}
                        >
                          lowercase
                        </button>
                      </div>
                    </div>
                  )}

                  {item.operator === 'Replace text' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-blue-600 uppercase mb-2">Find</label>
                        <input
                          type="text"
                          value={item.find || ''}
                          onChange={(e) => updateItem(iIdx, { find: e.target.value })}
                          placeholder="Search value..."
                          className="w-full px-4 py-2 rounded-lg border-2 border-slate-200 focus:border-blue-500 outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-blue-600 uppercase mb-2">Replace with</label>
                        <input
                          type="text"
                          value={item.replaceWith || ''}
                          onChange={(e) => updateItem(iIdx, { replaceWith: e.target.value })}
                          placeholder="New value..."
                          className="w-full px-4 py-2 rounded-lg border-2 border-slate-200 focus:border-blue-500 outline-none text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {item.operator === 'Concatenate' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-blue-600 uppercase mb-2 text-center">Append Following Columns</label>
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 bg-white rounded-xl border-2 border-slate-100 shadow-inner">
                          {sourceColumns.filter(c => c.name !== item.column).map(col => (
                            <div key={col.name} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg transition-colors">
                              <input
                                type="checkbox"
                                id={`concat-${item.id}-${col.name}`}
                                checked={item.concatColumns?.includes(col.name) || false}
                                onChange={(e) => {
                                  const current = item.concatColumns || [];
                                  updateItem(iIdx, {
                                    concatColumns: e.target.checked
                                      ? [...current, col.name]
                                      : current.filter((c: string) => c !== col.name)
                                  });
                                }}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                              />
                              <label htmlFor={`concat-${item.id}-${col.name}`} className="text-xs font-medium text-slate-600 truncate cursor-pointer flex-1">{col.name}</label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-bold text-blue-600 uppercase whitespace-nowrap">Separator:</label>
                        <input
                          type="text"
                          value={item.separator || ''}
                          onChange={(e) => updateItem(iIdx, { separator: e.target.value })}
                          placeholder="e.g. , or space"
                          className="flex-1 px-4 py-2 rounded-lg border-2 border-slate-200 focus:border-blue-500 outline-none text-sm font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <button
            onClick={addItem}
            className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold text-sm hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition-all flex items-center justify-center gap-2 group"
          >
            <span className="text-lg group-hover:scale-125 transition-transform">+</span>
            Add Another Transformation Item
          </button>
        </div>
      );
    }

    // --- AGGREGATE ---
    if (operation === 'Aggregate') {
      const groupBy = step.groupBy || [];
      const aggregations = step.aggregations || [];

      const toggleGroupBy = (col: string) => {
        const newGroupBy = groupBy.includes(col)
          ? groupBy.filter((c: string) => c !== col)
          : [...groupBy, col];
        updateStep(index, { groupBy: newGroupBy });
      };

      const updateAgg = (aIdx: number, updates: any) => {
        const newAggs = [...aggregations];
        newAggs[aIdx] = { ...newAggs[aIdx], ...updates };
        updateStep(index, { aggregations: newAggs });
      };

      const removeAgg = (aIdx: number) => {
        const newAggs = aggregations.filter((_: any, i: number) => i !== aIdx);
        updateStep(index, { aggregations: newAggs });
      };

      const addAgg = () => {
        updateStep(index, {
          aggregations: [...aggregations, {
            id: Date.now() + Math.random(),
            column: '',
            operator: 'Count',
            alias: ''
          }]
        });
      };

      const aggregateOptions = [
        'Count', 'Sum', 'Average', 'Min', 'Max',
        'Count all rows', 'Count non-null values', 'Count distinct values'
      ];

      return (
        <div className="space-y-8">
          {/* Group By Section */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="text-blue-500">📂</span> Group By Columns
            </label>
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-2">
              {sourceColumns.map(col => (
                <div
                  key={col.name}
                  onClick={() => toggleGroupBy(col.name)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${groupBy.includes(col.name)
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                >
                  <div className={`w-3 h-3 rounded-full border ${groupBy.includes(col.name) ? 'bg-white border-white' : 'border-slate-300'}`} />
                  <span className="text-xs font-bold truncate">{col.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Aggregations Section */}
          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className="text-blue-500">🔢</span> Aggregations
            </label>
            {aggregations.map((agg: any, aIdx: number) => (
              <div key={agg.id} className="p-5 bg-white rounded-2xl border-2 border-slate-100 shadow-sm relative group hover:border-blue-200 transition-all">
                <button
                  type="button"
                  onClick={() => removeAgg(aIdx)}
                  className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-500 shadow-sm flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 font-bold z-10"
                >
                  ×
                </button>
                <div className="grid grid-cols-12 gap-4 items-end">
                  <div className="col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Column</label>
                    <select
                      value={agg.column || ''}
                      onChange={(e) => updateAgg(aIdx, { column: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none"
                    >
                      <option value="">-- Choose --</option>
                      {sourceColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Operator</label>
                    <select
                      value={agg.operator || 'Count'}
                      onChange={(e) => updateAgg(aIdx, { operator: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none"
                    >
                      {aggregateOptions.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Alias</label>
                    <input
                      type="text"
                      value={agg.alias || ''}
                      onChange={(e) => updateAgg(aIdx, { alias: e.target.value })}
                      placeholder="e.g. total_sales"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addAgg}
              className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold text-sm hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition-all flex items-center justify-center gap-2 group"
            >
              <span className="text-lg group-hover:scale-125 transition-transform">+</span> Add Aggregation
            </button>
          </div>

          {/* Having Section */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className="text-blue-500">🎯</span> Having Condition (Optional)
            </label>
            <input
              type="text"
              value={step.having || ''}
              onChange={(e) => updateStep(index, { having: e.target.value })}
              placeholder="e.g. sum(sales) > 1000"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:border-blue-500 outline-none shadow-inner bg-white"
            />
            <p className="text-[10px] text-slate-400 mt-2 font-medium">Use aggregate functions (e.g. COUNT(*) {'>'} 5)</p>
          </div>
        </div>
      );
    }

    return <p className="text-sm text-slate-400 italic">Configuration for {operation} coming soon...</p>;
  };

  if (!isOpen) return null;

  // --- JOIN UI ---
  if (isJoinMode) {
    const insufficientInputs = (incomingNodes.length) < 2;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl w-[800px] max-h-[90vh] flex flex-col border border-slate-200">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div><h2 className="text-xl font-bold text-slate-800">Configure Join</h2></div>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
          </div>
          <div className="p-8 flex-1 overflow-y-auto">
            {insufficientInputs ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500">
                <div className="text-4xl mb-4">🔗</div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Insufficient Inputs</h3>
                <p>Please connect at least two tables to this node on the canvas.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Join Type</label>
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-lg inline-flex flex-wrap">
                    {['inner', 'left', 'right', 'outer', 'union', 'union all'].map(type => (
                      <button key={type} onClick={() => setJoinConfig(prev => ({ ...prev, joinType: type }))} className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-all ${joinConfig.joinType === type ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{type}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8 items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Left Table</label>
                    <select value={joinConfig.leftTableId} onChange={e => setJoinConfig(prev => ({ ...prev, leftTableId: e.target.value }))} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm">
                      {incomingNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Right Table</label>
                    <select value={joinConfig.rightTableId} onChange={e => setJoinConfig(prev => ({ ...prev, rightTableId: e.target.value }))} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm">
                      {incomingNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                  </div>
                </div>
                {!['union', 'union all'].includes(joinConfig.joinType) && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-semibold text-slate-700">Join Conditions</label>
                      <button onClick={() => setJoinConfig(prev => ({ ...prev, conditions: [...prev.conditions, { leftCol: '', rightCol: '' }] }))} className="text-xs text-blue-600 font-medium hover:underline">+ Add Condition</button>
                    </div>
                    <div className="space-y-2">
                      {joinConfig.conditions.map((cond, idx) => {
                        const leftCols = incomingNodes.find(n => n.id === joinConfig.leftTableId)?.columns || [];
                        const rightCols = incomingNodes.find(n => n.id === joinConfig.rightTableId)?.columns || [];
                        return (
                          <div key={idx} className="flex items-center gap-3">
                            <select value={cond.leftCol} onChange={e => { const n = [...joinConfig.conditions]; n[idx].leftCol = e.target.value; setJoinConfig(prev => ({ ...prev, conditions: n })); }} className="flex-1 p-2 bg-white border border-slate-300 rounded-lg text-sm"><option value="">Col</option>{leftCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
                            <span className="text-slate-400">=</span>
                            <select value={cond.rightCol} onChange={e => { const n = [...joinConfig.conditions]; n[idx].rightCol = e.target.value; setJoinConfig(prev => ({ ...prev, conditions: n })); }} className="flex-1 p-2 bg-white border border-slate-300 rounded-lg text-sm"><option value="">Col</option>{rightCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
                            {idx > 0 && <button onClick={() => setJoinConfig(prev => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600">×</button>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Column Selection */}
                <div className="border-t border-slate-200 pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-semibold text-slate-700">Select Columns</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="selectAllCols"
                        checked={!joinConfig.selectedColumns || joinConfig.selectedColumns.length === 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setJoinConfig(prev => ({ ...prev, selectedColumns: [] }));
                          } else {
                            setJoinConfig(prev => ({ ...prev, selectedColumns: ['__CUSTOM__'] }));
                          }
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="selectAllCols" className="text-xs text-slate-600 font-medium cursor-pointer">Select All (*)</label>
                    </div>
                  </div>

                  {(!joinConfig.selectedColumns || joinConfig.selectedColumns.length === 0) ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                      <p className="text-sm text-blue-700">All columns from both tables will be included (SELECT *)</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 text-blue-600">
                          {incomingNodes.find(n => n.id === joinConfig.leftTableId)?.name || 'Left Table'}
                        </h4>
                        <div className="space-y-1 max-h-40 overflow-y-auto bg-slate-50 rounded p-2 border border-slate-200">
                          {(incomingNodes.find(n => n.id === joinConfig.leftTableId)?.columns || []).map(col => (
                            <div key={col.name} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={joinConfig.selectedColumns?.includes(`left.${col.name}`) || false}
                                onChange={(e) => {
                                  const selected = (joinConfig.selectedColumns || []).filter((c: string) => c !== '__CUSTOM__');
                                  const colRef = `left.${col.name}`;
                                  setJoinConfig(prev => ({
                                    ...prev,
                                    selectedColumns: e.target.checked
                                      ? [...selected, colRef]
                                      : selected.filter((c: string) => c !== colRef)
                                  }));
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                              <label className="text-xs truncate" title={col.name}>{col.name}</label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 text-blue-600">
                          {incomingNodes.find(n => n.id === joinConfig.rightTableId)?.name || 'Right Table'}
                        </h4>
                        <div className="space-y-1 max-h-40 overflow-y-auto bg-slate-50 rounded p-2 border border-slate-200">
                          {(incomingNodes.find(n => n.id === joinConfig.rightTableId)?.columns || []).map(col => (
                            <div key={col.name} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={joinConfig.selectedColumns?.includes(`right.${col.name}`) || false}
                                onChange={(e) => {
                                  const selected = (joinConfig.selectedColumns || []).filter((c: string) => c !== '__CUSTOM__');
                                  const colRef = `right.${col.name}`;
                                  setJoinConfig(prev => ({
                                    ...prev,
                                    selectedColumns: e.target.checked
                                      ? [...selected, colRef]
                                      : selected.filter((c: string) => c !== colRef)
                                  }));
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                              <label className="text-xs truncate" title={col.name}>{col.name}</label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="p-6 border-t border-slate-100 flex justify-between bg-slate-50 rounded-b-xl">
            <button onClick={onCancel} className="px-6 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
            <button onClick={handleJoinSave} disabled={insufficientInputs} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0">Save Join</button>
          </div>
        </div>
      </div>
    );
  }

  const categoryOperations: Record<string, string[]> = {
    filters: [
      'Filter by condition',
      'Remove nulls',
      'Remove duplicates',
      'Keep top/bottom N rows'
    ],
    columns: [
      'Select specific columns',
      'Reorder columns'
    ],
    summarize: [
      'Group by columns',
      'Sum',
      'Count',
      'Average',
      'Min/Max',
      'Count distinct'
    ],
    'join-combine': [
      'Inner Join',
      'Left Join',
      'Right Join',
      'Full Outer Join',
      'Union'
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
    ],
    column_transformation: [
      'Type & Format'
    ],
    aggregate: [
      'Aggregate'
    ]
  };

  const availableOps = categoryOperations[transformationCategory] || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Configure: <span className="text-blue-600 capitalize">{transformationCategory}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Data pipeline for <strong>{sourceNode?.name}</strong>
            </p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="flex-1 overflow-y-auto px-1 pr-2">

          {editingIndex >= 0 && pipeline[editingIndex] ? (
            <div className="space-y-6">
              <button
                onClick={() => setEditingIndex(-1)}
                className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors mb-4 group"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 transition-transform group-hover:-translate-x-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                Back to operations
              </button>
              <div className="bg-slate-50 rounded-lg p-6 border border-slate-200 shadow-inner">
                <div className="flex items-center gap-3 mb-6">
                  <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">{editingIndex + 1}</span>
                  <h3 className="font-bold text-lg text-slate-800">{pipeline[editingIndex].operation}</h3>
                </div>
                {renderStepConfig(pipeline[editingIndex], editingIndex)}
              </div>
            </div>
          ) : (
            <>
              {/* Pipeline Steps List */}
              <div className="mb-8">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Active Operations</p>
                {pipeline.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <p className="text-slate-400 font-medium italic">No operations added yet</p>
                    <p className="text-[11px] text-slate-400 mt-1">Select an operation below to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pipeline.map((step, idx) => (
                      <div key={step.id || idx} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex items-center justify-between p-4 hover:border-blue-300 hover:shadow transition-all group">
                        <div className="flex items-center gap-3 font-medium">
                          <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200">{idx + 1}</span>
                          <span className="text-slate-700">{step.operation}</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingIndex(idx)}
                            className="p-1.5 px-3 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => removeStep(idx)}
                            className="p-1.5 px-3 text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Output Columns Section */}
              <div className="mb-8 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Output Columns</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="selectAllPipelineCols"
                      checked={!selectedColumns || selectedColumns.length === 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedColumns([]);
                        } else {
                          setSelectedColumns(['__CUSTOM__']);
                        }
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="selectAllPipelineCols" className="text-xs text-slate-600 font-medium cursor-pointer">All Columns (*)</label>
                  </div>
                </div>

                {(!selectedColumns || selectedColumns.length === 0) ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    <p className="text-xs text-blue-700 font-medium italic">All columns from the source will be included in the final output</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto p-3 border border-slate-200 rounded-xl bg-slate-50 shadow-inner">
                    {sourceColumns.map((col) => (
                      <div key={col.name} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(col.name)}
                          onChange={(e) => {
                            const selected = selectedColumns.filter((c: string) => c !== '__CUSTOM__');
                            setSelectedColumns(e.target.checked
                              ? [...selected, col.name]
                              : selected.filter((c: string) => c !== col.name)
                            );
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <label className="text-xs font-medium text-slate-600 truncate" title={col.name}>{col.name}</label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Operation Section */}
              <div className="pt-6 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Add Operation</p>
                <div className="grid grid-cols-2 gap-3">
                  {availableOps.map(op => (
                    <button
                      key={op}
                      onClick={() => addStep(op)}
                      className="px-4 py-3.5 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 text-slate-600 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 group"
                    >
                      <span className="text-lg font-light text-slate-300 group-hover:text-blue-400 transition-colors">+</span> {op}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
          <button
            onClick={onCancel}
            className="px-6 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (editingIndex >= 0) {
                setEditingIndex(-1);
              } else {
                onSave({
                  operation: pipeline.length > 0 ? pipeline[0].operation : '',
                  pipeline: pipeline,
                  selectedColumns: selectedColumns
                });
              }
            }}
            className="px-8 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {editingIndex >= 0 ? 'Apply Pipeline' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
