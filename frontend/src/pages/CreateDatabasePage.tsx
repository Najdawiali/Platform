import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, EyeOff, FileText, Leaf, Server } from 'lucide-react';

import { connectionService } from '../services/connectionService';
import { datasetService } from '../services/datasetService';
import type { Connection, Dataset } from '../types';

type SourceType = 'file_upload' | 'postgresql' | 'mysql' | 'mongodb';

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

  const [activeDbModal, setActiveDbModal] = useState<'mysql' | 'postgresql' | 'mongodb' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [dbForm, setDbForm] = useState({
    host: 'localhost',
    port: 5432,
    database: '',
    username: '',
    password: '',
  });
  const [dbTest, setDbTest] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });
  const [dbItems, setDbItems] = useState<string[]>([]);
  const [dbSelected, setDbSelected] = useState<Set<string>>(new Set());

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

  const openDbModal = (type: 'mysql' | 'postgresql' | 'mongodb') => {
    setSelectedSource(type);
    setActiveDbModal(type);
    setShowPassword(false);
    setDbTest({ status: 'idle', message: '' });
    setDbItems([]);
    setDbSelected(new Set());

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
    setDbSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const setSelectAll = (checked: boolean) => {
    if (!checked) {
      setDbSelected(new Set());
      return;
    }
    setDbSelected(new Set(dbItems));
  };

  const addDbConnection = async () => {
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
          : `MongoDB - ${dbForm.database}`;

    try {
      const credentials: Record<string, any> = {};

      if (activeDbModal === 'mongodb') {
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

      await connectionService.createConnection({
        name: baseName,
        source_type: activeDbModal,
        description: `Created from Create Database`,
        credentials,
      } as any);

      await queryClient.invalidateQueries({ queryKey: ['connections'] });
      setActiveDbModal(null);
      navigate('/databases');
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to create connection.';
      setDbTest({ status: 'error', message: msg });
    }
  };

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
              backgroundColor: 'white',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 18px 60px rgba(15, 23, 42, 0.25)',
              overflow: 'hidden'
            }}
          >
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                Configure {activeDbModal === 'postgresql' ? 'PostgreSQL' : activeDbModal === 'mysql' ? 'MySQL' : 'MongoDB'}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Enter your connection details</div>
            </div>

            <div style={{ padding: '20px' }}>
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
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px'
                  }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      {activeDbModal === 'mongodb' ? 'Collections' : 'Tables'}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0f172a' }}>
                      <input
                        type="checkbox"
                        checked={dbItems.length > 0 && dbSelected.size === dbItems.length}
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
                        No {activeDbModal === 'mongodb' ? 'collections' : 'tables'} found.
                      </div>
                    ) : (
                      dbItems.map((name) => (
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
