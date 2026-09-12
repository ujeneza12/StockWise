import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import AuthGuard from './components/AuthGuard';
import SessionManager from './components/SessionManager';
import LoginForm from './components/Auth/LoginForm';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import StockManagement from './pages/StockManagement';
import SalesManagement from './pages/SalesManagement';
import DailyReports from './pages/DailyReports';
import UserManagement from './pages/UserManagement';
import CreditPanel from './pages/CreditPanel';

// Security: Add global error handler for auth errors
window.addEventListener('error', (event) => {
  if (event.error?.message?.includes('auth') || 
      event.error?.message?.includes('session') ||
      event.error?.message?.includes('token')) {
    console.warn('Auth-related error detected, clearing cache');
    // Don't automatically clear cache on auth errors
    console.warn('Auth error detected but not clearing cache automatically');
  }
});

function App() {
  React.useEffect(() => {
    // Security: Enhanced auth cache clearing on app initialization
    const urlParams = new URLSearchParams(window.location.search);
    const forceLogout = urlParams.get('logout');
    const forceParam = urlParams.get('force');
    
    if (forceLogout === 'true' || forceParam === 'true') {
      // Only clear on explicit logout
      localStorage.clear();
      sessionStorage.clear();
      // Security: Clear URL parameters after processing
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);


  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <SessionManager />
          <Toaster position="top-right" />
            <Routes>
              {/* Public routes - redirect to dashboard if already logged in */}
              <Route 
                path="/login" 
                element={
                  <AuthGuard requireAuth={false} redirectTo="/dashboard">
                    <LoginForm />
                  </AuthGuard>
                } 
              />
              
              {/* Protected routes */}
              <Route 
                path="/dashboard" 
                element={
                  <AuthGuard requireAuth={true} allowedRoles={['admin', 'manager']}>
                    <Layout>
                      <Dashboard />
                    </Layout>
                  </AuthGuard>
                } 
              />
              
              <Route 
                path="/stock" 
                element={
                  <AuthGuard requireAuth={true} allowedRoles={['admin', 'manager', 'worker']}>
                    <Layout>
                      <StockManagement />
                    </Layout>
                  </AuthGuard>
                } 
              />
              
              <Route 
                path="/sales" 
                element={
                  <AuthGuard requireAuth={true} allowedRoles={['admin', 'manager', 'worker']}>
                    <Layout>
                      <SalesManagement />
                    </Layout>
                  </AuthGuard>
                } 
              />
              
              <Route 
                path="/reports" 
                element={
                  <AuthGuard requireAuth={true} allowedRoles={['admin', 'manager', 'worker']}>
                    <Layout>
                      <DailyReports />
                    </Layout>
                  </AuthGuard>
                } 
              />
              
              <Route 
                path="/users" 
                element={
                  <AuthGuard requireAuth={true} allowedRoles={['admin']}>
                    <Layout>
                      <UserManagement />
                    </Layout>
                  </AuthGuard>
                } 
              />
              
              <Route 
                path="/credits" 
                element={
                  <AuthGuard requireAuth={true} allowedRoles={['admin', 'manager', 'worker']}>
                    <Layout>
                      <CreditPanel />
                    </Layout>
                  </AuthGuard>
                } 
              />
              
              {/* Default redirect */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;