import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export interface ColumnQualityReport {
  name: string;
  data_type: string;
  null_count: number;
  null_percentage: number;
  unique_count: number;
  duplicate_percentage: number;
  completeness_score: number;
  consistency_score?: number;
  pattern_consistency_score?: number;
  // Numeric fields
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
  outlier_count?: number;
  outlier_percentage?: number;
  negative_count?: number;
  zero_count?: number;
  // String fields
  min_length?: number;
  max_length?: number;
  avg_length?: number;
  empty_string_count?: number;
  empty_string_percentage?: number;
  whitespace_issues?: number;
  // DateTime fields
  min_date?: string;
  max_date?: string;
  date_range_days?: number;
  future_date_count?: number;
  anomalous_old_dates?: number;
}

export interface QualityReport {
  overall_score: number;
  checks_performed: string;
  row_count: number;
  column_count: number;
  columns: ColumnQualityReport[];
  issues: {
    critical: string[];
    warning: string[];
    info: string[];
  };
  summary: {
    total_cells: number;
    missing_cells: number;
    completeness_percentage: number;
    critical_issues: number;
    warnings: number;
    info_items: number;
  };
}

interface DataQualityPanelProps {
  qualityReport: QualityReport | null;
  isLoading?: boolean;
  height?: number;
}

export const DataQualityPanel: React.FC<DataQualityPanelProps> = ({
  qualityReport,
  isLoading = false,
  height = 600,
}) => {
  if (isLoading) {
    return (
      <div
        style={{ height: `${height}px` }}
        className="flex items-center justify-center text-indigo-600"
      >
        <span className="text-3xl">🔄</span> Loading quality report...
      </div>
    );
  }

  if (!qualityReport) {
    return (
      <div
        style={{ height: `${height}px` }}
        className="flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg"
      >
        <div className="text-center text-gray-500">
          <Info className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p>No quality report available</p>
          <p className="text-sm mt-1">Upload a dataset to see quality metrics</p>
        </div>
      </div>
    );
  }

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  return (
    <div className="space-y-6" style={{ maxHeight: `${height}px`, overflowY: 'auto' }}>
      {/* Overall Score */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Overall Quality Score</h3>
            <p className="text-sm text-gray-500">
              Analyzed {qualityReport.row_count.toLocaleString()} rows ×{' '}
              {qualityReport.column_count} columns
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div
              className={`text-5xl font-bold ${getScoreColor(qualityReport.overall_score)}`}
            >
              {qualityReport.overall_score}
              <span className="text-2xl">/100</span>
            </div>
            {qualityReport.overall_score >= 80 ? (
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            ) : (
              <AlertTriangle className="w-12 h-12 text-yellow-500" />
            )}
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Completeness</div>
            <div className="text-2xl font-semibold text-gray-800">
              {qualityReport.summary.completeness_percentage}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {qualityReport.summary.missing_cells.toLocaleString()} missing cells
            </div>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Critical Issues</div>
            <div className="text-2xl font-semibold text-red-600">
              {qualityReport.summary.critical_issues}
            </div>
            <div className="text-xs text-gray-500 mt-1">Require immediate attention</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Warnings</div>
            <div className="text-2xl font-semibold text-yellow-600">
              {qualityReport.summary.warnings}
            </div>
            <div className="text-xs text-gray-500 mt-1">Should be reviewed</div>
          </div>
        </div>
      </div>

      {/* Issues Section */}
      {(qualityReport.issues.critical.length > 0 ||
        qualityReport.issues.warning.length > 0) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Issues Detected</h3>

          {qualityReport.issues.critical.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span className="font-medium text-red-600">Critical Issues</span>
              </div>
              <ul className="space-y-1 ml-7">
                {qualityReport.issues.critical.map((issue, idx) => (
                  <li key={idx} className="text-sm text-gray-700">
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {qualityReport.issues.warning.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <span className="font-medium text-yellow-600">Warnings</span>
              </div>
              <ul className="space-y-1 ml-7">
                {qualityReport.issues.warning.map((issue, idx) => (
                  <li key={idx} className="text-sm text-gray-700">
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Column Details */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Column Quality Details</h3>
        <div className="space-y-4">
          {qualityReport.columns.map((col, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-gray-800">{col.name}</h4>
                  <span className="text-sm text-gray-500">{col.data_type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreBgColor(
                      col.completeness_score
                    )} ${getScoreColor(col.completeness_score)}`}
                  >
                    {col.completeness_score}% Complete
                  </div>
                  {col.consistency_score !== undefined && (
                    <div
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreBgColor(
                        col.consistency_score
                      )} ${getScoreColor(col.consistency_score)}`}
                    >
                      {col.consistency_score}% Consistent
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 text-sm">
                {/* Common Metrics */}
                <div>
                  <span className="text-gray-600">Unique Values:</span>
                  <span className="ml-2 font-medium">{col.unique_count.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-600">Missing:</span>
                  <span className="ml-2 font-medium">{col.null_percentage}%</span>
                </div>
                <div>
                  <span className="text-gray-600">Duplicates:</span>
                  <span className="ml-2 font-medium">{col.duplicate_percentage}%</span>
                </div>

                {/* Numeric Metrics */}
                {col.min !== undefined && (
                  <>
                    <div>
                      <span className="text-gray-600">Range:</span>
                      <span className="ml-2 font-medium">
                        {col.min} - {col.max}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Mean:</span>
                      <span className="ml-2 font-medium">{col.mean?.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Median:</span>
                      <span className="ml-2 font-medium">{col.median?.toFixed(2)}</span>
                    </div>
                    {col.outlier_count !== undefined && col.outlier_count > 0 && (
                      <div className="col-span-2">
                        <span className="text-yellow-600">⚠ Outliers:</span>
                        <span className="ml-2 font-medium text-yellow-600">
                          {col.outlier_count} ({col.outlier_percentage}%)
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* String Metrics */}
                {col.min_length !== undefined && (
                  <>
                    <div>
                      <span className="text-gray-600">Length Range:</span>
                      <span className="ml-2 font-medium">
                        {col.min_length} - {col.max_length}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Avg Length:</span>
                      <span className="ml-2 font-medium">{col.avg_length}</span>
                    </div>
                    {col.empty_string_count !== undefined && col.empty_string_count > 0 && (
                      <div>
                        <span className="text-yellow-600">Empty Strings:</span>
                        <span className="ml-2 font-medium text-yellow-600">
                          {col.empty_string_count}
                        </span>
                      </div>
                    )}
                    {col.whitespace_issues !== undefined && col.whitespace_issues > 0 && (
                      <div>
                        <span className="text-yellow-600">Whitespace:</span>
                        <span className="ml-2 font-medium text-yellow-600">
                          {col.whitespace_issues}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* DateTime Metrics */}
                {col.min_date !== undefined && (
                  <>
                    <div className="col-span-2">
                      <span className="text-gray-600">Date Range:</span>
                      <span className="ml-2 font-medium">
                        {new Date(col.min_date).toLocaleDateString()} -{' '}
                        {new Date(col.max_date!).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Span:</span>
                      <span className="ml-2 font-medium">{col.date_range_days} days</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
