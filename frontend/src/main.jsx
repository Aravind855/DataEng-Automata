import React from 'react';
import ReactDOM from 'react-dom/client';
import Home from '../src/Pages/home'; // or './App' if you're using App instead
import './index.css'; // or your styles file

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>
);