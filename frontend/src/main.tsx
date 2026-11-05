import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import App from './App'
import Register from './pages/Register'
import EmailVerification from './pages/EmailVerification'
import PasswordResetPage from './pages/PasswordResetPage'
import Profile from './pages/Profile';
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { RequireSession } from './features/auth';
import './i18n/config';
import './styles/index.css'

function ExitGuest() {
  const { exitGuestMode } = useAuth();
  const navigate = useNavigate();
  React.useEffect(() => { exitGuestMode(); navigate('/', { replace: true }); }, [exitGuestMode, navigate]);
  return null;
}

function PasswordResetWrapper() {
  const { token: pathToken } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [fragmentToken] = React.useState(() => window.location.hash.slice(1));
  const token = pathToken ?? fragmentToken;

  React.useEffect(() => {
    if (fragmentToken) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [fragmentToken]);
  
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
          <Route path="/verify-email" element={<EmailVerification />} />
          <Route path="/reset-password" element={<PasswordResetWrapper />} />
          <Route path="/reset-password/:token" element={<PasswordResetWrapper />} />
          <Route path="/exit-guest" element={<ExitGuest />} />
          <Route path="/profile" element={<RequireSession><Profile /></RequireSession>} />
        </Routes>
      </AuthProvider>
    </Router>
  </React.StrictMode>
)
