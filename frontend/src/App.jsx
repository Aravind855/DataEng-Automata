import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from '../src/Pages/home';
import Chat from '../src/Pages/chat';
import CustomizeSchema from '../src/Pages/CustomizeSchema';

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/customize-schema" element={<CustomizeSchema />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;