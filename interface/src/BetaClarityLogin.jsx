// Importing React and necessary hooks
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Auth.css';

// Aggiungi gli stili
const styles = {
  platformBadge: {
    fontSize: "0.7rem",            // Leggermente più piccolo
    padding: "3px 12px",           // Più padding orizzontale
    border: "1.5px solid rgba(255, 255, 255, 0.95)", // Bordo più sottile ma più definito
    borderRadius: "14px",          // Bordi più arrotondati
    marginLeft: "4px",  // Ridotto da 8px a 4px per avvicinarlo a BETACLARITY
    color: "rgba(255, 255, 255, 0.95)", // Testo leggermente più soft
    backgroundColor: "transparent",
    textTransform: "lowercase",
    letterSpacing: "1px",          // Più spazio tra le lettere
    fontWeight: "400",             // Font weight più leggero
    fontFamily: "'Inter', sans-serif", // Font più moderno
    textRendering: "optimizeLegibility", // Migliore rendering del testo
    boxShadow: "0 0 10px rgba(255, 255, 255, 0.1)", // Sottile glow
    display: "inline-flex",  // Assicura un migliore allineamento
    alignItems: "center",
  }
};

// Defining the BetaClarityLogin component
export default function BetaClarityLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Function to handle email/password login
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      // For demo, you can use this simple validation
      if (email && password) {
        // Set token for auth state
        localStorage.setItem('token', 'session-placeholder');
        localStorage.setItem('user', email);
        navigate('/app', { replace: true });
      } else {
        setError('Please enter both email and password');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Google Login
  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    
    try {
      // Set token for auth state
      localStorage.setItem('token', 'session-placeholder');
      localStorage.setItem('user', 'user@local');
      navigate('/app', { replace: true });
    } catch (err) {
      console.error('Google login error:', err);
      setError('Google login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Funzione per gestire il click su Sign up
  const handleSignupClick = () => {
    console.log("Navigating to /signup");
    navigate('/signup');
  };

  return (
    <div className="auth-container">
      <div className="auth-contentWrapper">
        <div className="auth-card">
          <div className="auth-brand-container">
            <div className="auth-brand">BETACLARITY</div>
            <span style={styles.platformBadge}>platform</span>
          </div>

          <p className="auth-subtitle">Sign in to your Betaclarity account</p>

          {error && <div className="auth-error">{error}</div>}

          <input
            type="email"
            placeholder="Email"
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="auth-button" onClick={handleEmailLogin}>
            Log In
          </button>

          <div className="auth-divider">
            <span>OR</span>
          </div>

          <button 
            className="google-button"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <img 
              src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg" 
              alt="Google" 
              className="google-icon" 
            />
            Sign in with Google
          </button>

          <div className="auth-footer">
            Don't have an account?
            <button 
              onClick={handleSignupClick}
              className="auth-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Sign up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}