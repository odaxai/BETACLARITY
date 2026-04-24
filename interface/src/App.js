import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import BetaClarityPage from './BetaClarityPage';
import './App.css';

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/betaclarity" element={<BetaClarityPage />} />
        <Route path="*" element={<Navigate to="/betaclarity" replace />} />
      </Routes>
    </div>
  );
}

export default App;
