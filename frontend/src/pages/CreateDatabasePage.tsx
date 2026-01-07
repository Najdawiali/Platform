import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, EyeOff, FileText, Leaf, Server } from 'lucide-react';

import { connectionService } from '../services/connectionService';
import { datasetService } from '../services/datasetService';
import type { Connection, Dataset } from '../types';

type SourceType = 'file_upload' | 'postgresql' | 'mysql' | 'mongodb' | 'salesforce';

interface SourceOption {
  id: SourceType;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const sourceOptions: SourceOption[] = [
  {
    id: 'file_upload',
    name: 'File Upload',
    description: 'CSV, Excel, or JSON files',
    icon: <FileText size={28} color="#64748b" />
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: 'Connect to PostgreSQL database',
    icon: <Server size={28} color="#64748b" />
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: 'Connect to MySQL database',
    icon: <Server size={28} color="#64748b" />
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Connect to MongoDB database',
    icon: <Leaf size={28} color="#64748b" />
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Connect to Salesforce (OAuth)',
    icon: <Server size={28} color="#64748b" />
  }
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ACCEPTED_FORMATS = '.csv,.xlsx,.xls,.json,.txt,.md,.mdx,.pdf';
const SUPPORTED_EXTENSIONS = ['csv', 'xlsx', 'xls', 'json', 'txt', 'md', 'mdx', 'pdf'];

type FileSourceType = 'csv' | 'excel' | 'json' | 'txt' | 'md' | 'mdx' | 'pdf';

function extToSourceType(ext: string): FileSourceType | null {
  const fileExt = ext.toLowerCase();
  if (fileExt === 'csv') return 'csv';
  if (fileExt === 'xlsx' || fileExt === 'xls') return 'excel';
  if (fileExt === 'json') return 'json';
  if (fileExt === 'txt') return 'txt';
  if (fileExt === 'md') return 'md';
  if (fileExt === 'mdx') return 'mdx';
  if (fileExt === 'pdf') return 'pdf';
  return null;
}

function buildUniqueName(baseName: string, takenNames: Set<string>) {
  if (!takenNames.has(baseName)) return baseName;
  let i = 2;
  while (takenNames.has(`${baseName}_${i}`)) i++;
  return `${baseName}_${i}`;
}

export const CreateDatabasePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedSource, setSelectedSource] = useState<SourceType | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const [isManualCsvOpen, setIsManualCsvOpen] = useState(false);
  const [manualCsvFilename, setManualCsvFilename] = useState('manual_data.csv');
  const [manualCsvError, setManualCsvError] = useState<string>('');
  const DEFAULT_MANUAL_ROWS = 12;
  const DEFAULT_MANUAL_COLS = 6;
  const [manualCsvGrid, setManualCsvGrid] = useState<string[][]>(() =>
    Array.from({ length: DEFAULT_MANUAL_ROWS }, () => Array.from({ length: DEFAULT_MANUAL_COLS }, () => ''))
  );

  const [activeDbModal, setActiveDbModal] = useState<'mysql' | 'postgresql' | 'mongodb' | 'salesforce' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [dbForm, setDbForm] = useState({
    host: 'localhost',
    port: 5432,
    database: '',
    username: '',
    password: '',
  });
  const [sfConnectionId, setSfConnectionId] = useState<string | null>(null);
  const [dbTest, setDbTest] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });
  const [dbItems, setDbItems] = useState<string[]>([]);
  const [dbSelected, setDbSelected] = useState<Set<string>>(new Set());
  const [dbSearch, setDbSearch] = useState<string>('');

  // Salesforce field search + selection
  const [sfFieldObject, setSfFieldObject] = useState<string>('');
  const [sfFieldSearch, setSfFieldSearch] = useState<string>('');
  const [sfFieldItems, setSfFieldItems] = useState<Array<{ name: string; label?: string; type?: string }>>([]);
  const [sfFieldStatus, setSfFieldStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [sfFieldError, setSfFieldError] = useState<string>('');
  const [sfSelectedFieldsByObject, setSfSelectedFieldsByObject] = useState<Record<string, Set<string>>>({});

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => connectionService.getConnections(),
    retry: false,
  });

  const { data: datasets = [] } = useQuery<Dataset[]>({
    queryKey: ['datasets'],
    queryFn: () => datasetService.getDatasets(),
    retry: false,
  });

  const fileConnections = useMemo(() => {
    return connections.filter((c) => ['csv', 'excel', 'json', 'txt', 'md', 'mdx', 'pdf'].includes(c.source_type));
  }, [connections]);

  const selectedFileNamesLower = useMemo(() => {
    return new Set(selectedFiles.map((f) => f.name.trim().toLowerCase()).filter(Boolean));
  }, [selectedFiles]);

  const normalizeManualCsvFilename = (name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';
    if (trimmed.toLowerCase().endsWith('.csv')) return trimmed;
    return `${trimmed}.csv`;
  };

  const escapeCsvCell = (value: string) => {
    const s = String(value ?? '');
    const needsQuotes = /[\n\r,\"]/.test(s);
    const escaped = s.replace(/\"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const trimCsvGrid = (grid: string[][]) => {
    if (!Array.isArray(grid) || grid.length === 0) return [[""]];
    const rowCount = grid.length;
    const colCount = Math.max(0, ...grid.map((r) => (Array.isArray(r) ? r.length : 0)));
    if (colCount === 0) return [[""]];

    let lastUsedRow = -1;
    let lastUsedCol = -1;
    for (let r = 0; r < rowCount; r++) {
      const row = grid[r] || [];
      for (let c = 0; c < colCount; c++) {
        const val = (row[c] ?? '').toString().trim();
        if (val !== '') {
          if (r > lastUsedRow) lastUsedRow = r;
          if (c > lastUsedCol) lastUsedCol = c;
        }
      }
    }

    // If everything is empty, export a minimal 1x1 CSV
    if (lastUsedRow < 0 || lastUsedCol < 0) return [[""]];

    const trimmed: string[][] = [];
    for (let r = 0; r <= lastUsedRow; r++) {
      const row = grid[r] || [];
      const outRow: string[] = [];
      for (let c = 0; c <= lastUsedCol; c++) {
        outRow.push((row[c] ?? '').toString());
      }
      trimmed.push(outRow);
    }
    return trimmed;
  };

  const trimGridForExport = (grid: string[][]) => {
    const safe = Array.isArray(grid) ? grid : [];
    if (safe.length === 0) return { trimmed: [] as string[][], rows: 0, cols: 0 };

    const isNonEmpty = (v: unknown) => String(v ?? '').trim().length > 0;

    let lastNonEmptyRow = -1;
    let lastNonEmptyCol = -1;

    for (let r = 0; r < safe.length; r++) {
      const row = Array.isArray(safe[r]) ? safe[r] : [];
      for (let c = 0; c < row.length; c++) {
        if (isNonEmpty(row[c])) {
          if (r > lastNonEmptyRow) lastNonEmptyRow = r;
          if (c > lastNonEmptyCol) lastNonEmptyCol = c;
        }
      }
    }

    if (lastNonEmptyRow < 0 || lastNonEmptyCol < 0) {
      return { trimmed: [] as string[][], rows: 0, cols: 0 };
    }

    const trimmed = safe
      .slice(0, lastNonEmptyRow + 1)
      .map((row) => (Array.isArray(row) ? row : []).slice(0, lastNonEmptyCol + 1).map((v) => String(v ?? '')));

    return { trimmed, rows: lastNonEmptyRow + 1, cols: lastNonEmptyCol + 1 };
  };

  const gridToCsv = (grid: string[][]) => {
    const { trimmed } = trimGridForExport(grid);
    const lines = trimmed.map((row) => row.map(escapeCsvCell).join(','));
    return lines.join('\r\n') + '\r\n';
  };

  const takenDatasetNames = useMemo(() => {
    const names = new Set<string>();
    for (const d of datasets as any[]) {
      if (typeof d?.name === 'string') names.add(d.name);
    }
    return names;
  }, [datasets]);

  const handleSourceSelect = (sourceId: SourceType) => {
    setSelectedSource(sourceId);
  };

  const openDbModal = (type: 'mysql' | 'postgresql' | 'mongodb' | 'salesforce') => {
    setSelectedSource(type);
    setActiveDbModal(type);
    setShowPassword(false);
    setDbTest({ status: 'idle', message: '' });
    setDbItems([]);
    setDbSelected(new Set());
    setDbSearch('');

    setSfFieldObject('');
    setSfFieldSearch('');
    setSfFieldItems([]);
    setSfFieldStatus('idle');
    setSfFieldError('');
    setSfSelectedFieldsByObject({});

    if (type === 'salesforce') {
      setSfConnectionId(null);
      return;
    }

    if (type === 'postgresql') {
      setDbForm({ host: 'localhost', port: 5432, database: '', username: '', password: '' });
    } else if (type === 'mysql') {
      setDbForm({ host: 'localhost', port: 3306, database: '', username: '', password: '' });
    } else {
      setDbForm({ host: 'localhost', port: 27017, database: '', username: '', password: '' });
    }
  };

  const testDbConnection = async () => {
    if (!activeDbModal) return;

    if (activeDbModal === 'salesforce') {
      setDbTest({ status: 'testing', message: 'Testing connection…' });
      setDbItems([]);
      setDbSelected(new Set());

      try {
        if (!sfConnectionId) {
          setDbTest({ status: 'error', message: 'Please sign in with Salesforce first.' });
          return;
        }

        const config = await connectionService.getConnectionConfig(sfConnectionId);
        const creds: Record<string, any> = config?.credentials || {};
        const result = await connectionService.testConnection('salesforce', creds);
        if (result?.success) {
          const items = result?.metadata?.objects || [];
          const itemList: string[] = Array.isArray(items) ? items : [];
          setDbTest({ status: 'success', message: result?.message || 'Connection successful.' });
          setDbItems(itemList);
          // For Salesforce, default to previously selected objects (if any) instead of selecting ALL.
          const previouslySelected: string[] = Array.isArray((creds as any)?.selected_objects) ? (creds as any).selected_objects : [];
          const restored = previouslySelected.filter((o: any) => typeof o === 'string' && itemList.includes(o));
          setDbSelected(new Set(restored));
          setDbSearch('');
          setSfFieldObject('');
          setSfFieldSearch('');
          setSfFieldItems([]);
          setSfFieldStatus('idle');
          setSfFieldError('');

          const existing = creds?.selected_fields && typeof creds.selected_fields === 'object' ? creds.selected_fields : {};
          const nextMap: Record<string, Set<string>> = {};
          for (const obj of restored) {
            const selected = Array.isArray((existing as any)[obj]) ? (existing as any)[obj] : null;
            nextMap[obj] = new Set((selected && selected.length ? selected : ['Id']).map((x: any) => String(x)));
          }
          setSfSelectedFieldsByObject(nextMap);
        } else {
          setDbTest({ status: 'error', message: result?.message || 'Connection failed.' });
        }
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || 'Connection failed.';
        setDbTest({ status: 'error', message: msg });
      }
      return;
    }

    if (!dbForm.host || !dbForm.database) {
      setDbTest({ status: 'error', message: 'Host and database are required.' });
      return;
    }

    if (activeDbModal !== 'mongodb' && !dbForm.username) {
      setDbTest({ status: 'error', message: 'Username is required.' });
      return;
    }

    setDbTest({ status: 'testing', message: 'Testing connection…' });
    setDbItems([]);
    setDbSelected(new Set());

    try {
      const creds: Record<string, any> = {
        host: dbForm.host,
        port: Number(dbForm.port),
        database: dbForm.database,
        username: dbForm.username,
        password: dbForm.password,
      };

      // MongoDB uses a connection string in the backend
      if (activeDbModal === 'mongodb') {
        const userPart = encodeURIComponent(dbForm.username || '');
        const passPart = encodeURIComponent(dbForm.password || '');
        const auth = userPart ? `${userPart}:${passPart}@` : '';
        const dbName = encodeURIComponent(dbForm.database || '');
        const authSource = auth ? `?authSource=${dbName}` : '';
        creds.connection_string = `mongodb://${auth}${dbForm.host}:${Number(dbForm.port)}/${dbName}${authSource}`;
        delete creds.host;
        delete creds.port;
        delete creds.username;
        delete creds.password;
      }

      const result = await connectionService.testConnection(activeDbModal, creds);

      if (result?.success) {
        const items =
          activeDbModal === 'mongodb'
            ? (result?.metadata?.collections || [])
            : (result?.metadata?.tables || []);
        const itemList: string[] = Array.isArray(items) ? items : [];

        setDbTest({ status: 'success', message: result?.message || 'Connection successful.' });
        setDbItems(itemList);
        setDbSelected(new Set(itemList)); // default to all
      } else {
        setDbTest({ status: 'error', message: result?.message || 'Connection failed.' });
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Connection failed.';
      setDbTest({ status: 'error', message: msg });
    }
  };

  const toggleDbItem = (name: string) => {
    const wasSelected = dbSelected.has(name);
    setDbSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    // Salesforce UX: if the user selects an object checkbox, switch the field picker to it.
    if (activeDbModal === 'salesforce' && !wasSelected) {
      setSfFieldObject(name);
      setSfFieldSearch('');
    }
  };

  const visibleDbItems = useMemo(() => {
    const q = dbSearch.trim().toLowerCase();
    if (!q) return dbItems;
    return dbItems.filter((name) => name.toLowerCase().includes(q));
  }, [dbItems, dbSearch]);

  const selectedSalesforceObjects = useMemo(() => {
    if (activeDbModal !== 'salesforce') return [] as string[];
    if (!dbItems.length) return [] as string[];
    // Keep ordering consistent with the full objects list.
    return dbItems.filter((o) => dbSelected.has(o));
  }, [activeDbModal, dbItems, dbSelected]);

  const visibleAllSelected = useMemo(() => {
    return visibleDbItems.length > 0 && visibleDbItems.every((name) => dbSelected.has(name));
  }, [visibleDbItems, dbSelected]);

  const setSelectAll = (checked: boolean) => {
    // Apply select all to the currently visible (filtered) items.
    if (!checked) {
      setDbSelected((prev) => {
        const next = new Set(prev);
        for (const name of visibleDbItems) next.delete(name);
        return next;
      });
      return;
    }
    setDbSelected((prev) => {
      const next = new Set(prev);
      for (const name of visibleDbItems) next.add(name);
      return next;
    });
  };

  // Keep a reasonable (and valid) default object selected for Salesforce field search.
  useEffect(() => {
    if (activeDbModal !== 'salesforce') return;
    if (dbTest.status !== 'success') return;
    if (!selectedSalesforceObjects.length) {
      if (sfFieldObject) setSfFieldObject('');
      return;
    }

    // If nothing selected yet, or current value was unselected, pick the first selected object.
    if (!sfFieldObject || !dbSelected.has(sfFieldObject)) {
      setSfFieldObject(selectedSalesforceObjects[0]);
    }
  }, [activeDbModal, dbTest.status, selectedSalesforceObjects, sfFieldObject, dbSelected]);

  // Fetch fields for the selected Salesforce object, to support field search.
  useEffect(() => {
    if (activeDbModal !== 'salesforce') return;
    if (dbTest.status !== 'success') return;
    if (!sfConnectionId) return;
    if (!sfFieldObject) return;

    let cancelled = false;
    (async () => {
      setSfFieldStatus('loading');
      setSfFieldError('');
      try {
        const fields = await connectionService.getSalesforceFields(sfConnectionId, sfFieldObject);
        if (cancelled) return;
        setSfFieldItems(fields || []);
        setSfFieldStatus('success');
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.response?.data?.detail || e?.message || 'Failed to load Salesforce fields.';
        setSfFieldItems([]);
        setSfFieldStatus('error');
        setSfFieldError(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeDbModal, dbTest.status, sfConnectionId, sfFieldObject]);

  const visibleSfFields = useMemo(() => {
    const q = sfFieldSearch.trim().toLowerCase();
    if (!q) return sfFieldItems;
    return (sfFieldItems || []).filter((f) => {
      const name = (f?.name || '').toLowerCase();
      const label = (f?.label || '').toLowerCase();
      return name.includes(q) || label.includes(q);
    });
  }, [sfFieldItems, sfFieldSearch]);

  // Ensure current object always has a selection set (defaults to Id)
  useEffect(() => {
    if (activeDbModal !== 'salesforce') return;
    if (!sfFieldObject) return;
    setSfSelectedFieldsByObject((prev) => {
      if (prev[sfFieldObject]) return prev;
      return { ...prev, [sfFieldObject]: new Set(['Id']) };
    });
  }, [activeDbModal, sfFieldObject]);

  // Ensure every selected Salesforce object has at least Id selected.
  useEffect(() => {
    if (activeDbModal !== 'salesforce') return;
    if (!selectedSalesforceObjects.length) return;
    setSfSelectedFieldsByObject((prev) => {
      let changed = false;
      const next: Record<string, Set<string>> = { ...prev };
      for (const obj of selectedSalesforceObjects) {
        if (!next[obj] || next[obj].size === 0) {
          next[obj] = new Set(['Id']);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeDbModal, selectedSalesforceObjects]);

  const toggleSfField = (fieldName: string) => {
    if (!sfFieldObject) return;
    if (fieldName === 'Id') return;
    setSfSelectedFieldsByObject((prev) => {
      const current = prev[sfFieldObject] ? new Set(prev[sfFieldObject]) : new Set<string>(['Id']);
      if (current.has(fieldName)) current.delete(fieldName);
      else current.add(fieldName);
      return { ...prev, [sfFieldObject]: current };
    });
  };

  const addDbConnection = async () => {
    console.log('[Add Connection] Starting...');
    if (!activeDbModal) return;
    if (dbTest.status !== 'success') {
      setDbTest({ status: 'error', message: 'Please test the connection successfully first.' });
      return;
    }
    if (dbItems.length > 0 && dbSelected.size === 0) {
      setDbTest({ status: 'error', message: 'Select at least one table/collection (or Select All).' });
      return;
    }

    const baseName =
      activeDbModal === 'postgresql'
        ? `PostgreSQL - ${dbForm.database}`
        : activeDbModal === 'mysql'
          ? `MySQL - ${dbForm.database}`
          : activeDbModal === 'mongodb'
            ? `MongoDB - ${dbForm.database}`
            : `Salesforce`;

    try {
      setDbTest({ status: 'testing', message: 'Saving connection…' });
      const credentials: Record<string, any> = {};

      if (activeDbModal === 'salesforce') {
        console.log('[Add Connection] Processing Salesforce connection...');
        if (!sfConnectionId) {
          setDbTest({ status: 'error', message: 'Please sign in with Salesforce first.' });
          return;
        }

        // Validate at least one field per selected object.
        for (const obj of Array.from(dbSelected)) {
          const setForObj = sfSelectedFieldsByObject[obj];
          if (!setForObj || setForObj.size === 0) {
            setDbTest({ status: 'error', message: `Select at least one field for ${obj}.` });
            return;
          }
        }

        console.log('[Add Connection] Fetching connection config...');
        const config = await connectionService.getConnectionConfig(sfConnectionId);
        console.log('[Add Connection] Config received:', config);
        
        const existingCreds: Record<string, any> = config?.credentials || {};
        credentials.selected_objects = Array.from(dbSelected);
        const fieldsOut: Record<string, string[]> = {};
        for (const obj of Array.from(dbSelected)) {
          const setForObj = sfSelectedFieldsByObject[obj];
          const arr = Array.from(setForObj || new Set<string>()).map(String);
          fieldsOut[obj] = arr.length ? arr : ['Id'];
        }
        credentials.selected_fields = fieldsOut;
        credentials.retention_days = existingCreds.retention_days ?? 90;
        // Preserve OAuth tokens and other fields already stored
        for (const [k, v] of Object.entries(existingCreds)) {
          if (credentials[k] === undefined) credentials[k] = v;
        }
        
        console.log('[Add Connection] Updating connection with credentials:', credentials);
      } else if (activeDbModal === 'mongodb') {
        const userPart = encodeURIComponent(dbForm.username || '');
        const passPart = encodeURIComponent(dbForm.password || '');
        const auth = userPart ? `${userPart}:${passPart}@` : '';
        const dbName = encodeURIComponent(dbForm.database || '');
        // Include the database in the URI so authSource defaults correctly for users created in that DB.
        // If auth is provided, explicitly set authSource to the same database.
        const authSource = auth ? `?authSource=${dbName}` : '';
        credentials.connection_string = `mongodb://${auth}${dbForm.host}:${Number(dbForm.port)}/${dbName}${authSource}`;
        credentials.database = dbForm.database;
        credentials.selected_collections = Array.from(dbSelected);
      } else {
        credentials.host = dbForm.host;
        credentials.port = Number(dbForm.port);
        credentials.database = dbForm.database;
        credentials.username = dbForm.username;
        credentials.password = dbForm.password;
        if (activeDbModal === 'postgresql') {
          credentials.schema = 'public';
        }
        credentials.selected_tables = Array.from(dbSelected);
      }

      if (activeDbModal === 'salesforce') {
        console.log('[Add Connection] Calling updateConnection API...');
        await connectionService.updateConnection(sfConnectionId!, {
          credentials,
        } as any);
        console.log('[Add Connection] Update successful!');
      } else {
        console.log('[Add Connection] Calling createConnection API...');
        await connectionService.createConnection({
          name: baseName,
          source_type: activeDbModal,
          description: `Created from Create Database`,
          credentials,
        } as any);
        console.log('[Add Connection] Create successful!');
      }

      console.log('[Add Connection] Invalidating queries and navigating...');
      await queryClient.invalidateQueries({ queryKey: ['connections'] });
      setActiveDbModal(null);
      navigate('/databases');
      console.log('[Add Connection] Complete!');
    } catch (e: any) {
      console.error('[Add Connection] Error:', e);
      console.error('[Add Connection] Error response:', e?.response);
      const msg = e?.response?.data?.detail || e?.message || 'Failed to create connection.';
      console.error('[Add Connection] Error message:', msg);
      setDbTest({ status: 'error', message: msg });
    }
  };

  const startSalesforceOAuth = async () => {
    setDbTest({ status: 'testing', message: 'Redirecting to Salesforce…' });
    try {
      console.log('[Salesforce OAuth] Starting OAuth flow...');
      const resp = await connectionService.startSalesforceOAuth({ name: 'Salesforce' });
      console.log('[Salesforce OAuth] Received response:', resp);
      if (!resp?.authorize_url) {
        console.error('[Salesforce OAuth] Missing authorize_url in response');
        throw new Error('Missing authorize_url in response from server');
      }
      console.log('[Salesforce OAuth] Redirecting to:', resp.authorize_url);
      window.location.href = resp.authorize_url;
    } catch (e: any) {
      console.error('[Salesforce OAuth] Error:', e);
      console.error('[Salesforce OAuth] Error response:', e?.response);
      console.error('[Salesforce OAuth] Error response data:', e?.response?.data);
      
      let msg = 'Failed to start Salesforce OAuth.';
      if (e?.code === 'ECONNABORTED' || e?.message?.includes('timeout')) {
        msg = 'Request timed out. Please check if the backend server is running on http://localhost:8000';
      } else if (e?.code === 'ERR_NETWORK' || e?.message?.includes('Network Error')) {
        msg = 'Network error. Please check if the backend server is running and accessible.';
      } else if (e?.response?.status === 401) {
        msg = 'Authentication required. Please log in again.';
      } else if (e?.response?.status === 501) {
        msg = e?.response?.data?.detail || 'Salesforce OAuth not configured on the server.';
      } else if (e?.response?.data?.detail) {
        msg = e.response.data.detail;
      } else if (e?.message) {
        msg = e.message;
      }
      
      console.error('[Salesforce OAuth] Error message:', msg);
      setDbTest({ status: 'error', message: msg });
    }
  };

  useEffect(() => {
    // After Salesforce OAuth callback, backend redirects here with the new connection id.
    const params = new URLSearchParams(location.search);
    const oauthErr = params.get('salesforce_oauth_error');
    if (oauthErr) {
      setSelectedSource('salesforce');
      setActiveDbModal('salesforce');
      setSfConnectionId(null);
      setDbTest({ status: 'error', message: oauthErr });
      return;
    }
    const id = params.get('salesforce_connection_id');
    if (!id) return;

    setSelectedSource('salesforce');
    setActiveDbModal('salesforce');
    setSfConnectionId(id);

    // Avoid auto-testing/loading objects here to reduce Salesforce API calls (can trigger REQUEST_LIMIT_EXCEEDED).
    // User can click "Test connection" when ready.
    setDbItems([]);
    setDbSelected(new Set());
    setDbSearch('');
    setSfFieldObject('');
    setSfFieldSearch('');
    setSfFieldItems([]);
    setSfFieldStatus('idle');
    setSfFieldError('');
    setSfSelectedFieldsByObject({});
    setDbTest({ status: 'idle', message: 'Salesforce connected. Click Test Connection to load objects.' });

    // Remove the query param so refresh doesn't re-trigger this block.
    navigate(location.pathname, { replace: true });
  }, [location.search]);

  const openFilePicker = () => {
    // reset input so selecting the same file twice triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
    fileInputRef.current?.click();
  };

  const handleFileUploadClick = () => {
    setSelectedSource('file_upload');
    setIsUploadModalOpen(true);
  };

  const openManualCsvEditor = () => {
    setManualCsvError('');
    setIsManualCsvOpen(true);
  };

  const updateManualCsvCell = (rowIndex: number, colIndex: number, value: string) => {
    setManualCsvGrid((prev) => {
      const next = prev.map((r) => r.slice());
      if (!next[rowIndex]) return prev;
      next[rowIndex][colIndex] = value;
      return next;
    });
  };

  const addManualCsvRow = () => {
    setManualCsvGrid((prev) => {
      const cols = prev[0]?.length || DEFAULT_MANUAL_COLS;
      return [...prev, Array.from({ length: cols }, () => '')];
    });
  };

  const addManualCsvColumn = () => {
    setManualCsvGrid((prev) => prev.map((row) => [...row, '']));
  };

  const saveManualCsvToUploads = () => {
    const normalized = normalizeManualCsvFilename(manualCsvFilename);
    if (!normalized) {
      setManualCsvError('Please enter a file name.');
      return;
    }
    if (normalized.toLowerCase().split('.').pop() !== 'csv') {
      setManualCsvError('Manual entry can only be saved as a .csv file.');
      return;
    }
    if (selectedFileNamesLower.has(normalized.toLowerCase())) {
      setManualCsvError('That file name is already selected. Please use a different name.');
      return;
    }

    const { rows, cols } = trimGridForExport(manualCsvGrid);
    if (rows === 0 || cols === 0) {
      setManualCsvError('Please enter at least one value before saving.');
      return;
    }

    const trimmedGrid = trimCsvGrid(manualCsvGrid);
    const csvText = gridToCsv(trimmedGrid);
    const csvFile = new File([csvText], normalized, { type: 'text/csv' });
    if (csvFile.size > MAX_FILE_SIZE) {
      setManualCsvError('The generated CSV is too large (max 100MB).');
      return;
    }

    setSelectedFiles((prev) => [...prev, csvFile]);
    setIsManualCsvOpen(false);
    setManualCsvError('');
  };

  const processPickedFiles = (picked: File[]) => {
    const valid: File[] = [];
    const skipped: string[] = [];

    for (const file of picked) {
      const fileExt = file.name.toLowerCase().split('.').pop() || '';
      if (!SUPPORTED_EXTENSIONS.includes(fileExt)) {
        skipped.push(file.name);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        skipped.push(`${file.name} (too large)`);
        continue;
      }
      valid.push(file);
    }

    if (skipped.length > 0) {
      alert(
        `Some files were skipped.\n\nSupported formats:\nCSV, Excel, JSON, TXT, Markdown, MDX, PDF\n(${ACCEPTED_FORMATS})\nMax size: 100MB per file\n\nSkipped:\n${skipped.join('\n')}`
      );
    }

    if (valid.length === 0) {
      alert(
        `No supported files selected.\n\nSupported formats:\nCSV, Excel, JSON, TXT, Markdown, MDX, PDF\n(${ACCEPTED_FORMATS})\nMax size: 100MB per file`
      );
      return;
    }

    setSelectedFiles(valid);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processPickedFiles(Array.from(files));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isUploading) return;
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length === 0) return;
    processPickedFiles(dropped);
  };

  const handleSubmitUploads = async () => {
    if (selectedFiles.length === 0) {
      alert(`Please select one or more files first.\n\nSupported formats:\nCSV, Excel, JSON, TXT, Markdown, MDX, PDF\n(${ACCEPTED_FORMATS})`);
      return;
    }

    setIsUploading(true);
    setUploadStatus('');

    let successfulUploads = 0;
    let failedUploads = 0;
    const nameConflicts: string[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadStatus(`Uploading ${i + 1} of ${selectedFiles.length}: ${file.name}`);

        const fileExt = file.name.toLowerCase().split('.').pop() || '';
        const sourceType = extToSourceType(fileExt);

        if (!sourceType) {
          failedUploads++;
          continue;
        }

        let appropriateConnection = fileConnections.find((c) => c.source_type === sourceType);

        if (!appropriateConnection) {
          const newConnection = await connectionService.createConnection({
            name: `My ${sourceType.toUpperCase()} Files`,
            source_type: sourceType,
            description: `Auto-created connection for ${sourceType.toUpperCase()} file uploads`,
            credentials: { files: [] },
          } as any);

          appropriateConnection = newConnection as any;
          await queryClient.invalidateQueries({ queryKey: ['connections'] });
        }

        if (!appropriateConnection) {
          failedUploads++;
          continue;
        }

        const baseDatasetName = file.name.replace(/\.(csv|xlsx|xls|json|txt|md|mdx|pdf)$/i, '');
        const datasetName = buildUniqueName(baseDatasetName, takenDatasetNames);
        takenDatasetNames.add(datasetName);

        try {
          const result = await datasetService.uploadFile(
            file,
            appropriateConnection.id,
            datasetName,
            'Uploaded from Create Database'
          );

          if (result.success && result.datasets_created > 0) {
            successfulUploads++;
          } else {
            failedUploads++;
          }
        } catch (e: any) {
          const status = e?.response?.status;
          if (status === 409) {
            nameConflicts.push(file.name);
          }
          failedUploads++;
        }
      }
    } finally {
      setIsUploading(false);
      setUploadStatus('');
      await queryClient.invalidateQueries({ queryKey: ['datasets'] });
      await queryClient.invalidateQueries({ queryKey: ['connections'] });
    }

    if (successfulUploads > 0 && failedUploads === 0) {
      alert(`Files were successfully uploaded and added to "File Upload".`);
    } else if (successfulUploads > 0) {
      const conflictNote =
        nameConflicts.length > 0
          ? `\n\nThese file name(s) are already taken. Please rename and try again:\n${nameConflicts.join('\n')}`
          : '';
      alert(`Some files were uploaded and added to "File Upload".\n\nUploaded: ${successfulUploads}\nFailed: ${failedUploads}${conflictNote}`);
    } else {
      const conflictNote =
        nameConflicts.length > 0
          ? `\n\nThese file name(s) are already taken. Please rename and try again:\n${nameConflicts.join('\n')}`
          : '';
      alert(`Upload failed.\n\nUploaded: ${successfulUploads}\nFailed: ${failedUploads}${conflictNote}`);
      return;
    }

    setIsUploadModalOpen(false);

    const createAnother = window.confirm('Do you want to create another database?');
    if (createAnother) {
      setSelectedFiles([]);
      setSelectedSource(null);
      return;
    }

    navigate('/databases');
  };

  const handleBack = () => {
    navigate('/databases');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Header (matches reference layout) */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '18px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px'
      }}>
        <button
          onClick={handleBack}
          style={{
            background: 'none',
            border: 'none',
            color: '#0f172a',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 6px'
          }}
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#0f172a',
            margin: 0
          }}>
            Create Database
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#64748b',
            margin: '4px 0 0 0'
          }}>
            Connect a new data source
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        maxWidth: '1040px',
        margin: '0 auto',
        padding: '56px 28px 72px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{
            fontSize: '30px',
            fontWeight: 700,
            color: '#0f172a',
            margin: 0
          }}>
            Choose Source Type
          </h2>
          <p style={{
            fontSize: '18px',
            color: '#64748b',
            margin: '12px 0 0 0'
          }}>
            Select how you want to connect your data
          </p>
        </div>

        {/* Source Options Grid (2-column, centered) */}
        <div style={{
          maxWidth: '980px',
          margin: '40px auto 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '24px'
        }}>
          {sourceOptions.map((source) => (
            <button
              key={source.id}
              onClick={() => {
                if (source.id === 'file_upload') {
                  handleFileUploadClick();
                  return;
                }
                if (source.id === 'postgresql' || source.id === 'mysql' || source.id === 'mongodb') {
                  openDbModal(source.id);
                  return;
                }
                if (source.id === 'salesforce') {
                  openDbModal(source.id);
                  return;
                }
                handleSourceSelect(source.id);
              }}
              style={{
                width: '100%',
                backgroundColor: 'white',
                border: selectedSource === source.id ? '2px solid #c7d2fe' : '1px solid #e2e8f0',
                borderRadius: '18px',
                padding: '24px 26px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}
            >
              <div style={{
                width: '60px',
                height: '60px',
                backgroundColor: '#f8fafc',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {source.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#0f172a',
                  marginBottom: '6px'
                }}>
                  {source.name}
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#64748b'
                }}>
                  {source.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Upload modal (template-style) */}
      {isUploadModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!isUploading) setIsUploadModalOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 50
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '640px',
              backgroundColor: 'white',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 18px 60px rgba(15, 23, 42, 0.25)',
              overflow: 'hidden'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 20px',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '999px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <FileText size={18} color="#64748b" />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Upload files</div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>Select and upload the files of your choice</div>
                </div>
              </div>

              <button
                onClick={() => {
                  if (!isUploading) setIsUploadModalOpen(false);
                }}
                disabled={isUploading}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '999px',
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  color: '#64748b',
                  fontSize: '16px',
                  lineHeight: '32px'
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ padding: '22px 20px' }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FORMATS}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={handleDrop}
                style={{
                  border: '2px dashed #cbd5e1',
                  borderRadius: '14px',
                  padding: '34px 18px',
                  textAlign: 'center',
                  backgroundColor: '#f8fafc'
                }}
              >
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '999px',
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  margin: '0 auto 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <FileText size={20} color="#64748b" />
                </div>

                <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                  Choose file(s) or drag & drop here
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                  Supported formats: CSV, Excel, JSON, TXT, Markdown, MDX, PDF
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  {ACCEPTED_FORMATS} • up to 100MB per file
                </div>

                <div style={{
                  marginTop: '18px',
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '10px',
                  flexWrap: 'wrap'
                }}>
                  <button
                    onClick={openFilePicker}
                    disabled={isUploading}
                    style={{
                      backgroundColor: 'white',
                      color: '#0f172a',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: isUploading ? 'not-allowed' : 'pointer',
                      opacity: isUploading ? 0.7 : 1
                    }}
                  >
                    Browse File
                  </button>
                  <button
                    onClick={openManualCsvEditor}
                    disabled={isUploading}
                    style={{
                      backgroundColor: 'white',
                      color: '#0f172a',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: isUploading ? 'not-allowed' : 'pointer',
                      opacity: isUploading ? 0.7 : 1
                    }}
                  >
                    Enter Data Manually
                  </button>
                </div>

                {selectedFiles.length > 0 && (
                  <div style={{ marginTop: '14px', fontSize: '13px', color: '#0f172a' }}>
                    Selected: <span style={{ fontWeight: 700 }}>{selectedFiles.length}</span> file{selectedFiles.length === 1 ? '' : 's'}
                  </div>
                )}

                {uploadStatus && (
                  <div style={{ marginTop: '10px', fontSize: '13px', color: '#64748b' }}>{uploadStatus}</div>
                )}
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '16px'
              }}>
                <button
                  onClick={() => {
                    if (!isUploading) {
                      setIsUploadModalOpen(false);
                      setSelectedFiles([]);
                    }
                  }}
                  disabled={isUploading}
                  style={{
                    backgroundColor: 'white',
                    color: '#0f172a',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    opacity: isUploading ? 0.7 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitUploads}
                  disabled={isUploading || selectedFiles.length === 0}
                  style={{
                    backgroundColor: isUploading || selectedFiles.length === 0 ? '#e2e8f0' : '#4f46e5',
                    color: isUploading || selectedFiles.length === 0 ? '#94a3b8' : 'white',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: isUploading || selectedFiles.length === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual CSV editor modal */}
      {isUploadModalOpen && isManualCsvOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!isUploading) setIsManualCsvOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 80
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '900px',
              backgroundColor: 'white',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 18px 60px rgba(15, 23, 42, 0.25)',
              overflow: 'hidden'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 20px',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Enter data manually</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Create a CSV by typing rows and columns</div>
              </div>

              <button
                onClick={() => {
                  if (!isUploading) setIsManualCsvOpen(false);
                }}
                disabled={isUploading}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '999px',
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  color: '#64748b',
                  fontSize: '16px',
                  lineHeight: '32px'
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
                    File name
                  </label>
                  <input
                    value={manualCsvFilename}
                    onChange={(e) => {
                      setManualCsvFilename(e.target.value);
                      setManualCsvError('');
                    }}
                    placeholder="e.g. my_data.csv"
                    style={{
                      width: '100%',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      fontSize: '14px',
                      color: '#0f172a'
                    }}
                  />
                </div>

                <button
                  onClick={addManualCsvRow}
                  disabled={isUploading}
                  style={{
                    backgroundColor: 'white',
                    color: '#0f172a',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    opacity: isUploading ? 0.7 : 1
                  }}
                >
                  Add Row
                </button>
                <button
                  onClick={addManualCsvColumn}
                  disabled={isUploading}
                  style={{
                    backgroundColor: 'white',
                    color: '#0f172a',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    opacity: isUploading ? 0.7 : 1
                  }}
                >
                  Add Column
                </button>
              </div>

              {manualCsvError && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: '#b91c1c' }}>{manualCsvError}</div>
              )}

              <div style={{
                marginTop: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden'
              }}>
                <div style={{ maxHeight: '52vh', overflow: 'auto', backgroundColor: 'white' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {manualCsvGrid.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td
                              key={`${rIdx}-${cIdx}`}
                              style={{
                                borderBottom: '1px solid #e2e8f0',
                                borderRight: '1px solid #e2e8f0',
                                padding: '6px',
                                minWidth: '140px'
                              }}
                            >
                              <input
                                value={cell}
                                onChange={(e) => updateManualCsvCell(rIdx, cIdx, e.target.value)}
                                style={{
                                  width: '100%',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '8px 10px',
                                  fontSize: '14px',
                                  color: '#0f172a'
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '16px'
              }}>
                <button
                  onClick={() => {
                    if (!isUploading) setIsManualCsvOpen(false);
                  }}
                  disabled={isUploading}
                  style={{
                    backgroundColor: 'white',
                    color: '#0f172a',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    opacity: isUploading ? 0.7 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveManualCsvToUploads}
                  disabled={isUploading}
                  style={{
                    backgroundColor: '#4f46e5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    opacity: isUploading ? 0.7 : 1
                  }}
                >
                  Save & Add to Uploads
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DB configure modal */}
      {activeDbModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (dbTest.status !== 'testing') setActiveDbModal(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 60
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: '90vh',
              backgroundColor: 'white',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 18px 60px rgba(15, 23, 42, 0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid #e2e8f0',
              flexShrink: 0
            }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                Configure {activeDbModal === 'postgresql' ? 'PostgreSQL' : activeDbModal === 'mysql' ? 'MySQL' : activeDbModal === 'salesforce' ? 'Salesforce' : 'MongoDB'}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Enter your connection details</div>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {activeDbModal === 'salesforce' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                  <button
                    onClick={startSalesforceOAuth}
                    disabled={dbTest.status === 'testing'}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc',
                      fontSize: '14px',
                      fontWeight: 900,
                      cursor: dbTest.status === 'testing' ? 'not-allowed' : 'pointer',
                      color: '#0f172a'
                    }}
                  >
                    Sign in with Salesforce
                  </button>

                  {sfConnectionId && (
                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                      Connected. Use “Test Connection” to load objects.
                    </div>
                  )}
                </div>
              ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Host</div>
                  <input
                    value={dbForm.host}
                    onChange={(e) => setDbForm((p) => ({ ...p, host: e.target.value }))}
                    placeholder="localhost"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Port</div>
                  <input
                    value={dbForm.port}
                    onChange={(e) => setDbForm((p) => ({ ...p, port: Number(e.target.value || 0) }))}
                    placeholder={activeDbModal === 'postgresql' ? '5432' : activeDbModal === 'mysql' ? '3306' : '27017'}
                    type="number"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Database Name</div>
                  <input
                    value={dbForm.database}
                    onChange={(e) => setDbForm((p) => ({ ...p, database: e.target.value }))}
                    placeholder="my_database"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Username</div>
                  <input
                    value={dbForm.username}
                    onChange={(e) => setDbForm((p) => ({ ...p, username: e.target.value }))}
                    placeholder="db_user"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Password</div>
                  <div style={{ position: 'relative' }}>
                    <input
                      value={dbForm.password}
                      onChange={(e) => setDbForm((p) => ({ ...p, password: e.target.value }))}
                      placeholder="••••••••"
                      type={showPassword ? 'text' : 'password'}
                      style={{
                        width: '100%',
                        padding: '12px 42px 12px 14px',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        fontSize: '14px'
                      }}
                    />
                    <button
                      onClick={() => setShowPassword((p) => !p)}
                      type="button"
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: '#64748b'
                      }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>
              )}

              <button
                onClick={testDbConnection}
                disabled={dbTest.status === 'testing'}
                style={{
                  marginTop: '16px',
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#f8fafc',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: dbTest.status === 'testing' ? 'not-allowed' : 'pointer',
                  color: '#0f172a'
                }}
              >
                Test Connection
              </button>

              {dbTest.status !== 'idle' && (
                <div
                  style={{
                    marginTop: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: dbTest.status === 'success' ? '#16a34a' : dbTest.status === 'error' ? '#dc2626' : '#64748b'
                  }}
                >
                  {dbTest.message}
                </div>
              )}

              {dbTest.status === 'success' && (
                <div style={{ marginTop: '18px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <input
                      value={dbSearch}
                      onChange={(e) => setDbSearch(e.target.value)}
                      placeholder={activeDbModal === 'salesforce' ? 'Search objects…' : activeDbModal === 'mongodb' ? 'Search collections…' : 'Search tables…'}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        fontSize: '14px'
                      }}
                    />
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px'
                  }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                        {activeDbModal === 'mongodb' ? 'Collections' : activeDbModal === 'salesforce' ? 'Objects' : 'Tables'}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0f172a' }}>
                      <input
                        type="checkbox"
                        checked={visibleAllSelected}
                        onChange={(e) => setSelectAll(e.target.checked)}
                      />
                      Select all
                    </label>
                  </div>

                  <div style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    maxHeight: '220px',
                    overflow: 'auto',
                    backgroundColor: 'white'
                  }}>
                    {dbItems.length === 0 ? (
                      <div style={{ padding: '12px 14px', fontSize: '13px', color: '#64748b' }}>
                        No {activeDbModal === 'mongodb' ? 'collections' : activeDbModal === 'salesforce' ? 'objects' : 'tables'} found.
                      </div>
                    ) : (
                      visibleDbItems.map((name) => (
                        <label
                          key={name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 14px',
                            borderBottom: '1px solid #f1f5f9',
                            fontSize: '13px',
                            color: '#0f172a'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={dbSelected.has(name)}
                            onChange={() => toggleDbItem(name)}
                          />
                          {name}
                        </label>
                      ))
                    )}
                  </div>

                  {activeDbModal === 'salesforce' && sfConnectionId && selectedSalesforceObjects.length > 0 && (
                    <div style={{ marginTop: '14px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                        Search fields
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <select
                          value={sfFieldObject}
                          onChange={(e) => {
                            setSfFieldObject(e.target.value);
                            setSfFieldSearch('');
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: '#f8fafc',
                            fontSize: '14px'
                          }}
                        >
                          {selectedSalesforceObjects.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                        <input
                          value={sfFieldSearch}
                          onChange={(e) => setSfFieldSearch(e.target.value)}
                          placeholder="Search fields…"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: '#f8fafc',
                            fontSize: '14px'
                          }}
                        />
                      </div>

                      <div style={{
                        marginTop: '10px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        maxHeight: '180px',
                        overflow: 'auto',
                        backgroundColor: 'white'
                      }}>
                        {sfFieldStatus === 'loading' ? (
                          <div style={{ padding: '12px 14px', fontSize: '13px', color: '#64748b' }}>
                            Loading fields…
                          </div>
                        ) : sfFieldStatus === 'error' ? (
                          <div style={{ padding: '12px 14px', fontSize: '13px', color: '#dc2626', fontWeight: 700 }}>
                            {sfFieldError || 'Failed to load fields.'}
                          </div>
                        ) : visibleSfFields.length === 0 ? (
                          <div style={{ padding: '12px 14px', fontSize: '13px', color: '#64748b' }}>
                            No matching fields.
                          </div>
                        ) : (
                          visibleSfFields.map((f) => (
                            <label
                              key={f.name}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px',
                                padding: '10px 14px',
                                borderBottom: '1px solid #f1f5f9',
                                fontSize: '13px',
                                color: '#0f172a'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={
                                  f.name === 'Id'
                                    ? true
                                    : (sfSelectedFieldsByObject[sfFieldObject] || new Set<string>()).has(f.name)
                                }
                                disabled={f.name === 'Id'}
                                onChange={() => toggleSfField(f.name)}
                                style={{ marginTop: '2px' }}
                              />
                              <div style={{ flex: 1 }}>
                                <span style={{ fontWeight: 900 }}>{f.name}</span>
                                {f.type ? <span style={{ color: '#64748b' }}> — {f.type}</span> : null}
                                {f.label ? <div style={{ color: '#64748b', marginTop: '2px' }}>{f.label}</div> : null}
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                    marginTop: '16px'
                  }}>
                    <button
                      onClick={() => setActiveDbModal(null)}
                      style={{
                        backgroundColor: 'white',
                        color: '#0f172a',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        fontSize: '14px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addDbConnection}
                      style={{
                        backgroundColor: '#4f46e5',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        fontSize: '14px',
                        fontWeight: 900,
                        cursor: 'pointer'
                      }}
                    >
                      Add Connection
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
