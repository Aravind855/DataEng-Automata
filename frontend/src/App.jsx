import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from '../src/Pages/home';
import Chat from '../src/Pages/chat';
import CustomizeSchema from '../src/Pages/CustomizeSchema';

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        <nav className="bg-blue-600 text-white p-4 shadow-md">
          <div className="container mx-auto flex justify-between items-center">
            <Link to="/" className="text-2xl font-bold">
              DataEng-Automata
            </Link>
            <div className="space-x-4">
              <Link to="/" className="hover:underline">
                Home
              </Link>
              <Link to="/chat" className="hover:underline">
                Chat
              </Link>
              <Link to="/customize-schema" className="hover:underline">
                Customize Schema
              </Link>
            </div>
          </div>
        </nav>
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/customize-schema" element={<CustomizeSchema />} />
          </Routes>
        </main>
        <footer className="bg-gray-800 text-white text-center p-4">
          <p>© 2025 DataEng-Automata. All rights reserved.</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;