import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaPaperPlane, FaSpinner, FaFileCsv, FaChartLine } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { toast, ToastContainer } from 'react-toastify';
import { useLocation, Link } from 'react-router-dom';
import 'react-toastify/dist/ReactToastify.css';


function Chat() {
  const [query, setQuery] = useState('');
  const [filename, setFilename] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [availableFiles, setAvailableFiles] = useState([]);
  const location = useLocation();

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const response = await axios.get('http://localhost:8000/api/available_files/');
        const files = response.data.files || [];
        setAvailableFiles(files);

        const params = new URLSearchParams(location.search);
        const urlFilename = params.get('filename');
        if (urlFilename && files.includes(urlFilename)) {
          setFilename(urlFilename);
        }
      } catch (err) {
        toast.error('Failed to fetch available files');
      }
    };
    fetchFiles();
  }, [location.search]);

  const handleQuerySubmit = async () => {
    if (!query || !filename) {
      toast.error('Please enter a query and select a file');
      return;
    }

    const newMessage = { text: query, sender: 'user', timestamp: new Date().toISOString() };
    setMessages([...messages, newMessage]);
    setLogs([...logs, { text: `User query: ${query}`, timestamp: new Date().toISOString() }]);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('query', query);
      formData.append('filename', filename);

      const response = await axios.post('http://localhost:8000/api/query_rag/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { message, response: botResponse, logs: backendLogs } = response.data;
      setMessages([...messages, newMessage, { text: botResponse, sender: 'bot', timestamp: new Date().toISOString() }]);
      setLogs([...logs, ...backendLogs.map(log => ({ text: log, timestamp: new Date().toISOString() }))]);
      toast.success(message);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to process query';
      setMessages([
        ...messages,
        newMessage,
        { text: errorMsg, sender: 'bot', timestamp: new Date().toISOString() }
      ]);
      setLogs([
        ...logs,
        ...(
          err.response?.data?.logs?.map(log => ({
            text: log,
            timestamp: new Date().toISOString()
          })) || [{ text: errorMsg, timestamp: new Date().toISOString() }]
        )
      ]);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
      setQuery('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuerySubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ToastContainer position="top-right" autoClose={3000} />
      {/* Header */}
      <header className="bg-indigo-800 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold flex items-center">
            <FaChartLine className="mr-2" /> DataEng-Automata Chatbot
          </h1>
          <nav>
            <Link to="/" className="text-indigo-200 hover:text-white transition-colors">
              ← Back to Home
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto flex-grow p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-2xl shadow-xl p-8 max-w-4xl mx-auto"
        >
          <div className="space-y-6">
            {/* Dataset Selection */}
            <div className="flex items-center space-x-4">
              <label className="text-gray-700 font-semibold">Select Dataset:</label>
              <select
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="flex-grow p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="" disabled>Select a file</option>
                {availableFiles.map((file) => (
                  <option key={file} value={file}>{file}</option>
                ))}
              </select>
            </div>

            {/* Chat Area */}
            <div className="bg-gray-100 border border-gray-200 p-4 rounded-lg max-h-96 overflow-y-auto">
              <AnimatePresence>
                {messages.map((msg, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} mb-4`}
                  >
                    <div
                      className={`p-4 rounded-lg max-w-md ${
                        msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'
                      } shadow-md`}
                    >
                      <span className="text-xs text-gray-500 block mb-1">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Query Input */}
            <div className="flex items-center space-x-2">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask a question about the dataset..."
                className="flex-grow p-3 border rounded-lg resize-none h-16 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                onClick={handleQuerySubmit}
                disabled={loading || !query || !filename}
                className="bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 flex items-center transition-all duration-300"
              >
                {loading ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}
              </button>
            </div>

            {/* Logs */}
            <div className="bg-gray-100 border border-gray-200 p-4 rounded-lg max-h-60 overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Query Logs</h3>
              <AnimatePresence>
                {logs.map((log, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-sm text-gray-700 mb-1"
                  >
                    <span className="text-xs text-gray-500 mr-2">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    {log.text}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="bg-indigo-800 text-white p-4 text-center">
        <p>© 2025 DataEng-Automata. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default Chat;