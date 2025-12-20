import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { datasetService } from '../services/datasetService';
import { connectionService } from '../services/connectionService';
import type { Dataset, Connection } from '../types';
import { format } from 'date-fns';

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

// ---------------- Sidebar (Left) ----------------
const DatasetSidebar: React.FC<{
  datasets: Dataset[];
  connections: Connection[];
  selectedDatasets: string[];
  setSelectedDatasets: React.Dispatch<React.SetStateAction<string[]>>;
  onShowSummary: () => void;
}> = ({ datasets, connections, selectedDatasets, setSelectedDatasets, onShowSummary }) => {
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [showMongoModal, setShowMongoModal] = useState(false);
  const [mongoConfig, setMongoConfig] = useState({
    connectionString: 'mongodb://localhost:27017',
    database: '',
    selectedCollections: [] as string[]
  });
  const [isConnectingMongo, setIsConnectingMongo] = useState(false);
  const [mongoCollections, setMongoCollections] = useState<string[]>([]);
  
  const [showMySQLModal, setShowMySQLModal] = useState(false);
  const [mysqlConfig, setMySQLConfig] = useState({
    host: 'localhost',
    port: 3306,
    database: '',
    username: '',
    password: '',
    selectedTables: [] as string[]
  });
  const [isConnectingMySQL, setIsConnectingMySQL] = useState(false);
  const [mysqlTables, setMySQLTables] = useState<string[]>([]);
  
  const [existingDatasetNames, setExistingDatasetNames] = useState<Set<string>>(new Set());
  const [editingConnection, setEditingConnection] = useState<any>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  const ACCEPTED_FORMATS = '.csv,.xlsx,.xls,.json,.txt,.md,.mdx,.pdf';
  const SUPPORTED_EXTENSIONS = ['csv', 'xlsx', 'xls', 'json', 'txt', 'md', 'mdx', 'pdf'];

  // Find file-based connections (CSV, Excel, JSON, TXT, MD, MDX, PDF - used for local file uploads)
  const csvConnections = connections.filter(c => ['csv', 'excel', 'json', 'txt', 'md', 'mdx', 'pdf'].includes(c.source_type));

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (openDropdownId) {
        setOpenDropdownId(null);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openDropdownId]);

  const toggleDataset = (id: string) => {
    setSelectedDatasets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleDeleteDataset = async (datasetId: string, datasetName: string) => {
    if (!confirm(`Are you sure you want to delete "${datasetName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await datasetService.deleteDataset(datasetId);
      // Remove from selected datasets if it was selected
      setSelectedDatasets((prev) => prev.filter((id) => id !== datasetId));
      // Refresh dataset list
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      alert(`Dataset "${datasetName}" deleted successfully.`);
    } catch (error: any) {
      console.error('Delete failed:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to delete dataset: ${errorMsg}`);
    }
  };

  const handleUploadClick = () => {
    if (!selectedConnectionId) {
      alert('Please select a connection first');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const fileList = Array.from(files);
    let successfulUploads = 0;
    let failedUploads = 0;

    for (const file of fileList) {
      setUploadStatus(`Uploading ${successfulUploads + failedUploads + 1} of ${fileList.length}: ${file.name}`);

      // Validation
      const fileExt = file.name.toLowerCase().split('.').pop() || '';
      if (!SUPPORTED_EXTENSIONS.includes(fileExt)) {
        alert(`Skipping ${file.name}: Only CSV, Excel, JSON, TXT, Markdown, MDX, and PDF (.csv, .xlsx, .xls, .json, .txt, .md, .mdx, .pdf) files are supported.`);
        failedUploads++;
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        alert(`Skipping ${file.name}: Exceeds ${formatFileSize(MAX_FILE_SIZE)} limit.`);
        failedUploads++;
        continue;
      }

      // Check for duplicate dataset name
      const baseDatasetName = file.name.replace(/\.(csv|xlsx|xls|json|txt|md|mdx|pdf)$/i, '');
      const duplicateDataset = datasets.find(ds => ds.name === baseDatasetName);
      
      let datasetName = baseDatasetName;
      if (duplicateDataset) {
        const newName = prompt(
          `A dataset named "${baseDatasetName}" already exists.\n\nPlease enter a new name for this file:`,
          `${baseDatasetName}_new`
        );
        
        if (!newName) {
          alert(`Skipping ${file.name}: Upload cancelled.`);
          failedUploads++;
          continue;
        }
        
        // Check if the new name also exists
        const stillDuplicate = datasets.find(ds => ds.name === newName);
        if (stillDuplicate) {
          alert(`Skipping ${file.name}: Dataset named "${newName}" already exists.`);
          failedUploads++;
          continue;
        }
        
        datasetName = newName;
      }

      // Auto-detect and select the correct connection based on file type
      let connectionId = selectedConnectionId;
      let sourceType: 'csv' | 'excel' | 'json' | 'txt' | 'md' | 'mdx' | 'pdf' = 'csv';
      
      if (fileExt === 'csv') {
        sourceType = 'csv';
      } else if (fileExt === 'xlsx' || fileExt === 'xls') {
        sourceType = 'excel';
      } else if (fileExt === 'json') {
        sourceType = 'json';
      } else if (fileExt === 'txt') {
        sourceType = 'txt';
      } else if (fileExt === 'md') {
        sourceType = 'md';
      } else if (fileExt === 'mdx') {
        sourceType = 'mdx';
      } else if (fileExt === 'pdf') {
        sourceType = 'pdf';
      }

      // Find the appropriate connection for this file type
      let appropriateConnection = csvConnections.find(conn => conn.source_type === sourceType);
      
      // If connection doesn't exist, create it automatically
      if (!appropriateConnection) {
        try {
          console.log(`Creating ${sourceType.toUpperCase()} connection automatically...`);
          const newConnection = await connectionService.createConnection({
            name: `My ${sourceType.toUpperCase()} Files`,
            source_type: sourceType,
            description: `Auto-created connection for ${sourceType.toUpperCase()} file uploads`,
            credentials: { files: [] }
          });
          appropriateConnection = newConnection;
          // Refresh connections list
          queryClient.invalidateQueries({ queryKey: ['connections'] });
        } catch (error: any) {
          console.error(`Failed to create ${sourceType} connection:`, error);
          alert(`Skipping ${file.name}: Failed to create ${sourceType.toUpperCase()} connection. ${error.response?.data?.detail || error.message}`);
          failedUploads++;
          continue;
        }
      }

      connectionId = appropriateConnection.id;

      // Upload with correct connection_id (using the potentially renamed datasetName)
      try {
        const result = await datasetService.uploadFile(
          file,
          connectionId,
          datasetName,
          'Uploaded from dashboard'
        );
        // Check if upload was successful
        if (result.success && result.datasets_created > 0) {
          successfulUploads++;
        } else {
          failedUploads++;
        }
      } catch (error: any) {
        console.error(`Upload failed for ${file.name}:`, error);
        const errorMsg = error.response?.data?.detail || error.message || 'Unknown error';
        alert(`Upload failed for ${file.name}: ${errorMsg}`);
        failedUploads++;
      }
    }

    setIsUploading(false);
    setUploadStatus('');

    // Refresh dataset list
    queryClient.invalidateQueries({ queryKey: ['datasets'] });

    // Show final message
    const finalMessage = `Upload complete. ${successfulUploads} file(s) successfully uploaded, ${failedUploads} failed.`;
    alert(finalMessage);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTestMongoConnection = async () => {
    if (!mongoConfig.connectionString || !mongoConfig.database) {
      alert('Please provide connection string and database name');
      return;
    }

    setIsConnectingMongo(true);
    try {
      const testResult = await connectionService.testConnection('mongodb', {
        connection_string: mongoConfig.connectionString,
        database: mongoConfig.database
      });

      if (testResult.success) {
        alert(`✅ ${testResult.message}`);
        // Store collections for selection
        if (testResult.metadata?.collections) {
          const collections = testResult.metadata.collections;
          setMongoCollections(collections);
          
          // Auto-select all collections by default (or keep existing selection when editing)
          if (!editingConnection || mongoConfig.selectedCollections.length === 0) {
            setMongoConfig({ ...mongoConfig, selectedCollections: collections });
          }
        }
        
        // Load existing dataset names to check for duplicates
        try {
          const datasets = await datasetService.getDatasets();
          const names = new Set(datasets.map((d: any) => d.name));
          setExistingDatasetNames(names);
        } catch (error) {
          console.error('Failed to load existing datasets:', error);
        }
      } else {
        alert(`❌ ${testResult.message}`);
      }
    } catch (error: any) {
      alert(`Connection test failed: ${error.message}`);
    } finally {
      setIsConnectingMongo(false);
    }
  };

  const handleConnectMongoDB = async () => {
    if (!mongoConfig.connectionString || !mongoConfig.database) {
      alert('Please provide connection string and database');
      return;
    }

    if (mongoConfig.selectedCollections.length === 0) {
      alert('Please select at least one collection');
      return;
    }

    setIsConnectingMongo(true);
    try {
      if (editingConnection) {
        // Update existing connection
        await connectionService.updateConnection(editingConnection.id, {
          name: mongoConfig.database !== editingConnection.credentials?.database 
            ? `MongoDB - ${mongoConfig.database}` 
            : editingConnection.name,
          credentials: {
            connection_string: mongoConfig.connectionString,
            database: mongoConfig.database,
            selected_collections: mongoConfig.selectedCollections
          },
          description: `MongoDB database connection - ${mongoConfig.selectedCollections.length} collection(s) selected`
        });

        alert(`✅ Successfully updated connection: ${editingConnection.name}`);
      } else {
        // Create new MongoDB connection
        const connection = await connectionService.createConnection({
          name: `MongoDB - ${mongoConfig.database}`,
          source_type: 'mongodb',
          credentials: {
            connection_string: mongoConfig.connectionString,
            database: mongoConfig.database,
            selected_collections: mongoConfig.selectedCollections
          },
          description: `MongoDB database connection - ${mongoConfig.selectedCollections.length} collection(s) selected`
        });

        alert(`✅ Successfully connected to MongoDB database: ${mongoConfig.database}\n📊 ${mongoConfig.selectedCollections.length} collection(s) selected: ${mongoConfig.selectedCollections.join(', ')}`);
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      
      // Reset and close modal
      setShowMongoModal(false);
      setMongoConfig({
        connectionString: 'mongodb://localhost:27017',
        database: '',
        selectedCollections: []
      });
      setMongoCollections([]);
      setExistingDatasetNames(new Set());
      setEditingConnection(null);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to ${editingConnection ? 'update' : 'connect'}: ${errorMsg}`);
    } finally {
      setIsConnectingMongo(false);
    }
  };

  const handleTestMySQLConnection = async () => {
    if (!mysqlConfig.host || !mysqlConfig.database || !mysqlConfig.username) {
      alert('Please provide host, database, and username');
      return;
    }

    setIsConnectingMySQL(true);
    try {
      const testResult = await connectionService.testConnection('mysql', {
        host: mysqlConfig.host,
        port: mysqlConfig.port,
        database: mysqlConfig.database,
        username: mysqlConfig.username,
        password: mysqlConfig.password
      });

      if (testResult.success) {
        alert(`✅ ${testResult.message}`);
        if (testResult.metadata?.tables) {
          const tables = testResult.metadata.tables;
          setMySQLTables(tables);
          
          // Auto-select all tables by default (or keep existing selection when editing)
          if (!editingConnection || mysqlConfig.selectedTables.length === 0) {
            setMySQLConfig({ ...mysqlConfig, selectedTables: tables });
          }
        }
      } else {
        alert(`❌ ${testResult.message}`);
      }
    } catch (error: any) {
      alert(`Connection test failed: ${error.message}`);
    } finally {
      setIsConnectingMySQL(false);
    }
  };

  const handleConnectMySQL = async () => {
    if (!mysqlConfig.host || !mysqlConfig.database || !mysqlConfig.username) {
      alert('Please provide host, database, and username');
      return;
    }

    if (mysqlConfig.selectedTables.length === 0) {
      alert('Please select at least one table');
      return;
    }

    setIsConnectingMySQL(true);
    try {
      if (editingConnection) {
        // Update existing connection
        await connectionService.updateConnection(editingConnection.id, {
          name: mysqlConfig.database !== editingConnection.credentials?.database 
            ? `MySQL - ${mysqlConfig.database}` 
            : editingConnection.name,
          credentials: {
            host: mysqlConfig.host,
            port: mysqlConfig.port,
            database: mysqlConfig.database,
            username: mysqlConfig.username,
            password: mysqlConfig.password,
            selected_tables: mysqlConfig.selectedTables
          },
          description: `MySQL database connection - ${mysqlConfig.selectedTables.length} table(s) selected`
        });

        alert(`✅ Successfully updated connection: ${editingConnection.name}`);
      } else {
        // Create new MySQL connection
        await connectionService.createConnection({
          name: `MySQL - ${mysqlConfig.database}`,
          source_type: 'mysql',
          credentials: {
            host: mysqlConfig.host,
            port: mysqlConfig.port,
            database: mysqlConfig.database,
            username: mysqlConfig.username,
            password: mysqlConfig.password,
            selected_tables: mysqlConfig.selectedTables
          },
          description: `MySQL database connection - ${mysqlConfig.selectedTables.length} table(s) selected`
        });

        alert(`✅ Successfully connected to MySQL database: ${mysqlConfig.database}\n📊 ${mysqlConfig.selectedTables.length} table(s) selected: ${mysqlConfig.selectedTables.join(', ')}`);
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      
      // Reset and close modal
      setShowMySQLModal(false);
      setMySQLConfig({
        host: 'localhost',
        port: 3306,
        database: '',
        username: '',
        password: '',
        selectedTables: []
      });
      setMySQLTables([]);
      setEditingConnection(null);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to ${editingConnection ? 'update' : 'connect'}: ${errorMsg}`);
    } finally {
      setIsConnectingMySQL(false);
    }
  };

  return (
    <div style={{
      width: '320px',
      backgroundColor: 'white',
      borderRight: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden'
    }}>
      {/* Sidebar Header */}
      <div style={{
        padding: '24px 20px',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <h2 style={{
          fontSize: '16px',
          fontWeight: 700,
          color: '#0f172a',
          marginBottom: '4px'
        }}>
          Data Selection
        </h2>
        <p style={{ fontSize: '13px', color: '#64748b' }}>
          Choose datasets to visualize
        </p>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Upload Section */}
        <div style={{
          backgroundColor: '#f8fafc',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '20px',
          border: '1px solid #e2e8f0'
        }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            color: '#475569',
            marginBottom: '8px'
          }}>
            Add Data Source
          </label>
          <select
            value={selectedConnectionId ? 'local' : ''}
            onChange={(e) => {
              if (e.target.value === 'local' && csvConnections.length > 0) {
                setSelectedConnectionId(csvConnections[0].id);
              } else if (e.target.value === 'mongodb') {
                setShowMongoModal(true);
              } else if (e.target.value === 'mysql') {
                setShowMySQLModal(true);
              } else {
                setSelectedConnectionId('');
              }
            }}
            disabled={isUploading || csvConnections.length === 0}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '13px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              backgroundColor: 'white',
              marginBottom: '10px',
              cursor: isUploading || csvConnections.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            <option value="">Select source...</option>
            <option value="local">💻 From My Computer</option>
            <option value="mongodb">🍃 MongoDB Database</option>
            <option value="mysql">🐬 MySQL Database</option>
          </select>

          {csvConnections.length === 0 && (
            <div style={{
              padding: '10px',
              backgroundColor: '#fef3c7',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#92400e',
              border: '1px solid #fde68a'
            }}>
              No connection available. Please create a connection first.
            </div>
          )}

          {selectedConnectionId && (
            <>
              {/* Supported Formats Info */}
              <div style={{
                padding: '12px',
                backgroundColor: '#eff6ff',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#1e40af',
                border: '1px solid #bfdbfe',
                marginBottom: '12px',
                lineHeight: '1.5'
              }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>📁 Supported formats:</div>
                <div>CSV, Excel, JSON, TXT, Markdown, MDX, PDF</div>
                <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
                  (.csv, .xlsx, .xls, .json, .txt, .md, .mdx, .pdf)
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FORMATS}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              <button
                onClick={handleUploadClick}
                disabled={isUploading}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  backgroundColor: isUploading ? '#cbd5e1' : '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isUploading) {
                    e.currentTarget.style.backgroundColor = '#4338ca';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isUploading) {
                    e.currentTarget.style.backgroundColor = '#4f46e5';
                  }
                }}
              >
                {isUploading ? '⏳ Uploading...' : '📤 Upload Files'}
              </button>

              {isUploading && uploadStatus && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px',
                  backgroundColor: '#eff6ff',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#1e40af',
                  border: '1px solid #bfdbfe'
                }}>
                  {uploadStatus}
                </div>
              )}
            </>
          )}
        </div>

        {/* Dataset Selection */}
        <div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={isUploading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: 600,
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              backgroundColor: 'white',
              color: '#0f172a',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              opacity: isUploading ? 0.5 : 1,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (!isUploading) e.currentTarget.style.borderColor = '#4f46e5';
            }}
            onMouseLeave={(e) => {
              if (!isUploading) e.currentTarget.style.borderColor = '#cbd5e1';
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedDatasets.length > 0
                ? `${selectedDatasets.length} dataset${selectedDatasets.length > 1 ? 's' : ''} selected`
                : 'Select datasets'}
            </span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{open ? '▲' : '▼'}</span>
          </button>

          {open && (
            <div style={{
              marginTop: '12px',
              maxHeight: '400px',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              backgroundColor: 'white'
            }}>
              {datasets.length === 0 ? (
                <div style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontSize: '13px'
                }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
                  No datasets available
                </div>
              ) : (
                datasets.map((ds) => (
                  <div
                    key={ds.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      fontSize: '13px',
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: selectedDatasets.includes(ds.id) ? '#f8fafc' : 'white',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!selectedDatasets.includes(ds.id)) {
                        e.currentTarget.style.backgroundColor = '#f8fafc';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selectedDatasets.includes(ds.id)) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDatasets.includes(ds.id)}
                      onChange={() => toggleDataset(ds.id)}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        accentColor: '#4f46e5'
                      }}
                    />
                    <div
                      style={{ flex: 1, cursor: 'pointer' }}
                      onClick={() => toggleDataset(ds.id)}
                    >
                      <div style={{
                        fontWeight: 600,
                        color: '#0f172a',
                        marginBottom: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {ds.name}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#64748b'
                      }}>
                        {ds.column_count || 0} columns • {formatFileSize(ds.file_size || 0)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDataset(ds.id, ds.name);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: '4px',
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '6px',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#fee2e2';
                        e.currentTarget.style.color = '#ef4444';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = '#cbd5e1';
                      }}
                      title="Delete dataset"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* MongoDB Connection Modal */}
      {showMongoModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
                {editingConnection ? '✏️ Edit MongoDB Connection' : '🍃 Connect to MongoDB'}
              </h3>
              <button
                onClick={() => {
                  setShowMongoModal(false);
                  setMongoConfig({ connectionString: 'mongodb://localhost:27017', database: '', selectedCollections: [] });
                  setMongoCollections([]);
                  setExistingDatasetNames(new Set());
                  setEditingConnection(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                Connection String *
              </label>
              <input
                type="text"
                value={mongoConfig.connectionString}
                onChange={(e) => setMongoConfig({ ...mongoConfig, connectionString: e.target.value })}
                placeholder="mongodb://localhost:27017"
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '13px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                Database Name *
              </label>
              <input
                type="text"
                value={mongoConfig.database}
                onChange={(e) => setMongoConfig({ ...mongoConfig, database: e.target.value })}
                placeholder="myDatabase"
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '13px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={handleTestMongoConnection}
              disabled={isConnectingMongo || !mongoConfig.connectionString || !mongoConfig.database}
              style={{
                width: '100%',
                padding: '10px',
                marginBottom: '16px',
                backgroundColor: isConnectingMongo ? '#cbd5e1' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isConnectingMongo || !mongoConfig.connectionString || !mongoConfig.database ? 'not-allowed' : 'pointer'
              }}
            >
              {isConnectingMongo ? '🔄 Testing...' : '🧪 Test Connection'}
            </button>

            {mongoCollections.length > 0 && (
              <>
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#166534', marginBottom: '8px' }}>
                    ✅ Connection Successful
                  </div>
                  <div style={{ fontSize: '12px', color: '#15803d' }}>
                    Found {mongoCollections.length} collection(s)
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                      Select Collections
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setMongoConfig({ ...mongoConfig, selectedCollections: mongoCollections })}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => setMongoConfig({ ...mongoConfig, selectedCollections: [] })}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          backgroundColor: '#6b7280',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  
                  <div style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '8px',
                    backgroundColor: '#f8fafc'
                  }}>
                    {mongoCollections.map((collection) => (
                      <label
                        key={collection}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '6px 8px',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#e2e8f0';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={mongoConfig.selectedCollections.includes(collection)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setMongoConfig({
                                ...mongoConfig,
                                selectedCollections: [...mongoConfig.selectedCollections, collection]
                              });
                            } else {
                              setMongoConfig({
                                ...mongoConfig,
                                selectedCollections: mongoConfig.selectedCollections.filter(c => c !== collection)
                              });
                            }
                          }}
                          style={{
                            marginRight: '8px',
                            cursor: 'pointer'
                          }}
                        />
                        <span style={{ fontSize: '12px', color: '#1e293b' }}>{collection}</span>
                      </label>
                    ))}
                  </div>
                  
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                    {mongoConfig.selectedCollections.length} of {mongoCollections.length} collection(s) selected
                  </div>
                </div>

                <button
                  onClick={handleConnectMongoDB}
                  disabled={isConnectingMongo || mongoConfig.selectedCollections.length === 0}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: isConnectingMongo || mongoConfig.selectedCollections.length === 0 ? '#cbd5e1' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isConnectingMongo || mongoConfig.selectedCollections.length === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isConnectingMongo ? (editingConnection ? '🔄 Updating...' : '🔄 Connecting...') : (editingConnection ? '✅ Update Connection' : '✅ Save Connection')}
                </button>
              </>
            )}

            <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#eff6ff', borderRadius: '6px', fontSize: '12px', color: '#1e40af' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>💡 Tips:</div>
              <div>• localhost:27017 for local MongoDB</div>
              <div>• Test connection to see available collections</div>
              <div>• Select specific collections or use "Select All"</div>
              <div>• Data is queried directly (not imported)</div>
              <div>• Best for large datasets - no storage overhead</div>
            </div>
          </div>
        </div>
      )}

      {/* MySQL Connection Modal */}
      {showMySQLModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '500px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '20px 20px 0' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
                {editingConnection ? '✏️ Edit MySQL Connection' : '🐬 Connect to MySQL'}
              </h3>
              <button onClick={() => { setShowMySQLModal(false); setMySQLConfig({ host: 'localhost', port: 3306, database: '', username: '', password: '', selectedTables: [] }); setMySQLTables([]); setEditingConnection(null); }} style={{ padding: '4px 8px', fontSize: '20px', backgroundColor: 'transparent', color: '#64748b', border: 'none', cursor: 'pointer' }}>×</button>
            </div>
            
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Host *</label>
                <input type="text" value={mysqlConfig.host} onChange={(e) => setMySQLConfig({ ...mysqlConfig, host: e.target.value })} placeholder="localhost" style={{ width: '100%', padding: '10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Port</label>
                <input type="number" value={mysqlConfig.port} onChange={(e) => setMySQLConfig({ ...mysqlConfig, port: parseInt(e.target.value) || 3306 })} placeholder="3306" style={{ width: '100%', padding: '10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Database Name *</label>
                <input type="text" value={mysqlConfig.database} onChange={(e) => setMySQLConfig({ ...mysqlConfig, database: e.target.value })} placeholder="myDatabase" style={{ width: '100%', padding: '10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Username *</label>
                <input type="text" value={mysqlConfig.username} onChange={(e) => setMySQLConfig({ ...mysqlConfig, username: e.target.value })} placeholder="root" style={{ width: '100%', padding: '10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Password</label>
                <input type="password" value={mysqlConfig.password} onChange={(e) => setMySQLConfig({ ...mysqlConfig, password: e.target.value })} placeholder="••••••••" style={{ width: '100%', padding: '10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>

              <button onClick={handleTestMySQLConnection} disabled={isConnectingMySQL || !mysqlConfig.host || !mysqlConfig.database || !mysqlConfig.username} style={{ width: '100%', padding: '10px', marginBottom: '16px', backgroundColor: isConnectingMySQL ? '#cbd5e1' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: isConnectingMySQL || !mysqlConfig.host || !mysqlConfig.database || !mysqlConfig.username ? 'not-allowed' : 'pointer' }}>
                {isConnectingMySQL ? '🔄 Testing...' : '🧪 Test Connection'}
              </button>

              {mysqlTables.length > 0 && (
                <>
                  <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#166534', marginBottom: '8px' }}>✅ Connection Successful</div>
                    <div style={{ fontSize: '12px', color: '#15803d' }}>Found {mysqlTables.length} table(s)</div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Select Tables</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setMySQLConfig({ ...mysqlConfig, selectedTables: mysqlTables })} style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Select All</button>
                        <button onClick={() => setMySQLConfig({ ...mysqlConfig, selectedTables: [] })} style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Clear All</button>
                      </div>
                    </div>
                    
                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', backgroundColor: '#f8fafc' }}>
                      {mysqlTables.map((table) => (
                        <label key={table} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', cursor: 'pointer', borderRadius: '4px', transition: 'background-color 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e2e8f0'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                          <input type="checkbox" checked={mysqlConfig.selectedTables.includes(table)} onChange={(e) => { if (e.target.checked) { setMySQLConfig({ ...mysqlConfig, selectedTables: [...mysqlConfig.selectedTables, table] }); } else { setMySQLConfig({ ...mysqlConfig, selectedTables: mysqlConfig.selectedTables.filter(t => t !== table) }); } }} style={{ marginRight: '8px', cursor: 'pointer' }} />
                          <span style={{ fontSize: '12px', color: '#1e293b' }}>{table}</span>
                        </label>
                      ))}
                    </div>
                    
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                      {mysqlConfig.selectedTables.length} of {mysqlTables.length} table(s) selected
                    </div>
                  </div>

                  <button onClick={handleConnectMySQL} disabled={isConnectingMySQL || mysqlConfig.selectedTables.length === 0} style={{ width: '100%', padding: '12px', backgroundColor: isConnectingMySQL || mysqlConfig.selectedTables.length === 0 ? '#cbd5e1' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: isConnectingMySQL || mysqlConfig.selectedTables.length === 0 ? 'not-allowed' : 'pointer' }}>
                    {isConnectingMySQL ? (editingConnection ? '🔄 Updating...' : '🔄 Connecting...') : (editingConnection ? '✅ Update Connection' : '✅ Save Connection')}
                  </button>
                </>
              )}

              <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#eff6ff', borderRadius: '6px', fontSize: '12px', color: '#1e40af' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>💡 Tips:</div>
                <div>• Default port is 3306</div>
                <div>• Test connection to see available tables</div>
                <div>• Select specific tables or use "Select All"</div>
                <div>• Data is queried directly (not imported)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MongoDB Connections Section */}
      {connections.filter(c => c.source_type === 'mongodb').length > 0 && (
        <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🍃 MongoDB Connections
          </h4>
          {connections.filter((c: any) => c.source_type === 'mongodb').map((conn: any) => (
            <div key={conn.id} style={{
              padding: '12px',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              marginBottom: '8px',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e40af' }}>
                  {conn.name}
                </div>
                
                {/* Three-dot menu */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenDropdownId(openDropdownId === conn.id ? null : conn.id);
                    }}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'transparent',
                      color: '#1e40af',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#dbeafe';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    ⋮
                  </button>
                  
                  {/* Dropdown menu */}
                  {openDropdownId === conn.id && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        zIndex: 1000,
                        minWidth: '140px'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdownId(null);
                      }}
                    >
                      <button
                        onClick={async () => {
                          try {
                            // Fetch full connection details to get credentials
                            const fullConn = await connectionService.getConnectionById(conn.id);
                            const selectedColls = fullConn.credentials?.selected_collections || [];
                            
                            setMongoConfig({
                              connectionString: fullConn.credentials?.connection_string || 'mongodb://localhost:27017',
                              database: fullConn.credentials?.database || '',
                              selectedCollections: selectedColls
                            });
                            
                            // Load all available collections for editing
                            try {
                              const testResult = await connectionService.testConnection('mongodb', {
                                connection_string: fullConn.credentials?.connection_string,
                                database: fullConn.credentials?.database
                              });
                              if (testResult.success && testResult.metadata?.collections) {
                                setMongoCollections(testResult.metadata.collections);
                              }
                            } catch (error) {
                              console.error('Failed to load collections:', error);
                            }
                            
                            setEditingConnection(fullConn);
                            setShowMongoModal(true);
                          } catch (error: any) {
                            const errorMsg = error.response?.data?.detail || error.message || 'Unknown error';
                            alert(`Failed to load connection details: ${errorMsg}`);
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          backgroundColor: 'transparent',
                          color: '#0f172a',
                          border: 'none',
                          textAlign: 'left',
                          fontSize: '13px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          borderRadius: '6px 6px 0 0'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8fafc';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        ✏️ Edit
                      </button>
                      
                      <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '0 8px' }} />
                      
                      <button
                        onClick={async () => {
                          if (confirm(`Are you sure you want to delete the connection "${conn.name}"?`)) {
                            try {
                              await connectionService.deleteConnection(conn.id);
                              queryClient.invalidateQueries({ queryKey: ['connections'] });
                              alert('✅ Connection deleted successfully');
                            } catch (error: any) {
                              const errorMsg = error.response?.data?.detail || error.message || 'Unknown error';
                              alert(`Failed to delete connection: ${errorMsg}`);
                            }
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          backgroundColor: 'transparent',
                          color: '#dc2626',
                          border: 'none',
                          textAlign: 'left',
                          fontSize: '13px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          borderRadius: '0 0 6px 6px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#fef2f2';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <button
                onClick={() => {
                  (window as any).location.href = `/visualize?connections=${conn.id}`;
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                }}
              >
                📊 Query & Visualize
              </button>
            </div>
          ))}
        </div>
      )}

      {/* MySQL Connections Section */}
      {connections.filter(c => c.source_type === 'mysql').length > 0 && (
        <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🐬 MySQL Connections
          </h4>
          {connections.filter((c: any) => c.source_type === 'mysql').map((conn: any) => (
            <div key={conn.id} style={{ padding: '12px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', marginBottom: '8px', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#075985' }}>
                  {conn.name}
                </div>
                
                <div style={{ position: 'relative' }}>
                  <button onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === conn.id ? null : conn.id); }} style={{ padding: '4px 8px', backgroundColor: 'transparent', color: '#075985', border: 'none', borderRadius: '4px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e0f2fe'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>⋮</button>
                  
                  {openDropdownId === conn.id && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', zIndex: 1000, minWidth: '140px' }} onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); }}>
                      <button onClick={async () => { try { const fullConn = await connectionService.getConnectionById(conn.id); const selectedTables = fullConn.credentials?.selected_tables || []; setMySQLConfig({ host: fullConn.credentials?.host || 'localhost', port: fullConn.credentials?.port || 3306, database: fullConn.credentials?.database || '', username: fullConn.credentials?.username || '', password: fullConn.credentials?.password || '', selectedTables: selectedTables }); try { const testResult = await connectionService.testConnection('mysql', { host: fullConn.credentials?.host, port: fullConn.credentials?.port, database: fullConn.credentials?.database, username: fullConn.credentials?.username, password: fullConn.credentials?.password }); if (testResult.success && testResult.metadata?.tables) { setMySQLTables(testResult.metadata.tables); } } catch (error) { console.error('Failed to load tables:', error); } setEditingConnection(fullConn); setShowMySQLModal(true); } catch (error: any) { const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'; alert(`Failed to load connection details: ${errorMsg}`); } }} style={{ width: '100%', padding: '10px 16px', backgroundColor: 'transparent', color: '#0f172a', border: 'none', textAlign: 'left', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', borderRadius: '6px 6px 0 0' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>✏️ Edit</button>
                      
                      <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '0 8px' }} />
                      
                      <button onClick={async () => { if (confirm(`Are you sure you want to delete the connection "${conn.name}"?`)) { try { await connectionService.deleteConnection(conn.id); queryClient.invalidateQueries({ queryKey: ['connections'] }); alert('✅ Connection deleted successfully'); } catch (error: any) { const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'; alert(`Failed to delete connection: ${errorMsg}`); } } }} style={{ width: '100%', padding: '10px 16px', backgroundColor: 'transparent', color: '#dc2626', border: 'none', textAlign: 'left', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', borderRadius: '0 0 6px 6px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fef2f2'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>🗑️ Delete</button>
                    </div>
                  )}
                </div>
              </div>
              
              <button onClick={() => { (window as any).location.href = `/visualize?connections=${conn.id}`; }} style={{ width: '100%', padding: '8px 12px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0284c7'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0ea5e9'; }}>📊 Query & Visualize</button>
            </div>
          ))}
        </div>
      )}

      {/* Sidebar Footer - Action Buttons */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid #e2e8f0',
        backgroundColor: '#f8fafc'
      }}>
        <button
          type="button"
          onClick={onShowSummary}
          disabled={selectedDatasets.length === 0}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '12px 16px',
            backgroundColor: selectedDatasets.length === 0 ? '#cbd5e1' : '#10b981',
            color: 'white',
            fontSize: '14px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '10px',
            cursor: selectedDatasets.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            if (selectedDatasets.length > 0) {
              e.currentTarget.style.backgroundColor = '#059669';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            if (selectedDatasets.length > 0) {
              e.currentTarget.style.backgroundColor = '#10b981';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          <span style={{ fontSize: '16px' }}>📊</span>
          <span>View Summary</span>
        </button>
      </div>
    </div>
  );
};

// ---------------- Summary Table Component ----------------
const SummaryTable: React.FC<{
  datasets: Dataset[];
}> = ({ datasets }) => {
  const navigate = useNavigate();
  const [selectedForVisualize, setSelectedForVisualize] = useState<string[]>([]);

  const toggleVisualize = (id: string) => {
    setSelectedForVisualize((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (selectedForVisualize.length > 0) {
      navigate(`/visualize?datasets=${selectedForVisualize.join(',')}`);
    }
  };

  return (
    <div style={{ padding: '32px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '16px' }}>
        Dataset Summary ({datasets.length} selected)
      </h2>

      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Table Name
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Date Uploaded
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Columns
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Size
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Visualize
              </th>
            </tr>
          </thead>
          <tbody>
            {datasets.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                  No datasets selected
                </td>
              </tr>
            ) : (
              datasets.map((ds, index) => (
                <tr
                  key={ds.id}
                  style={{
                    borderBottom: index < datasets.length - 1 ? '1px solid #f3f4f6' : 'none'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', fontWeight: 500 }}>
                    {ds.name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                    {format(new Date(ds.created_at), 'MMM d, yyyy')}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                    {ds.column_count || 0}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                    {formatFileSize(ds.file_size || 0)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedForVisualize.includes(ds.id)}
                      onChange={() => toggleVisualize(ds.id)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Submit Button */}
      {selectedForVisualize.length > 0 && (
        <div style={{ marginTop: '16px', textAlign: 'right' }}>
          <button
            type="button"
            onClick={handleSubmit}
            style={{
              padding: '10px 24px',
              backgroundColor: '#8b5cf6',
              color: 'white',
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#7c3aed'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#8b5cf6'}
          >
            Submit ({selectedForVisualize.length} selected)
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------- Main Dashboard ----------------
export const Dashboard: React.FC = () => {
  const [showSummary, setShowSummary] = useState(false);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);

  const { data: datasets = [], isLoading: datasetsLoading } = useQuery<Dataset[]>({
    queryKey: ['datasets'],
    queryFn: () => datasetService.getDatasets(),
  });

  const { data: connections = [], isLoading: connectionsLoading } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => connectionService.getConnections(),
  });

  if (datasetsLoading || connectionsLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <div style={{ width: '40px', height: '40px', border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  // Filter datasets to show only selected ones
  const selectedDatasetObjects = datasets.filter(ds => selectedDatasets.includes(ds.id));

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <DatasetSidebar
        datasets={datasets}
        connections={connections}
        selectedDatasets={selectedDatasets}
        setSelectedDatasets={setSelectedDatasets}
        onShowSummary={() => setShowSummary(true)}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
        {/* Top Bar */}
        <div style={{
          backgroundColor: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '24px 32px',
        }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <h1 style={{
              fontSize: '28px',
              fontWeight: 700,
              color: '#0f172a',
              marginBottom: '8px',
              letterSpacing: '-0.5px'
            }}>
              Data Sources
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', fontWeight: 400 }}>
              Connect, upload, and manage your data sources
            </p>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {showSummary ? (
              <SummaryTable datasets={selectedDatasetObjects} />
            ) : (
              <>
                {/* Quick Actions Banner */}
                <div style={{
                  backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '16px',
                  padding: '32px',
                  marginBottom: '32px',
                  color: 'white',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
                        Ready to visualize your data?
                      </h2>
                      <p style={{ fontSize: '15px', opacity: 0.95, marginBottom: '20px', lineHeight: '1.6' }}>
                        Select datasets from the sidebar, create stunning visualizations, and save them as dashboards
                      </p>
                      <button
                        onClick={() => window.location.href = '/dashboards'}
                        style={{
                          padding: '12px 24px',
                          backgroundColor: 'white',
                          color: '#667eea',
                          border: 'none',
                          borderRadius: '10px',
                          fontSize: '14px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                        }}
                      >
                        📊 View My Dashboards
                      </button>
                    </div>
                    <div style={{ fontSize: '120px', opacity: 0.2, marginLeft: '40px' }}>
                      📈
                    </div>
                  </div>
                </div>

                {/* Stats Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '20px',
                  marginBottom: '32px'
                }}>
                  <div style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '24px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>
                      Total Data Sources
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#0f172a' }}>
                      {datasets.length}
                    </div>
                  </div>
                  <div style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '24px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>
                      Selected
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#4f46e5' }}>
                      {selectedDatasets.length}
                    </div>
                  </div>
                  <div style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '24px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>
                      Connections
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#0f172a' }}>
                      {connections.length}
                    </div>
                  </div>
                </div>

                {/* Empty State or Instructions */}
                {datasets.length === 0 && (
                  <div style={{
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    padding: '64px 32px',
                    textAlign: 'center',
                    border: '2px dashed #e2e8f0'
                  }}>
                    <div style={{ fontSize: '64px', marginBottom: '16px' }}>📁</div>
                    <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>
                      No data sources yet
                    </h3>
                    <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '400px', margin: '0 auto' }}>
                      Upload your first file or connect to a database to get started
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};