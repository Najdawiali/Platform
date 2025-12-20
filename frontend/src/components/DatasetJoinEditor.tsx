import React, { useState } from 'react';
import { Link2, Plus, X } from 'lucide-react';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export interface JoinConfig {
  id: string;
  leftDatasetId: string;
  rightDatasetId: string;
  leftJoinColumn: string;
  rightJoinColumn: string;
  joinType: JoinType;
}

interface DatasetJoinEditorProps {
  datasets: Array<{ id: string; name: string; columns: string[] }>;
  joins: JoinConfig[];
  onChange: (joins: JoinConfig[]) => void;
}

export const DatasetJoinEditor: React.FC<DatasetJoinEditorProps> = ({
  datasets,
  joins,
  onChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const joinTypes: Array<{ value: JoinType; label: string; description: string }> = [
    { value: 'inner', label: 'Inner Join', description: 'Only matching rows from both datasets' },
    { value: 'left', label: 'Left Join', description: 'All rows from left, matching from right' },
    { value: 'right', label: 'Right Join', description: 'All rows from right, matching from left' },
    { value: 'full', label: 'Full Outer Join', description: 'All rows from both datasets' },
  ];

  const addJoin = () => {
    if (datasets.length < 2) {
      alert('You need at least 2 datasets to create a join');
      return;
    }

    const newJoin: JoinConfig = {
      id: `join_${Date.now()}`,
      leftDatasetId: datasets[0].id,
      rightDatasetId: datasets.length > 1 ? datasets[1].id : datasets[0].id,
      leftJoinColumn: '',
      rightJoinColumn: '',
      joinType: 'inner',
    };
    onChange([...joins, newJoin]);
  };

  const updateJoin = (id: string, updates: Partial<JoinConfig>) => {
    onChange(joins.map(join => (join.id === id ? { ...join, ...updates } : join)));
  };

  const removeJoin = (id: string) => {
    onChange(joins.filter(join => join.id !== id));
  };

  const getDatasetColumns = (datasetId: string): string[] => {
    const dataset = datasets.find(d => d.id === datasetId);
    return dataset?.columns || [];
  };

  const getDatasetName = (datasetId: string): string => {
    const dataset = datasets.find(d => d.id === datasetId);
    return dataset?.name || 'Unknown Dataset';
  };

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-800">Dataset Joins</h3>
          <span className="text-sm text-gray-500">
            ({joins.length} join{joins.length !== 1 ? 's' : ''})
          </span>
        </div>
        <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 space-y-4">
          {datasets.length < 2 ? (
            <div className="text-center py-8 text-gray-500">
              <Link2 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>Upload at least 2 datasets to enable joins</p>
            </div>
          ) : joins.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Link2 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No joins configured</p>
              <p className="text-sm mt-1">Combine data from multiple datasets</p>
            </div>
          ) : (
            <div className="space-y-4">
              {joins.map(join => {
                const leftColumns = getDatasetColumns(join.leftDatasetId);
                const rightColumns = getDatasetColumns(join.rightDatasetId);

                return (
                  <div key={join.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-800">Join Configuration</h4>
                      <button
                        onClick={() => removeJoin(join.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Remove join"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      {/* Left Dataset */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Left Dataset
                        </label>
                        <select
                          value={join.leftDatasetId}
                          onChange={e =>
                            updateJoin(join.id, {
                              leftDatasetId: e.target.value,
                              leftJoinColumn: '',
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          {datasets.map(ds => (
                            <option key={ds.id} value={ds.id}>
                              {ds.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Join Type */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Join Type
                        </label>
                        <select
                          value={join.joinType}
                          onChange={e =>
                            updateJoin(join.id, { joinType: e.target.value as JoinType })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          {joinTypes.map(jt => (
                            <option key={jt.value} value={jt.value}>
                              {jt.label} - {jt.description}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Right Dataset */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Right Dataset
                        </label>
                        <select
                          value={join.rightDatasetId}
                          onChange={e =>
                            updateJoin(join.id, {
                              rightDatasetId: e.target.value,
                              rightJoinColumn: '',
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          {datasets.map(ds => (
                            <option key={ds.id} value={ds.id}>
                              {ds.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Join Columns */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Left Join Column
                          </label>
                          <select
                            value={join.leftJoinColumn}
                            onChange={e =>
                              updateJoin(join.id, { leftJoinColumn: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          >
                            <option value="">Select column...</option>
                            {leftColumns.map(col => (
                              <option key={col} value={col}>
                                {col}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Right Join Column
                          </label>
                          <select
                            value={join.rightJoinColumn}
                            onChange={e =>
                              updateJoin(join.id, { rightJoinColumn: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          >
                            <option value="">Select column...</option>
                            {rightColumns.map(col => (
                              <option key={col} value={col}>
                                {col}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Visual representation */}
                      <div className="bg-gray-50 rounded-lg p-3 text-sm">
                        <div className="font-mono text-gray-700">
                          {getDatasetName(join.leftDatasetId)}
                          <span className="text-indigo-600 font-semibold mx-2">
                            {join.joinType.toUpperCase()}
                          </span>
                          {getDatasetName(join.rightDatasetId)}
                        </div>
                        <div className="font-mono text-gray-600 mt-1">
                          ON {join.leftJoinColumn || '?'} = {join.rightJoinColumn || '?'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {datasets.length >= 2 && (
            <button
              onClick={addJoin}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Join
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Utility function to perform joins on data
export const performJoin = (
  leftData: any[],
  rightData: any[],
  config: JoinConfig
): any[] => {
  const { leftJoinColumn, rightJoinColumn, joinType } = config;

  if (!leftData || !rightData || !leftJoinColumn || !rightJoinColumn) {
    return [];
  }

  const result: any[] = [];

  if (joinType === 'inner') {
    leftData.forEach(leftRow => {
      rightData.forEach(rightRow => {
        if (leftRow[leftJoinColumn] === rightRow[rightJoinColumn]) {
          result.push({ ...leftRow, ...rightRow });
        }
      });
    });
  } else if (joinType === 'left') {
    leftData.forEach(leftRow => {
      const matches = rightData.filter(
        rightRow => leftRow[leftJoinColumn] === rightRow[rightJoinColumn]
      );
      if (matches.length > 0) {
        matches.forEach(match => result.push({ ...leftRow, ...match }));
      } else {
        result.push({ ...leftRow });
      }
    });
  } else if (joinType === 'right') {
    rightData.forEach(rightRow => {
      const matches = leftData.filter(
        leftRow => leftRow[leftJoinColumn] === rightRow[rightJoinColumn]
      );
      if (matches.length > 0) {
        matches.forEach(match => result.push({ ...match, ...rightRow }));
      } else {
        result.push({ ...rightRow });
      }
    });
  } else if (joinType === 'full') {
    const processedRight = new Set<number>();

    leftData.forEach(leftRow => {
      let hasMatch = false;
      rightData.forEach((rightRow, idx) => {
        if (leftRow[leftJoinColumn] === rightRow[rightJoinColumn]) {
          result.push({ ...leftRow, ...rightRow });
          processedRight.add(idx);
          hasMatch = true;
        }
      });
      if (!hasMatch) {
        result.push({ ...leftRow });
      }
    });

    rightData.forEach((rightRow, idx) => {
      if (!processedRight.has(idx)) {
        result.push({ ...rightRow });
      }
    });
  }

  return result;
};
