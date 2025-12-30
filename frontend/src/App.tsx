import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { AuthCallback } from './pages/AuthCallback';
import { Register } from './pages/Register';
import { HomePage } from './pages/HomePage';
import { InsightsPage } from './pages/InsightsPage';
import { CreateInsightPage } from './pages/CreateInsightPage';
import { SQLEditorPage } from './pages/SQLEditorPage';
import { VisualizePage } from './pages/VisualizePage';
import { DashboardsPage } from './pages/DashboardsPage';
import { DashboardViewPage } from './pages/DashboardViewPage';
import { EnterpriseShowcase } from './pages/EnterpriseShowcase';
import { DataModelingPage } from './pages/DataModelingPage';
import { DatabasesListPage } from './pages/DatabasesListPage';
import { DatabaseDetailPage } from './pages/DatabaseDetailPage';
import { FileUploadsPage } from './pages/FileUploadsPage';
import { FileDetailPage } from './pages/FileDetailPage';
import { CreateDatabasePage } from './pages/CreateDatabasePage';
import { CreateDashboardPage } from './pages/CreateDashboardPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="/databases" element={<DatabasesListPage />} />
            <Route path="/databases/create" element={<CreateDatabasePage />} />
            <Route path="/databases/file-uploads" element={<FileUploadsPage />} />
            <Route path="/databases/files/:fileId" element={<FileDetailPage />} />
            <Route path="/databases/:connectionId" element={<DatabaseDetailPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/insights/create" element={<CreateInsightPage />} />
            <Route path="/insights/sql-editor" element={<SQLEditorPage />} />
            <Route path="/insights/:id" element={<DashboardViewPage />} />
            <Route path="/visualize" element={<VisualizePage />} />
            <Route path="/model" element={<DataModelingPage />} />
            <Route path="/dashboards" element={<DashboardsPage />} />
            <Route path="/dashboards/new" element={<CreateDashboardPage />} />
            <Route path="/dashboards/:id" element={<DashboardViewPage />} />
            <Route path="/showcase" element={<EnterpriseShowcase />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
