import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Auth.css';

export default function BetaClarityRegister() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      // Basic validation
      if (!email || !password || !confirmPassword) {
        setError('Please fill in all fields');
        setLoading(false);
        return;
      }
      
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }
      
      // Simple registration logic
      localStorage.setItem('token', 'session-placeholder');
      localStorage.setItem('user', email);
      navigate('/', { replace: true });
      
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="main-container">
      <header className="main-header">
        <div className="logo">
          BETACLARITY
          <span className="platform-badge">Platform</span>
        </div>
      </header>

      <main className="main-content">
        <h1>Welcome to BetaClarity</h1>
        <p>You are now logged in!</p>
      </main>
    </div>
  );
}