// main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Correct: App wraps all routes
import './index.css'; // Optional: your global styles

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App /> {/* ✅ Render App, not Home */}
  </React.StrictMode>
);
