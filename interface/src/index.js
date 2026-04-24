import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import './styles.css';

// Create a dark theme for the application
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#61dafb',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#121212',
      paper: '#1e1e2e',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
  },
});

// 🔧 GLOBAL DEBUG: Immediate localStorage check on page load
console.log('🔧 GLOBAL BETACLARITY: Page loaded, checking localStorage immediately...');
const globalCheck = localStorage.getItem('betasr_transfer_image');
console.log('🔧 GLOBAL BETACLARITY: localStorage data found:', !!globalCheck);
if (globalCheck) {
  try {
    const parsed = JSON.parse(globalCheck);
    console.log('🔧 GLOBAL BETACLARITY: Found transfer data:', {
      name: parsed.imageName,
      size: parsed.imageSize,
      dataLength: parsed.imageData?.length || 0,
      age: Math.round((Date.now() - parsed.transferTime) / 1000) + 's'
    });
    
    // Store for React component to pick up
    window.BETASR_TRANSFER_DATA = parsed;
    console.log('🔧 GLOBAL BETACLARITY: Data stored in window.BETASR_TRANSFER_DATA');
  } catch (e) {
    console.error('🔧 GLOBAL BETACLARITY: Parse error:', e);
  }
} else {
  console.log('🔧 GLOBAL BETACLARITY: No transfer data found');
}

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);