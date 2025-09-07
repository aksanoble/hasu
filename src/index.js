import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import QuickAdd from './components/QuickAdd';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');


root.render(
  <React.StrictMode>
    {mode === 'quick-add' ? (
      <ThemeProvider>
        <AuthProvider>
          <QuickAdd />
        </AuthProvider>
      </ThemeProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
