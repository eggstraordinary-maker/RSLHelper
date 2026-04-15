import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import App from './App'
import Register from './pages/Register'
import EmailVerification from './pages/EmailVerification'
import PasswordResetPage from './pages/PasswordResetPage' 
import { AuthProvider } from './contexts/AuthContext'
import './i18n/config';
import './styles/index.css'

function PasswordResetWrapper() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  return <PasswordResetPage 
    token={token} 
    onBack={() => navigate('/')}
  />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email/:token" element={<EmailVerification />} />
          <Route path="/reset-password/:token" element={<PasswordResetWrapper />} />
          <Route path="/exit-guest" element={
            <div style={{ display: 'none' }}>
              {(() => {
                localStorage.removeItem('guest_mode');
                // window.location.href = '/';
                return null;
              })()}
            </div>
          } />
        </Routes>
      </AuthProvider>
    </Router>
  </React.StrictMode>
)