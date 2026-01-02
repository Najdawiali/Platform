export interface User {
  id: string;
  email: string;
  full_name?: string;
  created_at: string;
}

export type DatasetStatus = 'completed' | 'processing' | 'failed' | 'ready' | 'error';

export interface Dataset {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  original_filename?: string;
  file_size?: number;
  row_count?: number;
  column_count?: number;
  status: string;
  error_message?: string;
  quality_report?: QualityReport;
  created_at: string;
  updated_at?: string;
}

export interface DatasetDetail extends Dataset {
  schema_info?: Record<string, any>;
}

export interface DatasetPreview {
  columns: string[];
  rows: Record<string, any>[];
  total_rows: number;
  preview_rows: number;
}

export interface DatasetFullData {
  columns: string[];
  data: Record<string, any>[];
  total_rows: number;
  returned_rows: number;
  is_partial: boolean;
}

export interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface QualityIssues {
  critical: string[];
  warning: string[];
  info: string[];
}

export interface QualitySummary {
  total_cells: number;
  missing_cells: number;
  completeness_percentage: number;
  critical_issues: number;
  warnings: number;
  info_items: number;
}

export interface QualityReport {
  overall_score: number;
  checks_performed: string;
  row_count: number;
  column_count: number;
  columns: Record<string, any>[];
  issues: QualityIssues;
  summary: QualitySummary;
}

export interface DatasetUploadResponse {
  success: boolean;
  datasets_created: number;
  results: Array<{
    dataset: Dataset;
    validation: ValidationResult;
    quality_report?: QualityReport;
  }>;
}

// Connection Types
export type SourceType = 'csv' | 'excel' | 'json' | 'txt' | 'md' | 'mdx' | 'pdf' | 'snowflake' | 'sqlserver' | 'mongodb' | 'postgresql' | 'mysql';

export interface Connection {
  id: string;
  user_id: string;
  name: string;
  source_type: SourceType;
  description?: string;
  is_active: string;
  test_status?: string;
  test_message?: string;
  last_tested?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface ConnectionCreate {
  name: string;
  source_type: SourceType;
  credentials: Record<string, any>;
  description?: string;
}

export interface ConnectionTestRequest {
  source_type: SourceType;
  credentials: Record<string, any>;
}

export interface ConnectionTestResponse {
  success: boolean;
  message: string;
  metadata?: Record<string, any>;
}

export interface SourceSelectionRequest {
  source_type: SourceType;
}

export interface SourceSelectionResponse {
  source_type: SourceType;
  required_fields: Array<Record<string, any>>;
  instructions: string;
}

// Auth Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

// Dashboard Types
export type ChartType = 'bar' | 'pie' | 'line' | 'table' | 'area' | 'scatter' | 'gauge' | 'kpi' | 'heatmap';

export interface DashboardChart {
  id: string;
  dashboard_id: string;
  dataset_id: string;
  chart_type: ChartType | string;
  x_column?: string;
  y_column?: string;
  title?: string;
  config?: Record<string, any>;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: string;
}

export interface Dashboard {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at?: string;
  charts: DashboardChart[];
}

export interface DashboardListItem {
  id: string;
  name: string;
  description?: string;
  chart_count: number;
  first_chart_type?: string;
  created_at: string;
  updated_at?: string;
}

export interface DashboardCreate {
  name: string;
  description?: string;
  charts: DashboardChartCreate[];
}

export interface DashboardChartCreate {
  dataset_id: string;
  chart_type: ChartType | string;
  x_column?: string;
  y_column?: string;
  title?: string;
  config?: Record<string, any>;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
}

// New Dashboard Features Types
export type AggregationType = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median' | 'distinct_count';

export interface FilterCondition {
  id: string;
  column: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'between' | 'in';
  value: string | number | string[];
  datasetId: string;
}

export interface ChartConfig {
  id: string;
  type: ChartType;
  title: string;
  columnSelections: ColumnSelection[];
  aggregation?: AggregationType;
  filters?: FilterCondition[];
  dateRange?: {
    start: Date | null;
    end: Date | null;
  };
}

export interface ColumnSelection {
  datasetId: string;
  columnName: string;
  displayName: string;
  datasetName: string;
}

