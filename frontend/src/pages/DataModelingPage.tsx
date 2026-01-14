import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { datasetService } from '../services/datasetService';
import { dashboardService } from '../services/dashboardService';
import { connectionService } from '../services/connectionService';
import { queryService } from '../services/queryService';
import { SQLVisualizeModal } from '../components/SQLVisualizeModal';
import { BarChart2, ChevronDown, Code, Copy } from 'lucide-react';
import Editor from '@monaco-editor/react';
import type { Connection, Dataset } from '../types';
import { TransformationConfigModal } from '../components/TransformationConfigModal';
import { savedWorkflowService } from '../services/savedWorkflowService';
import type { SavedWorkflow } from '../types';
import { Trash2 } from 'lucide-react';


// ============================================================================
// TYPES
// ============================================================================

interface ColumnInfo {
  name: string;
  type: string;
  nullable?: boolean;
  distinctCount?: number;
  nullPercent?: number;
}

interface TableNode {
  id: string;
  type: 'dataset' | 'database_table' | 'derived' | 'transformation';
  name: string;
  source?: string;
  columns: ColumnInfo[];
  allColumns?: ColumnInfo[]; // Full set of available columns
  isExpanded: boolean;
  x: number;
  y: number;
  rowCount?: number;
  lastSynced?: string;
  connectionId?: string;
  tableName?: string;
  scrollTop?: number;
  transformationType?: string;
  transformationCategory?: string;
  transformationConfig?: any;
  isConfigured?: boolean;
  joinMetadata?: {
    joinType: string;
    leftTable: string;
    rightTable: string;
    leftColumn: string;
    rightColumn: string;
    filter?: string;
    transform?: string;
  };
}

interface JoinRelationship {
  id: string;
  fromTableId: string;
  fromColumnName: string;
  toTableId: string;
  toColumnName: string;
  joinType: 'inner' | 'left' | 'right' | 'full';
  filterCondition?: string;
  transformations?: string;
  isEditing?: boolean;
}

interface DragSource {
  id: string;
  name: string;
  type: 'dataset' | 'database_table' | 'transformation';
  connectionId?: string;
  sourceName?: string;
  category?: string;
  operation?: string;
  dataset?: any; // Optional dataset payload for dataset drag sources
}

interface DrawingState {
  fromTableId: string;
  fromColumnName: string;
  startX: number;
  startY: number;
}

// ============================================================================
// UTILITIES
// ============================================================================

const isValidName = (name: any): boolean => {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  // Filter out placeholder names
  if (trimmed.toLowerCase() === 'string') return false;
  return true;
};

const sanitizeName = (name: string): string => name.trim();

const extractColumnsFromDataset = (ds: any): ColumnInfo[] => {
  const cols = ds?.schema_info?.schema?.columns || ds?.schema_info?.columns || ds?.columns || [];
  if (!Array.isArray(cols)) return [];

  return cols
    .map((col: any) => {
      let name = '';
      let type = 'string';

      if (typeof col === 'string') {
        name = col;
      } else if (col && typeof col === 'object') {
        name = col.name || '';
        type = col.type || 'string';
      }

      return { name: sanitizeName(name), type };
    })
    .filter((col: any) => isValidName(col.name));
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const DataModelingPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  // Helper: Generate SQL from workflow graph
  // Enhanced SQL generator: includes all tables and transformations
  function generateWorkflowSQL(tables: TableNode[], relationships: JoinRelationship[], availableConnections: Connection[]): string {
    // 1. Identify the Output Node (Sink)
    // Find a node that is NOT a source for any other relationship
    const activeSourceIds = new Set(relationships.map(r => r.fromTableId));
    let outputNode = tables.find(t => !activeSourceIds.has(t.id) && (t.type === 'derived' || t.type === 'transformation'))
      || tables.find(t => !activeSourceIds.has(t.id))
      || tables[tables.length - 1];

    if (!outputNode) return '-- No nodes in workflow';

    // 0. Environment Detection
    const usedNodes = new Set<TableNode>();
    const stack = [outputNode];
    const seenNodes = new Set<string>();
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (!n || seenNodes.has(n.id)) continue;
      seenNodes.add(n.id);
      if (n.type === 'database_table' || n.type === 'dataset') usedNodes.add(n);
      relationships.filter(r => r.toTableId === n.id).forEach(r => {
        const input = tables.find(t => t.id === r.fromTableId);
        if (input) stack.push(input);
      });
      const cfg = n.transformationConfig || {};
      if (cfg.leftTableId) {
        const ln = tables.find(t => t.id === cfg.leftTableId);
        if (ln) stack.push(ln);
      }
      if (cfg.rightTableId) {
        const rn = tables.find(t => t.id === cfg.rightTableId);
        if (rn) stack.push(rn);
      }
    }

    const uniqueConnIds = new Set(Array.from(usedNodes).map(t => t.connectionId).filter(id => !!id));
    const hasExternalDatasets = Array.from(usedNodes).some(t => t.type === 'dataset');
    const isMultiSource = uniqueConnIds.size > 1 || (uniqueConnIds.size === 1 && hasExternalDatasets);

    const primaryConnId = Array.from(uniqueConnIds)[0];
    const primaryConn = availableConnections.find(c => c.id === primaryConnId);
    const connType = (primaryConn as any)?.source_type?.toLowerCase() || '';

    // Logic: DuckDB if cross-source OR Salesforce OR MongoDB OR explicit datasets
    // Otherwise, Native Mode (MySQL, PostgreSQL, Snowflake)
    const isDuckDBEnv = isMultiSource || connType === 'salesforce' || connType === 'mongodb' || !primaryConnId;

    const ctes: string[] = [];
    const visited = new Set<string>();
    const nodeCteNames = new Map<string, string>(); // Map nodeId -> CTE Entry Name (or table name)

    // Helper to quote identifiers based on dialect
    const quote = (name: string): string => {
      if (!name || name === '*' || name === 'L' || name === 'R' || name === 'T' || name === 'sub' || name === '_rn') return name;

      const quoteChar = (connType === 'mysql' && !isDuckDBEnv) ? '`' : '"';

      // If it's a multi-part identifier (e.g. schema.table), quote each part
      if (name.includes('.')) {
        return name.split('.').map(part => `${quoteChar}${part.replace(new RegExp(quoteChar, 'g'), quoteChar + quoteChar)}${quoteChar}`).join('.');
      }
      return `${quoteChar}${name.replace(new RegExp(quoteChar, 'g'), quoteChar + quoteChar)}${quoteChar}`;
    };

    const getTableName = (node: TableNode): string => {
      if (node.type === 'database_table') {
        const conn = availableConnections.find(c => c.id === node.connectionId);
        const dbName = conn?.name || node.source;
        let name = node.tableName || node.name;

        if (isDuckDBEnv) {
          if (dbName && !name.includes('.')) {
            name = `${dbName}.${name}`;
          }
        }
        return quote(name);
      }
      if (node.type === 'dataset') {
        const escapedName = node.name.replace(/"/g, '""');
        return `uploaded_files."${escapedName}"`;
      }
      return quote(node.name);
    };

    // Recursive Build Function
    const processNode = (node: TableNode): string => {
      if (visited.has(node.id)) return nodeCteNames.get(node.id)!;

      visited.add(node.id);

      // BASE CASE: Database Table or Dataset -> No CTE unless column subset selected
      if (node.type === 'database_table' || node.type === 'dataset') {
        const tableName = getTableName(node);
        // If user selected a subset of columns, wrap in CTE
        if (node.allColumns && node.allColumns.length > 0 && node.columns.length < node.allColumns.length) {
          const cteName = `cte_${node.name.replace(/[^a-zA-Z0-9]/g, '_')}_${node.id.split('-')[1] || Math.floor(Math.random() * 1000)}`;
          const cols = node.columns.map(c => quote(c.name)).join(', ');
          ctes.push(`${cteName} AS (\n  SELECT ${cols} FROM ${tableName}\n)`);
          nodeCteNames.set(node.id, cteName);
          return cteName;
        }
        nodeCteNames.set(node.id, tableName);
        return tableName;
      }

      // RECURSIVE CASE: Transformation Node or Derived Node
      // 1. Find Inputs
      const inputRels = relationships.filter(r => r.toTableId === node.id);
      const inputNodes = inputRels.map(r => tables.find(t => t.id === r.fromTableId)).filter((t): t is TableNode => !!t);

      // Process inputs first (Dependency First)
      inputNodes.forEach(processNode);

      // Generate CTE for this node
      let cteSql = '';
      const cteName = `cte_${node.name.replace(/[^a-zA-Z0-9]/g, '_')}_${node.id.split('-')[1] || Math.floor(Math.random() * 1000)}`;

      const cfg = node.transformationConfig || {};

      // Handle Joins
      if ((node.transformationType === 'Join' || cfg.operation === 'Join') && (cfg.leftTableId || cfg.rightTableId)) {
        const leftId = cfg.leftTableId;
        const rightId = cfg.rightTableId;
        const leftName = nodeCteNames.get(leftId) || (inputNodes[0] ? nodeCteNames.get(inputNodes[0].id) : 'UNKNOWN_TABLE');
        const rightName = nodeCteNames.get(rightId) || (inputNodes.length > 1 ? nodeCteNames.get(inputNodes[1].id) : 'UNKNOWN_TABLE');

        if (leftName && rightName) {
          const L = 'L';
          const R = 'R';
          const conditions = (cfg.conditions || []).map((c: any) => `${L}.${quote(c.leftCol)} = ${R}.${quote(c.rightCol)}`).join(' AND ');
          const joinType = (cfg.joinType || 'INNER').toUpperCase();

          const leftInput = inputNodes.find(n => n.id === leftId) || inputNodes[0];
          const rightInput = inputNodes.find(n => n.id === rightId) || inputNodes[1];
          const leftCols = leftInput?.columns || [];
          const rightCols = rightInput?.columns || [];
          const leftNames = new Set(leftCols.map(c => c.name));

          let selectClause = '';
          if (cfg.selectedColumns && cfg.selectedColumns.length > 0) {
            const actualColumns = cfg.selectedColumns.filter((col: string) => col !== '__CUSTOM__');
            if (actualColumns.length > 0) {
              const usedInSelect = new Set<string>();
              const exprs = actualColumns.map((col: string) => {
                let expr = '';
                let name = '';
                if (col.startsWith('left.')) {
                  name = col.substring(5);
                  expr = `${L}.${quote(name)}`;
                } else if (col.startsWith('right.')) {
                  name = col.substring(6);
                  expr = `${R}.${quote(name)}`;
                } else {
                  name = col;
                  expr = quote(col);
                }

                if (usedInSelect.has(name)) {
                  const alias = col.startsWith('right.') ? `${name}_right` : `${name}_left`;
                  usedInSelect.add(alias);
                  return `${expr} AS ${quote(alias)}`;
                }
                usedInSelect.add(name);
                return expr;
              });
              selectClause = exprs.join(', ');
            }
          }

          if (!selectClause) {
            const exprs: string[] = [];
            leftCols.forEach(c => exprs.push(`${L}.${quote(c.name)}`));
            rightCols.forEach(c => {
              if (leftNames.has(c.name)) exprs.push(`${R}.${quote(c.name)} AS ${quote(c.name + '_right')}`);
              else exprs.push(`${R}.${quote(c.name)}`);
            });
            selectClause = exprs.join(', ');
          }

          if (joinType.includes('UNION')) {
            cteSql = `SELECT * FROM ${leftName} UNION ${joinType.includes('ALL') ? 'ALL' : ''} SELECT * FROM ${rightName}`;
          } else {
            cteSql = `SELECT ${selectClause} FROM ${leftName} ${L} ${joinType} JOIN ${rightName} ${R} ON ${conditions}`;
          }
        }
      }
      // Handle Legacy Derived Join (fallback)
      else if (node.type === 'derived' && node.joinMetadata) {
        const jm = node.joinMetadata;
        const leftInput = inputNodes.find(n => n.name === jm.leftTable);
        const rightInput = inputNodes.find(n => n.name === jm.rightTable);
        const leftCte = leftInput ? nodeCteNames.get(leftInput.id)! : jm.leftTable;
        const rightCte = rightInput ? nodeCteNames.get(rightInput.id)! : jm.rightTable;

        const L = 'L';
        const R = 'R';
        const leftCols = leftInput?.columns || [];
        const rightCols = rightInput?.columns || [];
        const leftNames = new Set(leftCols.map(c => c.name));

        const exprs: string[] = [];
        leftCols.forEach(c => exprs.push(`${L}.${quote(c.name)}`));
        rightCols.forEach(c => {
          if (leftNames.has(c.name)) exprs.push(`${R}.${quote(c.name)} AS ${quote(c.name + '_right')}`);
          else exprs.push(`${R}.${quote(c.name)}`);
        });

        cteSql = `SELECT ${exprs.join(', ')} FROM ${leftCte} ${L} ${jm.joinType.toUpperCase()} JOIN ${rightCte} ${R} ON ${L}.${quote(jm.leftColumn)} = ${R}.${quote(jm.rightColumn)}`;
      }
      // Handle Standard Transformations
      else if (inputNodes.length > 0) {
        const inputName = nodeCteNames.get(inputNodes[0].id)!;
        const inputCols = inputNodes[0].columns.map(c => c.name);
        const T = 'T';

        let whereClauses: string[] = [];
        let selectCols = inputCols.map(c => `${T}.${quote(c)}`).join(', ');

        if (cfg.selectedColumns && cfg.selectedColumns.length > 0) {
          const actualColumns = cfg.selectedColumns.filter((c: string) => c !== '__CUSTOM__');
          if (actualColumns.length > 0) selectCols = actualColumns.map((c: string) => `${T}.${quote(c)}`).join(', ');
        }

        let groupBy = '';
        let orderBy = '';
        let limit = '';
        let partitionByCols: string[] = [];
        let colTransforms = new Map<string, string>();
        const pipeline = cfg.pipeline || (cfg.operation ? [cfg] : []);

        pipeline.forEach((step: any) => {
          if (step.operation === 'Remove nulls' && Array.isArray(step.columns)) {
            step.columns.forEach((col: string) => whereClauses.push(`${T}.${quote(col)} IS NOT NULL`));
          } else if (step.operation === 'Filter by condition') {
            const conditions = step.conditions || (step.column ? [{ column: step.column, operator: step.operator, value: step.value }] : []);
            const groupClauses: string[] = [];
            conditions.forEach((cond: any) => {
              if (!cond.column) return;
              const val = isNaN(Number(cond.value)) ? `'${cond.value}'` : cond.value;
              const op = cond.operator || '=';
              if (op === 'CONTAINS') groupClauses.push(`${T}.${quote(cond.column)} ILIKE '%${cond.value}%'`);
              else if (op === 'IN') groupClauses.push(`${T}.${quote(cond.column)} IN (${val})`);
              else groupClauses.push(`${T}.${quote(cond.column)} ${op} ${val}`);
            });
            if (groupClauses.length > 0) whereClauses.push(`(${groupClauses.join(' AND ')})`);
          } else if (step.operation === 'Select specific columns' && Array.isArray(step.columns)) {
            selectCols = step.columns.map((c: string) => `${T}.${quote(c)}`).join(', ');
          } else if (step.operation === 'Remove duplicates') {
            if (Array.isArray(step.columns)) partitionByCols.push(...step.columns);
          } else if (step.operation === 'Keep top/bottom N rows') {
            if (step.n) limit = `LIMIT ${step.n}`;
            if (step.orderColumn) orderBy = `ORDER BY ${T}.${quote(step.orderColumn)} ${step.type === 'bottom' ? 'ASC' : 'DESC'}`;
          } else if (step.operation === 'Type & Format') {
            const items = step.transformations || [];
            items.forEach((item: any) => {
              const col = item.column;
              if (!col) return;
              let expr = colTransforms.get(col) || `${T}.${quote(col)}`;
              if (item.operator === 'Cast type') expr = `CAST(${expr} AS ${item.castTo ? item.castTo.toUpperCase() : 'STRING'})`;
              else if (item.operator === 'Format string') expr = `TO_CHAR(${expr}, '${item.format}')`;
              else if (item.operator === 'Trim') expr = `TRIM(${expr})`;
              else if (item.operator === 'Uppercase / Lowercase') expr = item.caseType === 'lower' ? `LOWER(${expr})` : `UPPER(${expr})`;
              else if (item.operator === 'Replace text') expr = `REPLACE(${expr}, '${item.find || ''}', '${item.replaceWith || ''}')`;
              else if (item.operator === 'Concatenate') {
                const others = (item.concatColumns || []).map((c: string) => `${T}.${quote(c)}`);
                const sep = item.separator || '';
                if (others.length > 0) expr = `CONCAT(${expr}, '${sep}', ${others.join(`, '${sep}', `)})`;
              }
              colTransforms.set(col, expr);
            });
          } else if (step.operation === 'Aggregate') {
            const gb = step.groupBy || [];
            const items = step.aggregations || [];
            const selectList: string[] = [];
            gb.forEach((c: string) => selectList.push(`${T}.${quote(c)}`));
            items.forEach((agg: any) => {
              const col = agg.column;
              const op = agg.operator;
              let expr = '';
              const colExpr = col ? `${T}.${quote(col)}` : '*';
              switch (op) {
                case 'Sum': expr = `SUM(${colExpr})`; break;
                case 'Average': expr = `AVG(${colExpr})`; break;
                case 'Min': expr = `MIN(${colExpr})`; break;
                case 'Max': expr = `MAX(${colExpr})`; break;
                case 'Count': expr = `COUNT(${colExpr})`; break;
                case 'Count all rows': expr = `COUNT(*)`; break;
                case 'Count non-null values': expr = `COUNT(${colExpr})`; break;
                case 'Count distinct values': expr = `COUNT(DISTINCT ${colExpr})`; break;
                default: expr = `COUNT(${colExpr})`;
              }
              const alias = agg.alias || (op.toLowerCase().replace(/ /g, '_') + (col ? `_${col}` : ''));
              selectList.push(`${expr} AS ${quote(alias)}`);
            });
            if (selectList.length > 0) selectCols = selectList.join(', ');
            if (gb.length > 0) groupBy = `GROUP BY ${gb.map((c: string) => `${T}.${quote(c)}`).join(', ')}`;
            if (step.having) (step as any)._having = step.having;
          }
        });

        if (colTransforms.size > 0) {
          const selected = selectCols.split(',').map(s => s.trim());
          selectCols = selected.map(c => {
            const rawCol = c.startsWith(`${T}.`) ? c.substring(3) : c;
            // Handle if rawCol was quoted in selectCols build
            const unquotedRawCol = rawCol.startsWith('"') && rawCol.endsWith('"') ? rawCol.slice(1, -1).replace(/""/g, '"') : rawCol;
            if (colTransforms.has(unquotedRawCol)) return `${colTransforms.get(unquotedRawCol)} AS ${quote(unquotedRawCol)}`;
            return c;
          }).join(', ');
        }

        let baseQuery = `SELECT ${selectCols} FROM ${inputName} ${T}`;
        if (whereClauses.length > 0) baseQuery += ` WHERE ${whereClauses.join(' AND ')}`;

        if (partitionByCols.length > 0) {
          const pb = partitionByCols.map((c: string) => `${T}.${quote(c)}`).join(', ');
          cteSql = `SELECT * FROM (
               SELECT *, ROW_NUMBER() OVER(PARTITION BY ${pb} ORDER BY ${T}.${quote(partitionByCols[0])}) as _rn
               FROM (${baseQuery}) sub
             ) WHERE _rn = 1`;
        } else {
          cteSql = baseQuery;
        }

        if (groupBy) {
          cteSql += ` ${groupBy}`;
          const aggStep = pipeline.find((s: any) => s.operation === 'Aggregate');
          if (aggStep && (aggStep as any)._having) cteSql += ` HAVING ${(aggStep as any)._having}`;
        }
        if (orderBy) cteSql += ` ${orderBy}`;
        if (limit) cteSql += ` ${limit}`;
      }

      if (cteSql) {
        ctes.push(`${cteName} AS (\n  ${cteSql}\n)`);
        nodeCteNames.set(node.id, cteName);
        return cteName;
      }

      // Fallback
      const fallback = inputNodes[0] ? nodeCteNames.get(inputNodes[0].id)! : 'ERROR_NO_INPUT';
      nodeCteNames.set(node.id, fallback);
      return fallback;
    };

    // Start Traversal
    processNode(outputNode);

    if (ctes.length === 0) {
      return `SELECT * FROM ${getTableName(outputNode)}`;
    }

    // Sometimes processNode returns the table name if it's just a source. 
    // Ensure we select from the final logic.
    return `WITH ${ctes.join(',\n')}\nSELECT * FROM ${nodeCteNames.get(outputNode.id)}`;
  }

  const location = useLocation();
  // navigate not used in this component

  // ========== Constants ==========
  const DATABASE_SOURCE_TYPES = ['mysql', 'postgresql', 'mongodb', 'salesforce'] as const;

  // file checks not needed here; keep only database checker
  const isDatabaseSourceType = (t: unknown): boolean =>
    typeof t === 'string' && (DATABASE_SOURCE_TYPES as readonly string[]).includes(t);

  // ========== State: Data ==========
  const [tables, setTables] = useState<TableNode[]>([]);
  const [relationships, setRelationships] = useState<JoinRelationship[]>([]);

  const [connectionTables, setConnectionTables] = useState<Record<string, string[]>>({});

  // ========== State: UI ==========
  const [sidebarTab, setSidebarTab] = useState<'data_sources' | 'saved_workflows'>('data_sources');
  const [expandedConns, setExpandedConns] = useState<Set<string>>(new Set());
  const [uploadedFilesExpanded, setUploadedFilesExpanded] = useState<boolean>(false);
  const [transformationsExpanded, setTransformationsExpanded] = useState<boolean>(false);
  // expandedTransformCategories is unused; omit to satisfy TS
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState<boolean>(false);
  const [configTargetNode, setConfigTargetNode] = useState<TableNode | null>(null);
  const [configSourceNode, setConfigSourceNode] = useState<TableNode | null>(null);
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<{ rows: any[]; columns: string[]; title: string } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [columnModalOpen, setColumnModalOpen] = useState<boolean>(false);
  const [columnModalTargetNode, setColumnModalTargetNode] = useState<TableNode | null>(null);
  const [queryResult, setQueryResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [resultsPanelOpen, setResultsPanelOpen] = useState(false);
  const [isVisualizeOpen, setIsVisualizeOpen] = useState(false);
  const [isVisualizeMenuOpen, setIsVisualizeMenuOpen] = useState(false);
  const [visualizeMode, setVisualizeMode] = useState<'config' | 'sql_direct'>('config');
  const [lastExecutedQuery, setLastExecutedQuery] = useState<string>('');
  const [lastExecutedSources, setLastExecutedSources] = useState<any[]>([]);
  const [initialVisualizeConfig, setInitialVisualizeConfig] = useState<Record<string, any> | undefined>(undefined);
  const [resultsTab, setResultsTab] = useState<'results' | 'query'>('results');
  const [joinModalData, setJoinModalData] = useState<{
    fromTableId: string;
    fromColumnName: string;
    toTableId: string;
    toColumnName: string;
    isEditing?: boolean;
    editingTableId?: string;
  } | null>(null);
  const [joinForm, setJoinForm] = useState({ joinType: 'inner', filter: '', transform: '' });




  // ========== State: Saved Workflows ==========
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
  const [activeSavedWorkflowId, setActiveSavedWorkflowId] = useState<string | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState('');

  // ========== State: Viewport ==========
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);

  // Helper: Calculate output columns for a node based on its config and inputs
  const getOutputColumns = (node: TableNode, incoming: TableNode[]): ColumnInfo[] => {
    if (node.type !== 'transformation') return node.columns;
    const config = node.transformationConfig;

    const isJoin = node.transformationType === 'Join' || node.transformationCategory === 'joins';

    let baseColumns: ColumnInfo[] = [];

    // 1. Determine the "draft" list of columns based on operation type
    if (!config) {
      incoming.forEach(n => baseColumns.push(...n.columns));
    } else {
      // Check for Aggregate which has its own schema
      let aggResult: ColumnInfo[] | null = null;
      if (config.pipeline && Array.isArray(config.pipeline)) {
        config.pipeline.forEach((step: any) => {
          if (step.operation === 'Aggregate') {
            const gb = step.groupBy || [];
            const items = step.aggregations || [];
            const res: ColumnInfo[] = [];

            gb.forEach((name: string) => {
              const orig = incoming[0]?.columns.find(c => c.name === name);
              res.push(orig || { name, type: 'string' });
            });

            items.forEach((agg: any) => {
              const op = agg.operator;
              const col = agg.column;
              const defaultAlias = op.toLowerCase().replace(/ /g, '_') + (col ? `_${col}` : '');
              const alias = agg.alias || defaultAlias;
              let type = 'number';
              if (col) {
                const orig = incoming[0]?.columns.find(c => c.name === col);
                if (orig) type = orig.type;
              }
              if (op.includes('Count')) type = 'number';
              res.push({ name: alias, type });
            });
            aggResult = res;
          }
        });
      }

      if (aggResult) {
        baseColumns = aggResult;
      } else {
        // Standard Selection / Joins
        let selectedNames: string[] | null = null;
        if (config.selectedColumns && config.selectedColumns.length > 0) {
          const filtered = config.selectedColumns.filter((c: string) => c !== '__CUSTOM__');
          if (filtered.length > 0) selectedNames = filtered;
        }

        if (config.pipeline && Array.isArray(config.pipeline)) {
          config.pipeline.forEach((step: any) => {
            if (step.selectedColumns && step.selectedColumns.length > 0) {
              const filtered = step.selectedColumns.filter((c: string) => c !== '__CUSTOM__');
              if (filtered.length > 0) selectedNames = filtered;
            } else if (step.operation === 'Select specific columns' && Array.isArray(step.columns)) {
              selectedNames = step.columns;
            }
          });
        }

        if (selectedNames) {
          if (isJoin) {
            selectedNames.forEach((sel: string) => {
              if (sel === '__CUSTOM__') return;
              const parts = sel.split('.');
              if (parts.length < 2) return;
              const side = parts[0];
              const colName = parts.slice(1).join('.');
              const targetId = side === 'left' ? config.leftTableId : config.rightTableId;
              const sourceTable = incoming.find(n => n.id === targetId);
              if (sourceTable) {
                const col = sourceTable.columns.find(c => c.name === colName);
                if (col) baseColumns.push(col);
                else baseColumns.push({ name: colName, type: 'string' });
              }
            });
          } else {
            const sourceTable = incoming[0];
            if (sourceTable) {
              selectedNames.forEach(name => {
                const col = sourceTable.columns.find(c => c.name === name);
                if (col) baseColumns.push(col);
              });
            }
          }
        } else {
          // No selection: use all columns from all inputs
          incoming.forEach(n => baseColumns.push(...n.columns));
        }

        // Apply any type casts
        if (config.pipeline && Array.isArray(config.pipeline)) {
          config.pipeline.forEach((step: any) => {
            if (step.operation === 'Type & Format') {
              (step.transformations || []).forEach((item: any) => {
                if (item.operator === 'Cast type' && item.column && item.castTo) {
                  const idx = baseColumns.findIndex(c => c.name === item.column);
                  if (idx >= 0) baseColumns[idx] = { ...baseColumns[idx], type: item.castTo };
                }
              });
            }
          });
        }
      }
    }

    // 2. Post-process: Ensure all column names are UNIQUE
    const finalColumns: ColumnInfo[] = [];
    const usedNames = new Set<string>();

    baseColumns.forEach((col) => {
      let uniqueName = col.name;
      if (usedNames.has(uniqueName)) {
        // If it's a join without explicit selection, we can be smart about suffixes
        // Otherwise, general collisions get numeric suffixes
        const suffix = isJoin ? 'right' : '';
        let counter = 1;
        uniqueName = suffix ? `${col.name}_${suffix}` : `${col.name}_${counter++}`;

        while (usedNames.has(uniqueName)) {
          uniqueName = suffix ? `${col.name}_${suffix}_${counter++}` : `${col.name}_${counter++}`;
        }
      }
      finalColumns.push({ ...col, name: uniqueName });
      usedNames.add(uniqueName);
    });

    return finalColumns;
  };

  // Helper: Recursively propagate schema changes downstream
  const propagateSchemaChanges = (
    startNodeId: string,
    currentTables: TableNode[],
    currentRels: JoinRelationship[]
  ): TableNode[] => {
    let updated = [...currentTables];
    const queue = [startNodeId];
    const visited = new Set();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const downstreamRels = currentRels.filter(r => r.fromTableId === nodeId);
      const downstreamIds = Array.from(new Set(downstreamRels.map(r => r.toTableId)));

      downstreamIds.forEach(targetId => {
        const targetNode = updated.find(t => t.id === targetId);
        if (targetNode && targetNode.type === 'transformation') {
          const inputIds = currentRels.filter(r => r.toTableId === targetId).map(r => r.fromTableId);
          const incoming = updated.filter(t => inputIds.includes(t.id));
          const nextCols = getOutputColumns(targetNode, incoming);

          updated = updated.map(t =>
            t.id === targetId ? { ...t, columns: nextCols } : t
          );
          queue.push(targetId);
        }
      });
    }
    return updated;
  };

  // ========== Effects: Load Data ==========

  // Restore workflow from insightId (Edit Mode)
  useEffect(() => {
    const insightId = searchParams.get('insightId');
    if (!insightId) return;

    dashboardService.getDashboard(insightId).then((dashboard) => {
      if (dashboard.charts && dashboard.charts.length > 0) {
        const chart = dashboard.charts[0];
        const config = chart.config || {};
        const wd = config.workflow_data;

        if (wd && wd.tables && wd.relationships) {
          console.log('Restoring workflow from insight:', { tables: wd.tables.length, rels: wd.relationships.length });

          // Restore nodes and edges
          setTables(wd.tables);
          setRelationships(wd.relationships);

          // Also set viewport if available (optional)
          // if (config.viewport) setViewport(config.viewport);

          // Restore visualization config if user wants to visualize immediately?
          // For now, we just restore the canvas.
          // Note: We might want to set initialVisualizeConfig in case they click "Visualize" later.
          // Inject edit IDs so saving updates the existing insight
          setInitialVisualizeConfig({
            ...config,
            editDashboardId: dashboard.id,
            editChartId: chart.id,
            insightName: dashboard.name,
            insightDescription: dashboard.description,
          });
        }
      }
    }).catch((err) => console.error("Failed to restore workflow", err));
  }, [searchParams]);

  // Fetch all connections
  const { data: allConnections = [] } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => connectionService.getConnections(),
  });

  // Filter to only show database connections
  const connections = useMemo(
    () => allConnections.filter((c) => isDatabaseSourceType((c as any)?.source_type)),
    [allConnections]
  );

  // Fetch datasets and filter for uploaded files only
  const { data: datasets = [] } = useQuery<Dataset[]>({
    queryKey: ['datasets'],
    queryFn: () => datasetService.getDatasets(),
  });

  // Only show actual uploaded files (datasets created from a file upload)
  const uploadedFileDatasets = datasets.filter((d: any) => !!d?.original_filename);

  // Update availableConnections when connections change
  const availableConnections = useMemo(
    () => connections.filter((c) => isValidName(c.name)),
    [connections]
  );

  // Load tables from navigation state; merge with existing tables and keep deterministic IDs
  useEffect(() => {
    if (!location.state?.datasets && !location.state?.connections) return;

    const newTables: TableNode[] = [];
    let gridX = 50;
    let gridY = 50;

    // Add datasets (deterministic ids)
    location.state.datasets?.forEach((ds: any) => {
      if (!isValidName(ds.name)) return;
      const cols = extractColumnsFromDataset(ds);
      newTables.push({
        id: `ds-${ds.id}`,
        type: 'dataset',
        name: sanitizeName(ds.name),
        columns: cols,
        allColumns: cols,
        isExpanded: false,
        x: gridX,
        y: gridY,
        rowCount: ds.row_count || 0,
      });
      gridX += 300;
      if (gridX > 900) {
        gridX = 50;
        gridY += 350;
      }
    });

    // Add connection tables with deterministic ids (conn-{connId}-{tableName})
    location.state.connections?.forEach((conn: any) => {
      if (!isValidName(conn.name)) return;
      conn.selectedTables?.forEach((tableName: string) => {
        if (!isValidName(tableName)) return;
        const stableId = `conn-${conn.id}-${sanitizeName(tableName)}`;
        newTables.push({
          id: stableId,
          type: 'database_table',
          name: sanitizeName(tableName),
          source: sanitizeName(conn.name),
          connectionId: conn.id,
          tableName: sanitizeName(tableName),
          columns: [],
          isExpanded: false,
          x: gridX,
          y: gridY,
        });
        gridX += 300;
        if (gridX > 900) {
          gridX = 50;
          gridY += 350;
        }
      });
    });

    // Merge with existing tables: keep user-added tables (transformations, derived) and preserve positions/columns
    setTables((prev) => {
      const prevById = new Map(prev.map((t) => [t.id, t]));
      const merged: TableNode[] = newTables.map((nt) => {
        const existing = prevById.get(nt.id);
        if (existing) {
          return {
            ...nt,
            // preserve interactive state from existing
            x: existing.x ?? nt.x,
            y: existing.y ?? nt.y,
            isExpanded: existing.isExpanded ?? nt.isExpanded,
            columns: (existing.columns && existing.columns.length > 0) ? existing.columns : nt.columns,
            allColumns: existing.allColumns || nt.allColumns,
            scrollTop: existing.scrollTop ?? nt.scrollTop,
            isConfigured: existing.isConfigured ?? nt.isConfigured,
            transformationConfig: existing.transformationConfig ?? nt.transformationConfig,
          };
        }
        return nt;
      });

      // Append any previous tables that are not derived from navigation (user-added)
      const mergedIds = new Set(merged.map((t) => t.id));
      const extras = prev.filter((t) => !mergedIds.has(t.id));
      const next = [...merged, ...extras];

      // Quick equality check by id and position to avoid unnecessary updates
      if (next.length === prev.length) {
        let same = true;
        for (let i = 0; i < next.length; i++) {
          const a = next[i];
          const b = prev[i];
          if (!b || a.id !== b.id || a.x !== b.x || a.y !== b.y || (a.columns?.length || 0) !== (b.columns?.length || 0)) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }

      return next;
    });
  }, [location.state?.datasets, location.state?.connections]);

  // Auto-fetch columns for database tables and datasets
  useEffect(() => {
    tables.forEach((table) => {
      if (table.type === 'database_table' && table.columns.length === 0) {
        // Auto-expand and load database table columns
        (async () => {
          try {
            if (!table.connectionId || !table.tableName) return;
            const result = await connectionService.queryData(
              table.connectionId,
              table.tableName,
              1,
              0
            );
            if (result.columns) {
              setTables((prev) =>
                prev.map((t) =>
                  t.id === table.id
                    ? {
                      ...t,
                      columns: result.columns.map((col: any) => ({
                        name: col.name || col,
                        type: col.type || 'string',
                      })),
                      allColumns: result.columns.map((col: any) => ({
                        name: col.name || col,
                        type: col.type || 'string',
                      })),
                    }
                    : t
                )
              );
            }
          } catch (err) {
            console.error(`Failed to fetch columns for ${table.name}:`, err);
          }
        })();
      } else if (table.type === 'dataset' && table.columns.length === 0) {
        // Fetch dataset preview to get columns (same approach as SQL Editor)
        (async () => {
          try {
            // Extract dataset ID from table.id (format: "ds-{id}")
            const datasetId = table.id.replace('ds-', '');
            console.log('Fetching columns for dataset:', { tableId: table.id, datasetId, tableName: table.name });

            const preview = await datasetService.getDatasetPreview(datasetId, 20);
            console.log('Preview response:', preview);

            let cols: ColumnInfo[] = [];

            if (preview?.columns && Array.isArray(preview.columns)) {
              cols = preview.columns.map((colName: string) => ({
                name: colName,
                type: 'string'
              }));
              console.log('✓ Got columns from preview.columns:', cols.length);
            } else if (preview?.rows && Array.isArray(preview.rows) && preview.rows.length > 0) {
              // Extract from first row if columns array not provided
              const firstRow = preview.rows[0];
              cols = Object.keys(firstRow).map(key => ({
                name: key,
                type: typeof firstRow[key]
              }));
              console.log('✓ Got columns from preview.rows:', cols.length);
            }

            if (cols.length > 0) {
              setTables((prev) =>
                prev.map((t) =>
                  t.id === table.id
                    ? { ...t, columns: cols, allColumns: cols }
                    : t
                )
              );
              console.log('✓ Updated table with', cols.length, 'columns');
            } else {
              console.warn('✗ No columns found in preview for:', table.name);
            }
          } catch (err) {
            console.error(`Failed to fetch columns for dataset ${table.name}:`, err);
            // Try fallback to getDatasetById
            try {
              const datasetId = table.id.replace('ds-', '');
              console.log('Trying fallback getDatasetById for:', datasetId);
              const fullDataset = await datasetService.getDatasetById(datasetId);
              console.log('Full dataset response:', fullDataset);
              const cols = extractColumnsFromDataset(fullDataset);
              if (cols.length > 0) {
                setTables((prev) =>
                  prev.map((t) =>
                    t.id === table.id
                      ? { ...t, columns: cols, allColumns: cols }
                      : t
                  )
                );
                console.log('✓ Fallback succeeded with', cols.length, 'columns');
              }
            } catch (fallbackErr) {
              console.error(`Fallback also failed for dataset ${table.name}:`, fallbackErr);
            }
          }
        })();
      }
    });
  }, [tables]);

  // Handle ESC key to cancel drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawing) {
        setDrawing(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawing]);

  // Filtered data - only show database connections and uploaded files
  const visibleUploadedFiles = useMemo(
    () => uploadedFileDatasets.filter((ds: any) => isValidName(ds.name)),
    [uploadedFileDatasets]
  );

  const visibleConnections = useMemo(
    () => availableConnections.filter((c) =>
      isValidName(c.name) && isDatabaseSourceType((c as any)?.source_type)
    ),
    [availableConnections]
  );

  // ========== Sidebar Handlers ==========

  const toggleConnection = useCallback(
    async (connId: string) => {
      const next = new Set(expandedConns);
      if (next.has(connId)) {
        next.delete(connId);
        setExpandedConns(next);
        return;
      }

      next.add(connId);
      setExpandedConns(next);

      if (!connectionTables[connId]) {
        try {
          const tables = await connectionService.getCollections(connId);
          const filtered = (tables || [])
            .filter(isValidName)
            .map(sanitizeName);
          setConnectionTables((prev) => ({ ...prev, [connId]: filtered }));
        } catch (err) {
          console.error(`Failed to fetch tables for connection ${connId}:`, err);
        }
      }
    },
    [expandedConns, connectionTables]
  );

  // ========== Preview Handler ==========

  const handlePreviewData = async (type: 'dataset' | 'database', id: string, name: string, connectionId?: string) => {
    setIsLoadingPreview(true);
    setPreviewModalOpen(true);
    setPreviewData(null);

    try {
      if (type === 'dataset') {
        const preview = await datasetService.getDatasetPreview(id, 10);
        const columns = preview?.columns || (preview?.rows?.[0] ? Object.keys(preview.rows[0]) : []);
        setPreviewData({
          title: name,
          columns,
          rows: preview?.rows || []
        });
      } else if (type === 'database' && connectionId) {
        const result = await connectionService.queryData(connectionId, name, 10, 0);
        const columns = result?.columns?.map((c: any) => c.name || c) ||
          (result?.data?.[0] ? Object.keys(result.data[0]) : []);
        setPreviewData({
          title: name,
          columns,
          rows: result?.data || []
        });
      }
    } catch (err) {
      console.error('Failed to fetch preview data:', err);
      setPreviewData({
        title: name,
        columns: [],
        rows: []
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // ========== Canvas Handlers ==========

  const handleDragStart = (e: React.DragEvent, source: DragSource) => {
    e.dataTransfer.setData('application/json', JSON.stringify(source));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const json = e.dataTransfer.getData('application/json');
      if (!json) return;

      const data = JSON.parse(json);
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      // Adjust drop coordinates for viewport
      const x = (e.clientX - rect.left - viewport.x) / viewport.scale;
      const y = (e.clientY - rect.top - viewport.y) / viewport.scale;

      if (data.type === 'dataset') {
        const ds = data.dataset || uploadedFileDatasets.find((d) => d.id === data.id);
        if (!ds) {
          console.error('Dataset not found:', data.id);
          return;
        }

        const displayName = ds.original_filename || ds.name;
        console.log('Creating dataset table:', { id: ds.id, name: displayName });
        const newTable: TableNode = {
          id: `ds-${ds.id}`,
          type: 'dataset',
          name: displayName,
          columns: [], // Start with empty, let useEffect fetch columns
          allColumns: [],
          isExpanded: false,
          x,
          y,
          rowCount: ds.row_count || 0,
        };
        setTables((prev) => [...prev, newTable]);
      } else if (data.type === 'database_table') {
        const newTable: TableNode = {
          id: `conn-${data.connectionId}-${Date.now()}-${Math.random()}`,
          type: 'database_table',
          name: sanitizeName(data.name),
          source: data.sourceName,
          connectionId: data.connectionId,
          tableName: sanitizeName(data.name),
          columns: [],
          allColumns: [],
          isExpanded: false,
          x,
          y,
        };
        setTables((prev) => [...prev, newTable]);
      } else if (data.type === 'transformation') {
        // Create transformation node
        const newTable: TableNode = {
          id: `transform-${Date.now()}-${Math.random()}`,
          type: 'transformation',
          name: data.operation || 'Transformation',
          transformationType: data.operation,
          transformationCategory: data.category,
          columns: [],
          isExpanded: false,
          isConfigured: false,
          x,
          y,
        };
        setTables((prev) => [...prev, newTable]);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTableMouseDown = (e: React.MouseEvent, tableId: string) => {
    e.stopPropagation();
    setSelectedTableId(tableId);
    setDraggingTableId(tableId);
    const table = tables.find((t) => t.id === tableId);
    if (table && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      // Calculate mouse position in world coordinates
      const mouseX = (e.clientX - rect.left - viewport.x) / viewport.scale;
      const mouseY = (e.clientY - rect.top - viewport.y) / viewport.scale;

      setDragOffset({
        x: mouseX - table.x,
        y: mouseY - table.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      // Calculate mouse position in world coordinates
      const x = (e.clientX - rect.left - viewport.x) / viewport.scale;
      const y = (e.clientY - rect.top - viewport.y) / viewport.scale;
      setMousePos({ x, y });

      if (draggingTableId) {
        setTables((prev) =>
          prev.map((t) =>
            t.id === draggingTableId
              ? {
                ...t,
                x: x - dragOffset.x,
                y: y - dragOffset.y,
              }
              : t
          )
        );
      } else if (isPanning) {
        const dx = e.clientX - lastPanPos.x;
        const dy = e.clientY - lastPanPos.y;
        setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setLastPanPos({ x: e.clientX, y: e.clientY });
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomSensitivity = 0.001;
      const delta = -e.deltaY * zoomSensitivity;
      const newScale = Math.min(Math.max(0.1, viewport.scale + delta), 5);

      // Zoom towards mouse pointer could be implemented here, 
      // but for simplicity let's just zoom center or current position
      setViewport(prev => ({ ...prev, scale: newScale }));
    } else {
      // Pan on scroll
      setViewport(prev => ({
        ...prev,
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 0) { // Middle or Left click
      if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'svg') {
        setIsPanning(true);
        setLastPanPos({ x: e.clientX, y: e.clientY });
      }
    }
  };

  const handleMouseUp = () => {
    setDraggingTableId(null);
    setDrawing(null);
    setIsPanning(false);
  };

  // Fetch saved workflows
  useEffect(() => {
    if (sidebarTab === 'saved_workflows') {
      savedWorkflowService.getSavedWorkflows().then(setSavedWorkflows).catch(console.error);
    }
  }, [sidebarTab]);

  const handleSaveLineage = async () => {
    if (tables.length === 0) {
      alert("Canvas is empty. Nothing to save.");
      return;
    }

    if (activeSavedWorkflowId) {
      // Overwrite existing
      try {
        const workflowData = {
          tables,
          relationships,
          viewport
        };
        await savedWorkflowService.updateSavedWorkflow(activeSavedWorkflowId, { workflow_data: workflowData });
        alert("Workflow updated successfully!");
        // Refresh list
        savedWorkflowService.getSavedWorkflows().then(setSavedWorkflows).catch(console.error);
      } catch (e) {
        console.error("Failed to update workflow", e);
        alert("Failed to save workflow.");
      }
    } else {
      // Open modal for new save
      setWorkflowName('');
      setIsSaveModalOpen(true);
    }
  };

  const confirmSaveNewWorkflow = async () => {
    if (!workflowName.trim()) return;
    try {
      const workflowData = {
        tables,
        relationships,
        viewport
      };
      const newWorkflow = await savedWorkflowService.createSavedWorkflow({
        name: workflowName,
        workflow_data: workflowData
      });
      setActiveSavedWorkflowId(newWorkflow.id);
      setIsSaveModalOpen(false);
      setSidebarTab('saved_workflows');
      // Refresh list
      savedWorkflowService.getSavedWorkflows().then(setSavedWorkflows).catch(console.error);
    } catch (e) {
      console.error("Failed to save new workflow:", e);
      alert("Failed to save workflow.");
    }
  };

  const handleOpenSavedWorkflow = (workflow: SavedWorkflow) => {
    try {
      const { workflow_data } = workflow;
      if (workflow_data) {
        setTables(workflow_data.tables || []);
        setRelationships(workflow_data.relationships || []);
        if (workflow_data.viewport) setViewport(workflow_data.viewport);
        setActiveSavedWorkflowId(workflow.id);
      }
    } catch (e) {
      console.error("Failed to open workflow", e);
      alert("Failed to open workflow: " + (e as any).message);
    }
  };

  const handleDeleteSavedWorkflow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this saved workflow?")) return;
    try {
      await savedWorkflowService.deleteSavedWorkflow(id);
      setSavedWorkflows(prev => prev.filter(w => w.id !== id));
      if (activeSavedWorkflowId === id) setActiveSavedWorkflowId(null);
    } catch (e) {
      console.error("Failed to delete workflow", e);
    }
  };

  const handleSaveTable = (table: TableNode) => {
    // In a real app, this would send the SQL/definition to the backend
    alert(`Saving table definition for ${table.name}...\n\nColumns: ${table.columns.map(c => c.name).join(', ')}`);
  };

  const handleEditTable = (table: TableNode) => {
    if (!table.joinMetadata) return;

    const leftTable = tables.find(t => t.name === table.joinMetadata?.leftTable);
    const rightTable = tables.find(t => t.name === table.joinMetadata?.rightTable);

    if (!leftTable || !rightTable) {
      alert('Source tables not found!');
      return;
    }

    setJoinModalData({
      fromTableId: leftTable.id,
      fromColumnName: table.joinMetadata.leftColumn,
      toTableId: rightTable.id,
      toColumnName: table.joinMetadata.rightColumn,
      isEditing: true,
      editingTableId: table.id
    });

    setJoinForm({
      joinType: table.joinMetadata.joinType,
      filter: table.joinMetadata.filter || '',
      transform: table.joinMetadata.transform || ''
    });

    setShowJoinModal(true);
  };

  const toggleTableExpand = (tableId: string) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId ? { ...t, isExpanded: !t.isExpanded } : t
      )
    );
  };

  const handleColumnMouseDown = (
    e: React.MouseEvent,
    tableId: string,
    columnName: string
  ) => {
    e.stopPropagation();
    const pos = getColumnPortPos(tableId, tables.find((t) => t.id === tableId)?.columns.findIndex((c) => c.name === columnName) ?? 0, false);
    if (pos) {
      setDrawing({
        fromTableId: tableId,
        fromColumnName: columnName,
        startX: pos.x,
        startY: pos.y,
      });
    }
  };

  const handleColumnMouseUp = (
    e: React.MouseEvent,
    tableId: string,
    columnName: string
  ) => {
    e.stopPropagation();
    if (drawing && drawing.fromTableId !== tableId) {
      // Check if target is a transformation node
      const targetTable = tables.find(t => t.id === tableId);
      const sourceTable = tables.find(t => t.id === drawing.fromTableId);

      if (targetTable?.type === 'transformation') {
        // Check if this transformation node already has an input source
        const existingInputs = relationships.filter(r => r.toTableId === targetTable.id);
        const isJoin = targetTable.transformationType === 'Join';

        if (!isJoin && existingInputs.length > 0) {
          alert("This transformation node can only have one input source.");
          setDrawing(null);
          return;
        }

        // Enforce Flow: If source table is connected to a Filter, user must connect to Join via Filter
        if (isJoin && sourceTable) {
          const connectedFilters = relationships
            .filter(r => r.fromTableId === sourceTable.id)
            .map(r => tables.find(t => t.id === r.toTableId))
            .filter(t => t?.type === 'transformation' && (t.transformationCategory === 'filters' || t.transformationType === 'Filter'));

          if (connectedFilters.length > 0) {
            alert("This table is connected to a Filter. Please link the Filter node to the Join node.");
            setDrawing(null);
            return;
          }
        }

        // NEW: Mutually exclusive link for Column Transformation vs Filters/Joins
        if (sourceTable) {
          const currentOutgoing = relationships
            .filter(r => r.fromTableId === sourceTable.id)
            .map(r => tables.find(t => t.id === r.toTableId));

          const hasCT = currentOutgoing.some(t =>
            t?.transformationCategory === 'column_transformation' ||
            t?.transformationType === 'Type & Format'
          );

          const hasFilterOrJoin = currentOutgoing.some(t =>
            t?.transformationCategory === 'filters' ||
            t?.transformationType === 'Filter' ||
            t?.transformationCategory === 'joins' ||
            t?.transformationType === 'Join'
          );

          const isTargetFilterOrJoin =
            targetTable.transformationCategory === 'filters' ||
            targetTable.transformationType === 'Filter' ||
            targetTable.transformationCategory === 'joins' ||
            targetTable.transformationType === 'Join';

          const isTargetCT =
            targetTable.transformationCategory === 'column_transformation' ||
            targetTable.transformationType === 'Type & Format';

          // Case A: User tries to connect Table to a Filter or Join, but it already has a Column Transformation
          if (isTargetFilterOrJoin && hasCT) {
            alert("This table is already connected to a Column Transformation. Please use the Column Transformation node to apply your filters or joins instead.");
            setDrawing(null);
            return;
          }

          // Case B: User tries to connect Table to a Column Transformation, but it already has a Filter or Join
          if (isTargetCT && hasFilterOrJoin) {
            alert("This table is already connected to a Filter or Join. Please use a Column Transformation node for this workflow instead.");
            setDrawing(null);
            return;
          }
        }

        // Create the new relationship
        const newRel: JoinRelationship = {
          id: `rel-${Date.now()}-${Math.random()}`,
          fromTableId: drawing.fromTableId,
          fromColumnName: drawing.fromColumnName,
          toTableId: targetTable.id,
          toColumnName: 'output', // Transformation nodes typically take 'output' as general input
          joinType: 'inner',
          isEditing: false
        };

        // Always persist the relationship immediately so the line stays visible
        setRelationships((prev) => {
          const exists = prev.some(
            (r) =>
              r.fromTableId === newRel.fromTableId &&
              r.fromColumnName === newRel.fromColumnName &&
              r.toTableId === newRel.toTableId &&
              r.toColumnName === newRel.toColumnName
          );
          if (exists) return prev;
          return [...prev, newRel];
        });

        // --- NEW: Propagate columns to transformation node ---
        if (sourceTable) {
          setTables(prev => {
            // Need to account for the new relationship manually since setRelationships is async
            const updatedRels = [...relationships, newRel];
            const incoming = prev.filter(t =>
              updatedRels.some(r => r.toTableId === targetTable.id && r.fromTableId === t.id)
            );

            const nextCols = getOutputColumns(targetTable, incoming);
            const updatedWithTarget = prev.map(t =>
              t.id === targetTable.id ? { ...t, columns: nextCols } : t
            );

            return propagateSchemaChanges(targetTable.id, updatedWithTarget, updatedRels);
          });
        }

        setConfigTargetNode(targetTable);
        setConfigSourceNode(sourceTable || null);

        // Only open modal if it's NOT a join (joins need 2 inputs usually, so maybe wait? or user clicks config manually)
        // Actually, existing logic opened it. Let's keep it open.
        setConfigModalOpen(true);
      } else {
        // Regular join modal
        setShowJoinModal(true);
        setJoinModalData({
          fromTableId: drawing.fromTableId,
          fromColumnName: drawing.fromColumnName,
          toTableId: tableId,
          toColumnName: columnName,
        });
      }
    }
    setDrawing(null);
  };

  const deleteJoin = () => {
    if (!joinModalData || !joinModalData.editingTableId) return;
    const tableToDelete = tables.find((t) => t.id === joinModalData.editingTableId);
    if (!tableToDelete || !tableToDelete.joinMetadata) return;

    const { leftTable, rightTable, leftColumn, rightColumn } = tableToDelete.joinMetadata;

    const fromTable = tables.find((t) => t.name === leftTable);
    const toTable = tables.find((t) => t.name === rightTable);

    if (fromTable && toTable) {
      setRelationships((prev) =>
        prev.filter((r) => {
          const isSourceRel =
            r.fromTableId === fromTable.id &&
            r.toTableId === toTable.id &&
            r.fromColumnName === leftColumn &&
            r.toColumnName === rightColumn;
          const isLineageRel =
            r.fromTableId === tableToDelete.id || r.toTableId === tableToDelete.id;
          return !isSourceRel && !isLineageRel;
        })
      );
    }

    setTables((prev) => prev.filter((t) => t.id !== tableToDelete.id));
    setShowJoinModal(false);
    setJoinModalData(null);
    setJoinForm({ joinType: 'inner', filter: '', transform: '' });
  };

  const confirmJoin = () => {
    if (!joinModalData) return;

    if (joinModalData.isEditing && joinModalData.editingTableId) {
      // EDIT MODE
      const { editingTableId } = joinModalData;
      const tableToEdit = tables.find((t) => t.id === editingTableId);

      if (tableToEdit && tableToEdit.joinMetadata) {
        const oldLeftColumn = tableToEdit.joinMetadata.leftColumn;
        const oldRightColumn = tableToEdit.joinMetadata.rightColumn;
        const oldLeftTableName = tableToEdit.joinMetadata.leftTable;
        const oldRightTableName = tableToEdit.joinMetadata.rightTable;

        const fromTable = tables.find(t => t.name === oldLeftTableName);
        const toTable = tables.find(t => t.name === oldRightTableName);

        // 1. Update the Derived Table Metadata
        setTables((prev) =>
          prev.map((t) => {
            if (t.id === editingTableId) {
              return {
                ...t,
                joinMetadata: {
                  ...t.joinMetadata!,
                  joinType: joinForm.joinType,
                  filter: joinForm.filter,
                  transform: joinForm.transform,
                  leftColumn: joinModalData.fromColumnName,
                  rightColumn: joinModalData.toColumnName
                },
              };
            }
            return t;
          })
        );

        // 2. Update the Relationship between the source tables
        if (fromTable && toTable) {
          setRelationships((prev) =>
            prev.map((r) => {
              if (
                r.fromTableId === fromTable.id &&
                r.toTableId === toTable.id &&
                r.fromColumnName === oldLeftColumn &&
                r.toColumnName === oldRightColumn
              ) {
                return {
                  ...r,
                  fromColumnName: joinModalData.fromColumnName,
                  toColumnName: joinModalData.toColumnName,
                  joinType: joinForm.joinType as any,
                  filterCondition: joinForm.filter || undefined,
                  transformations: joinForm.transform || undefined,
                };
              }
              return r;
            })
          );
        }
      }
    } else {
      // CREATE MODE
      const rel: JoinRelationship = {
        id: `rel-${Date.now()}`,
        fromTableId: joinModalData.fromTableId,
        fromColumnName: joinModalData.fromColumnName,
        toTableId: joinModalData.toTableId,
        toColumnName: joinModalData.toColumnName,
        joinType: joinForm.joinType as any,
        filterCondition: joinForm.filter || undefined,
        transformations: joinForm.transform || undefined,
      };

      // Create derived table
      const fromTable = tables.find((t) => t.id === joinModalData.fromTableId);
      const toTable = tables.find((t) => t.id === joinModalData.toTableId);

      if (fromTable && toTable) {
        // Prefix columns to ensure uniqueness and clarity in the derived table
        const derivedColumns = [
          ...fromTable.columns.map((c) => ({
            ...c,
            name: `${fromTable.name}.${c.name}`,
          })),
          ...toTable.columns.map((c) => ({
            ...c,
            name: `${toTable.name}.${c.name}`,
          })),
        ];

        const derivedTableId = `derived-${Date.now()}`;
        const derivedTable: TableNode = {
          id: derivedTableId,
          type: 'derived',
          name: `${fromTable.name}_${toTable.name}_joined`,
          columns: derivedColumns,
          isExpanded: true,
          x: (fromTable.x + toTable.x) / 2,
          y: (fromTable.y + toTable.y) / 2 + 200,
          joinMetadata: {
            joinType: joinForm.joinType,
            leftTable: fromTable.name,
            rightTable: toTable.name,
            leftColumn: joinModalData.fromColumnName,
            rightColumn: joinModalData.toColumnName,
            filter: joinForm.filter,
            transform: joinForm.transform,
          },
        };

        setTables((prev) => [...prev, derivedTable]);

        // Create lineage relationships (all columns)
        const newRelationships: JoinRelationship[] = [];

        // From Table -> Derived
        fromTable.columns.forEach((col) => {
          newRelationships.push({
            id: `lineage-${fromTable.id}-${col.name}-${derivedTableId}`,
            fromTableId: fromTable.id,
            fromColumnName: col.name,
            toTableId: derivedTableId,
            toColumnName: `${fromTable.name}.${col.name}`,
            joinType: 'inner', // Lineage is always a direct flow
          });
        });

        // To Table -> Derived
        toTable.columns.forEach((col) => {
          newRelationships.push({
            id: `lineage-${toTable.id}-${col.name}-${derivedTableId}`,
            fromTableId: toTable.id,
            fromColumnName: col.name,
            toTableId: derivedTableId,
            toColumnName: `${toTable.name}.${col.name}`,
            joinType: 'inner',
          });
        });

        setRelationships((prev) => [...prev, rel, ...newRelationships]);
      } else {
        setRelationships((prev) => [...prev, rel]);
      }
    }

    setShowJoinModal(false);
    setJoinModalData(null);
    setJoinForm({ joinType: 'inner', filter: '', transform: '' });
  };

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>, tableId: string) => {
    const scrollTop = e.currentTarget.scrollTop;
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, scrollTop } : t))
    );
  };

  const getColumnPortPos = (tableId: string, columnIndex: number, isInput: boolean = false): { x: number; y: number } | null => {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return null;

    // Calculate header height based on type
    // Dataset: ~46px (padding + text)
    // Database/Derived: ~66px (padding + text + source)
    const headerHeight = table.type === 'dataset' ? 46 : 66;

    // If table is collapsed, return header-level ports
    if (!table.isExpanded) {
      return {
        x: isInput ? table.x : table.x + (table.type === 'transformation' ? 240 : 320),
        y: table.y + (headerHeight / 2)
      };
    }

    const columnHeight = 33; // 32px content + 1px border
    const scrollTop = table.scrollTop || 0;

    // Calculate position relative to table top
    // Header + (Index * RowHeight) + (RowHeight / 2) - Scroll
    const relativeY = headerHeight + (columnIndex * columnHeight) + (columnHeight / 2) - scrollTop;

    // Optional: Clamp to visible area if needed, but for now let it float
    // If we wanted to hide lines for scrolled-out columns, we'd return null here if relativeY < headerHeight or relativeY > headerHeight + 320 (max-h-80)

    return {
      x: isInput ? table.x : table.x + (table.type === 'transformation' ? 240 : 320),
      y: table.y + relativeY,
    };
  };

  // New helper: getTablePortPos returns the single input/output port per table
  const getTablePortPos = (tableId: string, port: 'input' | 'output') => {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return null;

    const tableWidth = table.type === 'transformation' ? 240 : 320;
    const headerHeight = table.type === 'dataset' ? 46 : 66;

    // Calculate center Y position of the header/node
    const centerY = table.y + headerHeight / 2;

    if (port === 'input') {
      // Left side, center of node
      return { x: table.x, y: centerY };
    }
    // Right side, center of node
    return { x: table.x + tableWidth, y: centerY };
  };

  const handleRunWorkflow = async () => {
    // 1. Identify valid output node (same logic as generateWorkflowSQL)
    const activeSourceIds = new Set(relationships.map(r => r.fromTableId));
    const outputNode = tables.find(t => !activeSourceIds.has(t.id) && (t.type === 'derived' || t.type === 'transformation'))
      || tables.find(t => !activeSourceIds.has(t.id))
      || tables[tables.length - 1];

    if (!outputNode) {
      alert("No output node identified to run.");
      return;
    }

    const sql = generateWorkflowSQL(tables, relationships, allConnections);

    // 2. Identify Reachable Nodes (only nodes contributing to the SQL)
    const reachableNodeIds = new Set<string>();
    const nodesToVisit = [outputNode.id];
    const visited = new Set<string>();

    while (nodesToVisit.length > 0) {
      const currentId = nodesToVisit.pop()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      reachableNodeIds.add(currentId);

      const inputs = relationships.filter(r => r.toTableId === currentId);
      inputs.forEach(r => nodesToVisit.push(r.fromTableId));

      const node = tables.find(t => t.id === currentId);
      if (node?.transformationConfig) {
        const cfg = node.transformationConfig;
        if (cfg.leftTableId) nodesToVisit.push(cfg.leftTableId);
        if (cfg.rightTableId) nodesToVisit.push(cfg.rightTableId);
      }
    }

    // 3. Prepare sources (Pruned to only used nodes)
    const sources: any[] = [];
    tables.forEach(node => {
      if (!reachableNodeIds.has(node.id)) return;

      if (node.type === 'database_table' && node.connectionId) {
        const conn = allConnections.find(c => c.id === node.connectionId);
        const dbName = conn?.name || node.source;
        const alias = `${dbName}.${node.name}`.toLowerCase();
        if (!sources.some(s => s.alias === alias)) {
          sources.push({
            alias,
            type: 'connection',
            id: node.connectionId,
            source_identifier: node.tableName || node.name
          });
        }
      } else if (node.type === 'dataset') {
        const datasetId = node.id.replace('ds-', '');
        const alias = `uploaded_files.${node.name}`.toLowerCase();
        if (!sources.some(s => s.alias === alias)) {
          sources.push({
            alias,
            type: 'dataset',
            id: datasetId
          });
        }
      }
    });

    setIsExecuting(true);
    setExecutionError(null);
    setQueryResult(null);
    setResultsPanelOpen(true);
    setLastExecutedQuery(sql);
    setLastExecutedSources(sources);

    try {
      const result = await queryService.executeQuery({
        query: sql,
        sources,
        page: 1,
        page_size: 100
      });
      setQueryResult(result);
    } catch (err: any) {
      console.error('Workflow execution failed:', err);
      setExecutionError(err.response?.data?.detail || err.message || 'Execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* SIDEBAR */}
      <div className="w-80 border-r-2 border-slate-300 flex flex-col overflow-hidden shadow-xl" style={{
        background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)'
      }}>
        <div className="p-6 border-b-2 border-slate-300 shadow-md" style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)'
        }}>
          <h2 className="font-bold text-white text-base flex items-center gap-2">🧩 WORKFLOW BUILDER</h2>
          <p className="text-xs text-blue-100 mt-2">Drag tables to canvas to build lineage</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-white">
          <button
            onClick={() => setSidebarTab('data_sources')}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${sidebarTab === 'data_sources'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
          >
            Data Sources
          </button>
          <button
            onClick={() => setSidebarTab('saved_workflows')}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${sidebarTab === 'saved_workflows'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
          >
            Saved Workflows
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: '12px' }}>
          {sidebarTab === 'data_sources' ? (
            <>
              {/* Database Connections */}
              {visibleConnections.length > 0 && visibleConnections.map((conn) => (
                <div key={conn.id} style={{ marginBottom: '8px' }}>
                  <button
                    onClick={() => toggleConnection(conn.id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:shadow-md transition-all font-semibold"
                    style={{
                      border: '1px solid #e2e8f0',
                      background: expandedConns.has(conn.id)
                        ? '#f8fafc'
                        : '#ffffff'
                    }}
                  >
                    <span className="flex items-center gap-2 truncate" style={{ minWidth: 0 }}>
                      <span className="text-base" style={{ color: '#64748b' }}>🗄️</span>
                      <span className="truncate" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.name}</span>
                    </span>
                    <span className="text-xs" style={{ color: '#64748b', flexShrink: 0 }}>
                      {expandedConns.has(conn.id) ? '▼' : '▶'}
                    </span>
                  </button>
                  {expandedConns.has(conn.id) && (
                    <div style={{ marginTop: '6px', marginLeft: '8px' }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, padding: '6px 8px' }}>
                        TABLES
                      </div>
                      {connectionTables[conn.id]?.length ? (
                        connectionTables[conn.id].map((tableName) => (
                          <div
                            key={tableName}
                            className="group relative"
                            style={{ marginBottom: '4px' }}
                          >
                            <div
                              draggable
                              onDragStart={(e) =>
                                handleDragStart(e, {
                                  id: tableName,
                                  name: tableName,
                                  type: 'database_table',
                                  connectionId: conn.id,
                                  sourceName: conn.name,
                                })
                              }
                              style={{
                                padding: '8px 12px',
                                paddingRight: '40px',
                                fontSize: '11px',
                                borderRadius: '8px',
                                cursor: 'grab',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                              className="hover:bg-slate-50"
                              title={tableName}
                            >
                              <span style={{ fontSize: '12px', flexShrink: 0 }}>📋</span>
                              <span style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                minWidth: 0
                              }}>{tableName}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewData('database', tableName, tableName, conn.id);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded text-xs font-bold z-10"
                              title="Preview data"
                            >
                              ...
                            </button>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '8px 12px', fontSize: '11px', color: '#94a3b8' }}>
                          Loading tables...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Uploaded Files - Single Collapsible Group */}
              {visibleUploadedFiles.length > 0 && (
                <div style={{ marginTop: visibleConnections.length > 0 ? '8px' : '0', marginBottom: '8px' }}>
                  <button
                    onClick={() => setUploadedFilesExpanded(!uploadedFilesExpanded)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:shadow-md transition-all font-semibold"
                    style={{
                      border: '1px solid #e2e8f0',
                      background: '#ffffff'
                    }}
                  >
                    <span className="flex items-center gap-2 truncate" style={{ minWidth: 0 }}>
                      <span className="text-base" style={{ color: '#64748b' }}>📁</span>
                      <span className="truncate" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Uploaded Files</span>
                    </span>
                    <span className="text-xs" style={{ color: '#64748b', flexShrink: 0 }}>
                      {uploadedFilesExpanded ? '▼' : '▶'}
                    </span>
                  </button>
                  {uploadedFilesExpanded && (
                    <div style={{ marginTop: '6px', marginLeft: '8px' }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, padding: '6px 8px' }}>
                        FILES
                      </div>
                      {visibleUploadedFiles.map((ds: any) => {
                        const displayName = ds.original_filename || ds.name;
                        return (
                          <div
                            key={ds.id}
                            className="group relative"
                            style={{ marginBottom: '4px' }}
                          >
                            <div
                              draggable
                              onDragStart={(e) =>
                                handleDragStart(e, { id: ds.id, name: displayName, type: 'dataset', dataset: ds })
                              }
                              style={{
                                padding: '8px 12px',
                                paddingRight: '40px',
                                fontSize: '11px',
                                borderRadius: '8px',
                                cursor: 'grab',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                              className="hover:bg-slate-50"
                              title={displayName}
                            >
                              <span style={{ fontSize: '12px', flexShrink: 0 }}>📄</span>
                              <span style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                minWidth: 0
                              }}>{displayName}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewData('dataset', String(ds.id), displayName);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded text-xs font-bold z-10"
                              title="Preview data"
                            >
                              ...
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Separator Line */}
              {(visibleConnections.length > 0 || visibleUploadedFiles.length > 0) && (
                <div style={{ borderTop: '2px solid #cbd5e1', marginTop: '12px', marginBottom: '12px' }}></div>
              )}

              {/* Transformations Section */}
              <div style={{ marginBottom: '8px' }}>
                <button
                  onClick={() => setTransformationsExpanded(!transformationsExpanded)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:shadow-md transition-all font-semibold"
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#ffffff'
                  }}
                >
                  <span className="flex items-center gap-2 truncate" style={{ minWidth: 0 }}>
                    <span className="text-base" style={{ color: '#64748b' }}>⚙️</span>
                    <span className="truncate" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Transformations</span>
                  </span>
                  <span className="text-xs" style={{ color: '#64748b', flexShrink: 0 }}>
                    {transformationsExpanded ? '▼' : '▶'}
                  </span>
                </button>
                {transformationsExpanded && (
                  <div style={{ marginTop: '6px', marginLeft: '8px' }}>
                    <div
                      key={'filters'}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'transformation',
                          category: 'filters',
                          operation: 'Filter'
                        }));
                      }}
                      style={{
                        padding: '8px 12px',
                        fontSize: '11px',
                        borderRadius: '8px',
                        cursor: 'grab',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff'
                      }}
                      className="hover:bg-slate-50 hover:shadow-md transition-all"
                      title={`Drag to canvas: Filter`}
                    >
                      <span style={{ fontSize: '12px' }}>🔍</span>
                      <span>Filter</span>
                    </div>
                    <div
                      key={'joins'}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'transformation',
                          category: 'joins',
                          operation: 'Join'
                        }));
                      }}
                      style={{
                        padding: '8px 12px',
                        fontSize: '11px',
                        borderRadius: '8px',
                        cursor: 'grab',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff'
                      }}
                      className="hover:bg-slate-50 hover:shadow-md transition-all"
                      title={`Drag to canvas: Join`}
                    >
                      <span style={{ fontSize: '12px' }}>🔗</span>
                      <span>Join</span>
                    </div>
                    <div
                      key={'column_transformation'}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'transformation',
                          category: 'column_transformation',
                          operation: 'Type & Format'
                        }));
                      }}
                      style={{
                        padding: '8px 12px',
                        fontSize: '11px',
                        borderRadius: '8px',
                        cursor: 'grab',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff'
                      }}
                      className="hover:bg-slate-50 hover:shadow-md transition-all"
                      title={`Drag to canvas: Column Transformation`}
                    >
                      <span style={{ fontSize: '12px' }}>📊</span>
                      <span>Column Transformation</span>
                    </div>
                    <div
                      key={'aggregate'}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'transformation',
                          category: 'aggregate',
                          operation: 'Aggregate'
                        }));
                      }}
                      style={{
                        padding: '8px 12px',
                        fontSize: '11px',
                        borderRadius: '8px',
                        cursor: 'grab',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff'
                      }}
                      className="hover:bg-slate-50 hover:shadow-md transition-all"
                      title={`Drag to canvas: Aggregate`}
                    >
                      <span style={{ fontSize: '12px' }}>📈</span>
                      <span>Aggregate</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              {savedWorkflows.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-slate-500">No saved workflows found.</p>
                </div>
              ) : (
                savedWorkflows.map(workflow => (
                  <div
                    key={workflow.id}
                    onClick={() => handleOpenSavedWorkflow(workflow)}
                    className={`group flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${activeSavedWorkflowId === workflow.id
                      ? 'bg-blue-50 border-blue-200 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
                      }`}
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className={`text-sm font-semibold truncate ${activeSavedWorkflowId === workflow.id ? 'text-blue-700' : 'text-slate-700'}`}>
                        {workflow.name}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                        <span>{new Date(workflow.updated_at || workflow.created_at).toLocaleDateString()}</span>
                        {activeSavedWorkflowId === workflow.id && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-medium">Active</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSavedWorkflow(workflow.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                      title="Delete workflow"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* MAIN CANVAS */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between shadow-sm">
          <div>
            <h1 className="font-bold text-slate-800 text-lg">Data Lineage</h1>
            <p className="text-xs text-slate-600">Visualize data flow and relationships</p>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setTables([])}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-all font-medium"
            >
              Clear Canvas
            </button>
            <button
              onClick={handleRunWorkflow}
              disabled={isExecuting || tables.length === 0}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg shadow-sm transition-all font-medium ${isExecuting || tables.length === 0
                ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              title="Run Workflow"
              style={{ fontSize: '16px' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-5 h-5 ${isExecuting ? 'animate-spin' : ''}`}>
                {isExecuting ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18l15-9L5 3z" />
                )}
              </svg>
              <span>{isExecuting ? 'Running...' : 'Run Workflow'}</span>
            </button>
            <button
              onClick={handleSaveLineage}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium shadow-sm"
            >
              Save Lineage
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseDown={handleCanvasMouseDown}
          onWheel={handleWheel}
          onClick={() => {
            setSelectedTableId(null);
            setDrawing(null); // Cancel any active drawing
          }}
          className="flex-1 relative bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 overflow-hidden cursor-grab active:cursor-grabbing"
        >
          {/* Transform Container */}
          <div
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              transformOrigin: '0 0',
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0
            }}
          >
            {/* Grid Background */}
            <div
              className="absolute inset-0 pointer-events-none opacity-50"
              style={{
                backgroundImage: 'radial-gradient(circle, #94a3b8 1.5px, transparent 1.5px)',
                backgroundSize: '28px 28px',
                width: '10000px', // Large enough to cover pan
                height: '10000px',
                transform: 'translate(-5000px, -5000px)' // Center the grid
              }}
            />

            {/* SVG Relationships */}
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 1,
                width: '100%',
                height: '100%',
                overflow: 'visible'
              }}
            >
              {/* Debugging: Log relationships length and missing mappings in dev mode */}
              {import.meta.env.MODE !== 'production' && (() => {
                try {
                  // eslint-disable-next-line no-console
                  console.debug('Relationships:', relationships.length, 'Tables:', tables.length);
                  relationships.forEach((r) => {
                    const f = tables.find((t) => t.id === r.fromTableId);
                    const t = tables.find((t2) => t2.id === r.toTableId);
                    if (!f || !t) {
                      // eslint-disable-next-line no-console
                      console.warn('Relationship has missing table:', r.id, { fromFound: !!f, toFound: !!t });
                    }
                  });
                } catch (e) { }
                return null;
              })()}

              {relationships.map((rel) => {
                const fromTable = tables.find((t) => t.id === rel.fromTableId);
                const toTable = tables.find((t) => t.id === rel.toTableId);
                if (!fromTable || !toTable) return null;

                // Compute anchor positions: if relationship endpoints reference table-level ports
                // (we use names 'input' and 'output' for those) then use getTablePortPos.
                const isFromTablePort = rel.fromColumnName === 'input' || rel.fromColumnName === 'output';
                const isToTablePort = rel.toColumnName === 'input' || rel.toColumnName === 'output';

                const fromPos = isFromTablePort
                  ? getTablePortPos(rel.fromTableId, rel.fromColumnName === 'input' ? 'input' : 'output')
                  : (() => {
                    const idx = fromTable.columns.findIndex((c) => c.name === rel.fromColumnName);
                    if (idx === -1) return getTablePortPos(rel.fromTableId, 'output');
                    return getColumnPortPos(rel.fromTableId, idx, false);
                  })();

                const toPos = isToTablePort
                  ? getTablePortPos(rel.toTableId, rel.toColumnName === 'input' ? 'input' : 'output')
                  : (() => {
                    const idx = toTable.columns.findIndex((c) => c.name === rel.toColumnName);
                    if (idx === -1) return getTablePortPos(rel.toTableId, 'input');
                    return getColumnPortPos(rel.toTableId, idx, true);
                  })();

                if (!fromPos || !toPos) return null;

                const midX = (fromPos.x + toPos.x) / 2;
                const path = `M ${fromPos.x} ${fromPos.y} C ${midX} ${fromPos.y}, ${midX} ${toPos.y}, ${toPos.x} ${toPos.y}`;

                return (
                  <g key={rel.id}>
                    <path d={path} stroke="#94a3b8" strokeWidth="2" fill="none" />
                    {/* Start Dot */}
                    <circle cx={fromPos.x} cy={fromPos.y} r="4" fill="#64748b" stroke="white" strokeWidth="1.5" />
                    {/* End Dot */}
                    <circle cx={toPos.x} cy={toPos.y} r="4" fill="#64748b" stroke="white" strokeWidth="1.5" />
                  </g>
                );
              })}

              {/* Drawing line */}
              {drawing && (
                <path
                  d={`M ${drawing.startX} ${drawing.startY} L ${mousePos.x} ${mousePos.y}`}
                  stroke="#10b981"
                  strokeWidth="2.5"
                  fill="none"
                  strokeDasharray="6,4"
                  opacity="0.8"
                />
              )}
            </svg>

            {/* Tables */}
            {tables.map((table) => (
              <div
                key={table.id}
                className={`absolute rounded-xl overflow-hidden transition-shadow ${selectedTableId === table.id
                  ? 'border-3 border-blue-600 shadow-2xl shadow-blue-400/40'
                  : 'border-2 border-slate-400 shadow-xl hover:shadow-2xl'
                  }`}
                style={{
                  left: `${table.x}px`,
                  top: `${table.y}px`,
                  width: table.type === 'transformation' ? '240px' : 'auto',
                  minWidth: table.type === 'transformation' ? '240px' : '320px',
                  maxWidth: table.type === 'transformation' ? '240px' : '480px',
                  backgroundColor: table.type === 'transformation' ? '#3b82f6' : '#ffffff',
                  zIndex: selectedTableId === table.id ? 50 : 10,
                  transform: selectedTableId === table.id ? 'scale(1.02)' : 'scale(1)',
                }}
                onMouseDown={(e) => handleTableMouseDown(e, table.id)}
              >
                {/* Transformation Node Rendering */}
                {table.type === 'transformation' ? (
                  <div className="p-6 text-center relative">
                    {/* Add Another Filter Button */}
                    {/* Add Another Filter Button - Hide for Joins */
                      (table.transformationType !== 'Join' && table.transformationCategory !== 'joins') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const incomingRel = relationships.find(r => r.toTableId === table.id);
                            const sourceNode = incomingRel ? tables.find(t => t.id === incomingRel.fromTableId) : null;

                            setConfigTargetNode({ ...table });
                            setConfigSourceNode(sourceNode ? { ...sourceNode, transformationConfig: table.transformationConfig } : { ...table });
                            setConfigModalOpen(true);
                          }}
                          className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-lg shadow hover:bg-blue-200 transition-all font-semibold"
                          title="Add another operation"
                        >
                          {table.transformationCategory === 'column_transformation' ? '+ Add Transformation' :
                            table.transformationCategory === 'filters' ? '+ Add Filter' : '+ Add Operation'}
                        </button>
                      )}
                    {/* Delete Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTables((prev) => prev.filter((t) => t.id !== table.id));
                        setRelationships((prev) => prev.filter((r) => r.fromTableId !== table.id && r.toTableId !== table.id));
                      }}
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-white/90 hover:bg-red-500 text-slate-600 hover:text-white rounded-full shadow-md transition-all font-bold text-sm"
                      title="Remove transformation"
                    >
                      ×
                    </button>

                    {/* Edit Gear Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Always use the current config and columns for the modal
                        const incomingRel = relationships.find(r => r.toTableId === table.id);
                        const sourceNode = incomingRel ? tables.find(t => t.id === incomingRel.fromTableId) : null;
                        setConfigTargetNode({ ...table });
                        // Pass the transformationConfig explicitly for editing
                        setConfigSourceNode(sourceNode ? { ...sourceNode, transformationConfig: table.transformationConfig } : { ...table });
                        setConfigModalOpen(true);
                      }}
                      className="absolute top-2 left-2 w-6 h-6 flex items-center justify-center bg-white/90 hover:bg-blue-500 text-slate-600 hover:text-white rounded-full shadow-md transition-all font-bold text-sm"
                      title="Edit"
                      aria-label="Edit"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.25 2.25 0 1 1 3.182 3.182l-11.25 11.25a2.25 2.25 0 0 1-1.012.57l-3.75.938a.375 0 0 1-.457-.457l.938-3.75a2.25 2.25 0 0 1 .57-1.012l11.25-11.25z" />
                      </svg>
                    </button>

                    <h3 className="font-bold text-white text-base mb-8">{table.name}</h3>

                    {/* Input Connection Point */}
                    <div
                      data-port={`${table.id}:input`}
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-blue-600 cursor-crosshair hover:scale-125 transition-all shadow-lg"
                      onMouseUp={(e) => {
                        e.stopPropagation();
                        // Treat as table-level input
                        handleColumnMouseUp(e, table.id, 'input');
                      }}
                      title="Connect input here"
                    />

                    {/* Output Connection Point */}
                    <div
                      data-port={`${table.id}:output`}
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-blue-600 cursor-crosshair hover:scale-125 transition-all shadow-lg"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleColumnMouseDown(e, table.id, 'output');
                      }}
                      title="Drag to connect output"
                    />
                  </div>
                ) : (
                  <div className="table-inner">
                    {/* Header */}
                    <div
                      className={`px-4 py-3 cursor-move border-b border-slate-200 shadow-sm relative ${table.type === 'derived'
                        ? 'bg-yellow-400'
                        : table.type === 'database_table'
                          ? 'bg-orange-400'
                          : 'bg-blue-400'
                        }`}
                      onDoubleClick={() => toggleTableExpand(table.id)}
                    >
                      {/* Delete Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTables((prev) => prev.filter((t) => t.id !== table.id));
                          setRelationships((prev) => prev.filter((r) => r.fromTableId !== table.id && r.toTableId !== table.id));
                        }}
                        className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-white/90 hover:bg-red-500 text-slate-600 hover:text-white rounded-full shadow-md transition-all font-bold text-xs z-10"
                        title="Remove table"
                      >
                        ×
                      </button>

                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2 mb-1">
                            <h3
                              className="font-bold text-slate-900 text-sm tracking-tight truncate"
                              title={table.name}
                            >
                              {table.name}
                            </h3>
                          </div>
                          {table.source && (
                            <p className="text-xs text-slate-800/70 flex items-center gap-1 font-medium truncate" title={table.source}>
                              {table.source}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pr-6">
                          {(table.type === 'derived' || table.type === 'dataset' || table.type === 'database_table') && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (table.type === 'derived') {
                                    handleEditTable(table);
                                  } else {
                                    setColumnModalTargetNode(table);
                                    setColumnModalOpen(true);
                                  }
                                }}
                                className="p-1 hover:bg-black/10 rounded text-slate-800"
                                title={table.type === 'derived' ? "Edit Join" : "Select Columns"}
                              >
                                ✏️
                              </button>
                              {table.type === 'derived' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSaveTable(table);
                                  }}
                                  className="p-1 hover:bg-black/10 rounded text-slate-800"
                                  title="Save Table"
                                >
                                  💾
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => toggleTableExpand(table.id)}
                            className="text-slate-800 hover:text-black transition-colors"
                          >
                            {table.isExpanded ? '▼' : '▶'}
                          </button>
                        </div>
                      </div>
                      {/* Table-level input/output ports positioned in header so they stay centered on header */}
                      <div
                        data-port={`${table.id}:input`}
                        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border border-slate-300 cursor-crosshair transition-all bg-white"
                        onMouseUp={(e) => { e.stopPropagation(); handleColumnMouseUp(e, table.id, 'input'); }}
                        title="Connect input"
                      />
                      <div
                        data-port={`${table.id}:output`}
                        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full border border-slate-300 cursor-crosshair transition-all bg-white"
                        onMouseDown={(e) => { e.stopPropagation(); handleColumnMouseDown(e, table.id, 'output'); }}
                        title="Connect output"
                      />
                    </div>

                    {/* Join Metadata Info */}
                    {table.joinMetadata && table.isExpanded && (
                      <div className="px-4 py-2 bg-yellow-100 border-b border-yellow-200 text-xs text-slate-800">
                        <div className="font-bold mb-1">Join Details:</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                          <span className="text-slate-600">Type:</span>
                          <span className="font-mono uppercase">{table.joinMetadata.joinType}</span>
                          <span className="text-slate-600">Left:</span>
                          <span className="truncate" title={table.joinMetadata.leftColumn}>{table.joinMetadata.leftColumn}</span>
                          <span className="text-slate-600">Right:</span>
                          <span className="truncate" title={table.joinMetadata.rightColumn}>{table.joinMetadata.rightColumn}</span>
                        </div>
                      </div>
                    )}

                    {/* table-level ports now rendered inside the header above */}

                    {/* Columns */}
                    {table.isExpanded && (
                      <div
                        className={`max-h-80 overflow-y-auto divide-y divide-slate-200/50 ${table.type === 'derived'
                          ? 'bg-yellow-50'
                          : table.type === 'database_table'
                            ? 'bg-orange-50'
                            : 'bg-blue-50'
                          }`}
                        onScroll={(e) => handleTableScroll(e, table.id)}
                      >
                        {table.columns.length > 0 ? (
                          table.columns.map((col, idx) => (
                            <div
                              key={`${col.name}-${idx}`}
                              data-port={`${table.id}:${col.name}`}
                              className="px-4 py-2 text-xs flex items-center justify-between hover:bg-white/50 group relative transition-all border-b border-slate-100 last:border-0"
                              title={`${col.type}${col.nullable ? ' (nullable)' : ''}`}
                              onMouseDown={(e) => { e.stopPropagation(); handleColumnMouseDown(e, table.id, col.name); }}
                              onMouseUp={(e) => { e.stopPropagation(); handleColumnMouseUp(e, table.id, col.name); }}
                              style={{ cursor: 'crosshair' }}
                            >
                              <div className="flex-1 flex items-center gap-2">
                                <div className="flex flex-col">
                                  <span className="text-slate-700 font-medium truncate">{col.name}</span>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-6 text-center text-xs text-slate-400 bg-white">
                            No columns available
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

          </div>
        </div>

        {/* Results Panel */}
        {resultsPanelOpen && (
          <div className="h-80 bg-white border-t border-slate-200 flex flex-col shadow-2xl z-20 w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center">
                <button
                  onClick={() => setResultsTab('results')}
                  className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-all relative ${resultsTab === 'results'
                    ? 'text-blue-600'
                    : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                  Results
                  {resultsTab === 'results' && (
                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>
                  )}
                </button>
                <button
                  onClick={() => setResultsTab('query')}
                  className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-all relative ${resultsTab === 'query'
                    ? 'text-blue-600'
                    : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                  Generated Query
                  {resultsTab === 'query' && (
                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>
                  )}
                </button>
                {queryResult && (
                  <span className="text-[11px] text-slate-400 font-bold ml-4">
                    • {queryResult.row_count.toLocaleString()} rows • {Math.round(queryResult.execution_time_ms)}ms
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button
                    onClick={() => {
                      if (!queryResult) return;
                      setIsVisualizeMenuOpen(!isVisualizeMenuOpen);
                    }}
                    disabled={!queryResult}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${queryResult
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                  >
                    <BarChart2 size={14} />
                    <span>Visualize</span>
                    <ChevronDown size={12} />
                  </button>

                  {isVisualizeMenuOpen && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden py-1">
                      <button
                        onClick={() => {
                          setVisualizeMode('sql_direct');
                          setIsVisualizeOpen(true);
                          setIsVisualizeMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                      >
                        <span className="text-blue-500">⚡</span> Quick Chart
                      </button>
                      <button
                        onClick={() => {
                          setVisualizeMode('config');
                          setIsVisualizeOpen(true);
                          setIsVisualizeMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 border-t border-slate-100"
                      >
                        <span className="text-indigo-500">⚙️</span> Configuration Mode
                      </button>
                    </div>
                  )}
                </div>

                <div className="w-px h-6 bg-slate-200 mx-1"></div>

                <button
                  onClick={() => setResultsPanelOpen(false)}
                  className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all group"
                  title="Close results"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400 group-hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden bg-slate-50 relative">
              {resultsTab === 'results' ? (
                /* Results Section */
                <div className="h-full overflow-auto">
                  {isExecuting ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 bg-white/60 backdrop-blur-[2px]">
                      <div className="relative">
                        <div className="w-12 h-12 border-4 border-slate-200 rounded-full"></div>
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                      </div>
                      <p className="text-sm font-bold text-slate-700 animate-pulse tracking-tight">Executing workflow query...</p>
                    </div>
                  ) : executionError ? (
                    <div className="p-8 flex justify-center">
                      <div className="bg-white border-2 border-red-100 rounded-2xl p-6 shadow-xl max-w-2xl w-full flex gap-5">
                        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-2xl text-red-500">❌</span>
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-lg mb-1 italic">Query Failed</h4>
                          <p className="text-sm font-mono text-red-600 bg-red-50/50 p-3 rounded-lg border border-red-100/50 break-all">{executionError}</p>
                        </div>
                      </div>
                    </div>
                  ) : queryResult ? (
                    queryResult.rows.length > 0 ? (
                      <div className="min-w-full inline-block align-middle">
                        <table className="min-w-full border-collapse bg-white">
                          <thead className="sticky top-0 bg-white/95 backdrop-blur-md shadow-sm z-10 transition-shadow">
                            <tr>
                              <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50 w-12 border-r border-slate-100">#</th>
                              {queryResult.columns.map((col: string) => (
                                <th key={col} className="px-6 py-4 text-left text-[11px] font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 bg-white/80 whitespace-nowrap min-w-[120px]">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {queryResult.rows.map((row: any, i: number) => (
                              <tr key={i} className="hover:bg-indigo-50/30 transition-all group">
                                <td className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-300 group-hover:text-indigo-400 border-r border-slate-50 bg-slate-50/30 font-mono italic">{i + 1}</td>
                                {queryResult.columns.map((col: string) => (
                                  <td key={col} className="px-6 py-2.5 text-sm text-slate-700 whitespace-nowrap max-w-[300px] truncate border-r border-slate-50/50 last:border-r-0" title={String(row[col])}>
                                    {row[col] === null ? <span className="text-slate-300 italic font-mono text-xs">NULL</span> : String(row[col])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="p-4 text-center border-t border-slate-100 bg-white shadow-inner">
                          <p className="text-[10px] uppercase font-black text-slate-400 tracking-tighter">End of Results</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-white/50">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100 shadow-inner">
                          <span className="text-2xl opacity-40">∅</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-600 uppercase tracking-widest mb-1">No Results Found</h4>
                        <p className="text-xs text-slate-400 font-medium">The query executed successfully but returned 0 rows.</p>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50/50">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-200">
                        <span className="text-2xl opacity-40">📊</span>
                      </div>
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Run your workflow to see data here</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Generated Query Section */
                <div className="h-full bg-white flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-2 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Code size={14} className="text-blue-500" />
                      <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">SQL Source</span>
                    </div>
                    <button
                      onClick={() => {
                        if (lastExecutedQuery) {
                          navigator.clipboard.writeText(lastExecutedQuery);
                        }
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-700 transition-all text-[10px] font-bold uppercase tracking-tight"
                      title="Copy to clipboard"
                    >
                      <Copy size={12} />
                      Copy SQL
                    </button>
                  </div>
                  <div className="flex-1 bg-[#fffffe]">
                    {lastExecutedQuery ? (
                      <Editor
                        height="100%"
                        defaultLanguage="sql"
                        value={lastExecutedQuery}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          fontSize: 13,
                          lineNumbers: 'on',
                          renderLineHighlight: 'all',
                          overviewRulerBorder: false,
                          padding: { top: 16, bottom: 16 },
                          folding: true,
                          wordWrap: 'on',
                          fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
                        }}
                      />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-300 p-8 text-center bg-slate-50/30">
                        <Code size={32} className="mb-3 opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-wider opacity-40">No query generated yet</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* JOIN MODAL */}
      {showJoinModal && joinModalData ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-96 max-w-md border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Create Relationship</h2>
            <p className="text-sm text-slate-600 mb-6">Define how these tables connect</p>

            <div className="space-y-5">
              <div className="text-sm text-slate-700 pb-4 border-b border-slate-200 bg-slate-50 rounded-lg p-4">
                <p className="font-medium mb-2">Connection:</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                    {tables.find((t) => t.id === joinModalData.fromTableId)?.name}
                  </span>

                  <select
                    value={joinModalData.fromColumnName}
                    onChange={(e) => setJoinModalData({ ...joinModalData, fromColumnName: e.target.value })}
                    className="text-blue-600 font-mono text-xs border-b border-blue-300 focus:outline-none bg-transparent max-w-[100px]"
                  >
                    {tables.find((t) => t.id === joinModalData.fromTableId)?.columns.map(col => (
                      <option key={col.name} value={col.name}>{col.name}</option>
                    ))}
                  </select>

                  <span className="text-slate-400">→</span>

                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-semibold">
                    {tables.find((t) => t.id === joinModalData.toTableId)?.name}
                  </span>

                  <select
                    value={joinModalData.toColumnName}
                    onChange={(e) => setJoinModalData({ ...joinModalData, toColumnName: e.target.value })}
                    className="text-emerald-600 font-mono text-xs border-b border-emerald-300 focus:outline-none bg-transparent max-w-[100px]"
                  >
                    {tables.find((t) => t.id === joinModalData.toTableId)?.columns.map(col => (
                      <option key={col.name} value={col.name}>{col.name}</option>
                    ))}
                  </select>
                  {['inner', 'left', 'right', 'full'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setJoinForm({ ...joinForm, joinType: type })}
                      className={`px-3 py-2.5 rounded-lg border-2 text-xs capitalize font-bold transition-all ${joinForm.joinType === type
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                        : 'border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Filter Condition <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={joinForm.filter}
                  onChange={(e) => setJoinForm({ ...joinForm, filter: e.target.value })}
                  placeholder="e.g. status = 'active'"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Transformations <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={joinForm.transform}
                  onChange={(e) => setJoinForm({ ...joinForm, transform: e.target.value })}
                  placeholder="e.g. CAST(date_column AS DATE)"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-white border border-slate-300 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8 justify-end">
              {joinModalData.isEditing && (
                <button
                  onClick={deleteJoin}
                  className="px-5 py-2.5 text-sm font-semibold text-red-600 border-2 border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-all mr-auto"
                >
                  Delete Join
                </button>
              )}
              <button
                onClick={() => {
                  setShowJoinModal(false);
                  setJoinModalData(null);
                }}
                className="px-5 py-2.5 text-sm font-semibold text-slate-700 border-2 border-slate-300 rounded-lg hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmJoin}
                className="px-5 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
              >
                {joinModalData.isEditing ? 'Update Relationship' : 'Create Relationship'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Transformation Configuration Modal */}
      <TransformationConfigModal
        isOpen={configModalOpen}
        incomingNodes={
          configTargetNode
            ? relationships
              .filter(r => r.toTableId === configTargetNode.id)
              .map(r => tables.find(t => t.id === r.fromTableId))
              .filter((t): t is TableNode => !!t)
            : []
        }
        transformationType={configTargetNode?.transformationType || ''}
        transformationCategory={configTargetNode?.transformationCategory || ''}
        sourceNode={configSourceNode}
        onSave={(config) => {
          if (!configTargetNode) return;

          // 1. Update target table with new config and temporary columns
          setTables((prev) => {
            const incoming = prev.filter(t =>
              relationships.some(r => r.toTableId === configTargetNode.id && r.fromTableId === t.id)
            );

            // Create intermediate state for the target node
            const targetWithConfig = {
              ...configTargetNode,
              transformationConfig: config,
              isConfigured: true
            };

            // Calculate its new output columns
            const newCols = getOutputColumns(targetWithConfig as TableNode, incoming);

            const updatedWithTarget = prev.map((t) =>
              t.id === configTargetNode.id
                ? { ...targetWithConfig, columns: newCols } as TableNode
                : t
            );

            // 2. Propagate these changes downstream
            return propagateSchemaChanges(configTargetNode.id, updatedWithTarget, relationships);
          });

          // Persist the relationship using configSourceNode (if present). Avoid relying on transient `drawing`.
          if (configSourceNode) {
            setRelationships((prev) => {
              const sourceCol = configSourceNode.columns?.[0]?.name || 'output';
              const exists = prev.some(
                (r) =>
                  r.fromTableId === configSourceNode.id &&
                  r.toTableId === configTargetNode.id &&
                  (r.fromColumnName === sourceCol || r.toColumnName === 'output')
              );
              if (exists) return prev;
              return [
                ...prev,
                {
                  id: `rel-${Date.now()}-${Math.random()}`,
                  fromTableId: configSourceNode.id,
                  fromColumnName: sourceCol,
                  toTableId: configTargetNode.id,
                  toColumnName: 'output',
                  joinType: 'inner',
                },
              ];
            });
          }

          setConfigModalOpen(false);
          setConfigTargetNode(null);
          setConfigSourceNode(null);
        }}
        onCancel={() => {
          setConfigModalOpen(false);
          setConfigTargetNode(null);
          setConfigSourceNode(null);
          setDrawing(null); // Clear drawing state to prevent node from sticking to mouse
        }}
      />

      {/* Column Selection Modal */}
      {columnModalOpen && columnModalTargetNode && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-0 w-[450px] max-w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
              <h2 className="text-xl font-bold">Select Columns</h2>
              <p className="text-blue-100 text-xs mt-1">Pick the columns you want to output from <b>{columnModalTargetNode.name}</b></p>
            </div>

            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Available Fields</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (columnModalTargetNode.allColumns) {
                      setTables(prev => prev.map(t =>
                        t.id === columnModalTargetNode.id
                          ? { ...t, columns: [...(t.allColumns || [])] }
                          : t
                      ));
                      setColumnModalTargetNode({
                        ...columnModalTargetNode,
                        columns: [...(columnModalTargetNode.allColumns || [])]
                      });
                    }
                  }}
                  className="text-[10px] px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 font-bold text-slate-600 transition-all"
                >
                  SELECT ALL
                </button>
                <button
                  onClick={() => {
                    setTables(prev => prev.map(t =>
                      t.id === columnModalTargetNode.id
                        ? { ...t, columns: [] }
                        : t
                    ));
                    setColumnModalTargetNode({
                      ...columnModalTargetNode,
                      columns: []
                    });
                  }}
                  className="text-[10px] px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 font-bold text-slate-600 transition-all"
                >
                  DESELECT ALL
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-white">
              {(columnModalTargetNode.allColumns || columnModalTargetNode.columns).map((col) => {
                const isSelected = columnModalTargetNode.columns.some(c => c.name === col.name);
                return (
                  <label
                    key={col.name}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer group ${isSelected
                      ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                      : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-transparent'
                      }`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={isSelected}
                      onChange={(e) => {
                        const newCols = e.target.checked
                          ? [...columnModalTargetNode.columns, col]
                          : columnModalTargetNode.columns.filter(c => c.name !== col.name);

                        setTables(prev => {
                          const updated = prev.map(t =>
                            t.id === columnModalTargetNode.id
                              ? { ...t, columns: newCols }
                              : t
                          );
                          return propagateSchemaChanges(columnModalTargetNode.id, updated, relationships);
                        });

                        setColumnModalTargetNode({
                          ...columnModalTargetNode,
                          columns: newCols
                        });
                      }}
                    />
                    <div className="flex flex-col">
                      <span className={`text-sm font-semibold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{col.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono uppercase font-bold tracking-tight">{col.type}</span>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setColumnModalOpen(false);
                  setColumnModalTargetNode(null);
                }}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Workflow Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">Save Workflow</h3>
              <p className="text-sm text-slate-500 mt-1">
                Give your workflow a name to save it for later. Workflows are retained for 7 days.
              </p>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Workflow Name
                  </label>
                  <input
                    type="text"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="e.g., Q1 Sales Analysis"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && confirmSaveNewWorkflow()}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setIsSaveModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveNewWorkflow}
                disabled={!workflowName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
              >
                Save Lineage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Preview Modal */}
      {previewModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-[90%] max-w-6xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-2xl font-bold text-slate-800">
                Preview: {previewData?.title || 'Loading...'}
              </h2>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {isLoadingPreview ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-slate-600">Loading preview...</div>
                </div>
              ) : previewData && previewData.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-100">
                        {previewData.columns.map((col, idx) => (
                          <th
                            key={idx}
                            className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b-2 border-slate-300"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.rows.map((row, rowIdx) => (
                        <tr
                          key={rowIdx}
                          className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                        >
                          {previewData.columns.map((col, colIdx) => (
                            <td
                              key={colIdx}
                              className="px-4 py-3 text-sm text-slate-800 border-b border-slate-200 max-w-xs truncate"
                              title={String(row[col] ?? '')}
                            >
                              {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-400 italic">null</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 text-sm text-slate-600 text-center">
                    Showing first {previewData.rows.length} rows
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-slate-600">No data available</div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="px-5 py-2.5 text-sm font-semibold text-slate-700 border-2 border-slate-300 rounded-lg hover:bg-slate-50 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <SQLVisualizeModal
        isOpen={isVisualizeOpen}
        onClose={() => {
          setIsVisualizeOpen(false);
          setInitialVisualizeConfig(undefined);
        }}
        page={queryResult?.page ?? 1}
        totalPages={queryResult?.total_pages ?? 1}
        columns={queryResult?.columns ?? []}
        rows={queryResult?.rows ?? []}
        query={lastExecutedQuery}
        sources={lastExecutedSources}
        onConfigChange={() => { }}
        onSaveSuccess={() => {
          setInitialVisualizeConfig(undefined);
        }}
        mode={visualizeMode}
        initialConfig={initialVisualizeConfig}
        workflowConfig={{ tables, relationships }}
      />
    </div>
  );
};
