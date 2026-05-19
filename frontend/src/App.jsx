import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import AdminLayout from './components/Layout/AdminLayout';
import Dashboard from './pages/Dashboard';
import EditorialList from './pages/Editorial/EditorialList';
import EditorialDetail from './pages/Editorial/EditorialDetail';
import AllPosts from './pages/AllPosts';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('admin_token');
  const user = JSON.parse(localStorage.getItem('admin_user') || '{}');
  
  if (!token || !user.isAdmin) {
    return <Navigate to="/login" replace />;
  }
  
  return <AdminLayout>{children}</AdminLayout>;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Dashboard Routes */}
        <Route 
          path="/dashboard" 
          element={<ProtectedRoute><Dashboard /></ProtectedRoute>} 
        />
        <Route 
          path="/editorial" 
          element={<ProtectedRoute><EditorialList /></ProtectedRoute>} 
        />
        <Route 
          path="/editorial/:id" 
          element={<ProtectedRoute><EditorialDetail /></ProtectedRoute>} 
        />
        <Route 
          path="/posts" 
          element={<ProtectedRoute><AllPosts /></ProtectedRoute>} 
        />

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '16px',
            fontSize: '13px',
            fontWeight: '600'
          },
        }}
      />
    </Router>
  );
}

export default App;
