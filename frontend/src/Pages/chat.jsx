import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaPaperPlane, FaSpinner, FaFileCsv } from 'react-icons/fa';
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
        console.log('URL Filename:', urlFilename, 'Available Files:', files); // Debug log
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
      console.log('Submitting query:', { query, filename });
      if (!query || !filename) {
        toast.error('Please enter a query and select a file');
        return;
      }

      const newMessage = { text: query, sender: 'user', timestamp: new Date().toISOString() };
      setMessages([...messages, newMessage]);
      setLogs([...logs, { text: `User query: ${query}`, timestamp: new Date().toISOString() }]);
      setLoading(true);

      try {
        // Create FormData to send data as form-encoded
        const formData = new FormData();
        formData.append('query', query);
        formData.append('filename', filename);

        const response = await axios.post('http://localhost:8000/api/query_rag/', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
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
      }
    };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuerySubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-4">
      <ToastContainer />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl bg-white rounded-xl shadow-2xl p-6 flex flex-col"
      >
        <h1 className="text-4xl font-bold text-center text-gray-800 mb-6 flex items-center justify-center">
          <FaFileCsv className="mr-2" /> DataEng-Automata Chatbot
        </h1>
        <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Home
        </Link>
        <div className="flex-grow flex flex-col space-y-4">
          <div className="flex items-center space-x-4">
            <label className="text-gray-700 font-semibold">Select Dataset:</label>
            <select
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="p-2 border rounded-lg flex-grow"
            >
              <option value="">Select a file</option>
              {availableFiles.map((file) => (
                <option key={file} value={file}>{file}</option>
              ))}
            </select>
          </div>
          <div className="flex-grow bg-gray-50 border border-gray-200 p-4 rounded-lg max-h-96 overflow-y-auto">
            <AnimatePresence>
              {messages.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} mb-2`}
                >
                  <div
                    className={`p-3 rounded-lg max-w-md ${
                      msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    <span className="text-xs text-gray-500 block">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="flex items-center space-x-2">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask a question about the dataset..."
              className="flex-grow p-2 border rounded-lg resize-none h-12"
            />
            <button
              onClick={handleQuerySubmit}
              disabled={loading || !query || !filename}
              className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
            >
              {loading ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}
            </button>
          </div>

        </div>
      </motion.div>
    </div>
  );
}

export default Chat;