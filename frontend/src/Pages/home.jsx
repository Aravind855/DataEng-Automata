import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaUpload, FaCheckCircle, FaSpinner, FaFileCsv, FaFilePdf, FaComments, FaHistory, FaDatabase, FaCog, FaChartLine } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { toast, ToastContainer } from 'react-toastify';
import { useNavigate, Link } from 'react-router-dom';
import 'react-toastify/dist/ReactToastify.css';


function Home() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dbName, setDbName] = useState('');
  const [databases, setDatabases] = useState([]);
  const [uploadStatus, setUploadStatus] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [agentStatus, setAgentStatus] = useState({
    ingestion: { status: 'pending', tasks: {
      classification: 'pending',
      validation: 'pending',
      primaryKey: 'pending',
      insertion: 'pending',
      move: 'pending',
      log: 'pending'
    }},
    transformation: 'pending',
    report: 'pending',
  });
  const [reportPath, setReportPath] = useState('');
  const [logs, setLogs] = useState([]);
  const [transformedFilename, setTransformedFilename] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [logContent, setLogContent] = useState('');

  useEffect(() => {
    const fetchDatabases = async () => {
      try {
        const response = await axios.get('http://localhost:8000/api/list_databases/');
        setDatabases(response.data.databases || []);
      } catch (err) {
        toast.error('Failed to fetch databases');
      }
    };
    fetchDatabases();
  }, []);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    resetState();
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setFile(e.dataTransfer.files[0]);
    resetState();
  };

  const resetState = () => {
    setUploadStatus('');
    setAiAnalysis('');
    setError('');
    setProgress(0);
    setAgentStatus({
      ingestion: { status: 'pending', tasks: {
        classification: 'pending',
        validation: 'pending',
        primaryKey: 'pending',
        insertion: 'pending',
        move: 'pending',
        log: 'pending'
      }},
      transformation: 'pending',
      report: 'pending',
    });
    setReportPath('');
    setLogs([]);
    setTransformedFilename('');
  };

  const toggleSidebar = async () => {
    if (!isSidebarOpen) {
      try {
        const response = await axios.get('http://localhost:8000/api/get_logs/');
        setLogContent(response.data.logs || 'No logs available');
      } catch (err) {
        toast.error('Failed to fetch logs');
        setLogContent('Error: Unable to fetch logs');
      }
    }
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleUpload = async () => {
    if (!file || !dbName) {
      setError('Please select a file and database');
      toast.error('Please select a file and database');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('db_name', dbName);

    try {
      setLoading(true);
      setProgress(10);

      // Simulate task-by-task progress based on backend logs
      setAgentStatus(prev => ({
        ...prev,
        ingestion: { ...prev.ingestion, status: 'running', tasks: { ...prev.ingestion.tasks, classification: 'running' }}
      }));
      setLogs([{ text: 'Starting data classification...', timestamp: new Date().toISOString() }]);

      const response = await axios.post('http://localhost:8000/api/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { message, category, valid, transformation_result, report_path, logs: backendLogs } = response.data;

      setLogs(backendLogs.map(log => ({
        text: log,
        timestamp: new Date().toISOString(),
      })));

      // Update ingestion tasks based on backend logs
      let taskProgress = 10;
      const ingestionTasks = [
        'classification', 'validation', 'primaryKey', 'insertion', 'move', 'log'
      ];
      ingestionTasks.forEach((task, index) => {
        setTimeout(() => {
          setAgentStatus(prev => ({
            ...prev,
            ingestion: {
              ...prev.ingestion,
              tasks: { ...prev.ingestion.tasks, [task]: 'completed' }
            }
          }));
          taskProgress += 15;
          setProgress(taskProgress);
        }, (index + 1) * 500);
      });

      // Complete ingestion
      setTimeout(() => {
        setAgentStatus(prev => ({
          ...prev,
          ingestion: { ...prev.ingestion, status: 'completed' }
        }));
        setProgress(40);
      }, 3500);

      // Transformation
      setTimeout(() => {
        setAgentStatus(prev => ({ ...prev, transformation: 'running' }));
        setProgress(50);
      }, 4000);

      if (transformation_result) {
        setTimeout(() => {
          setAgentStatus(prev => ({ ...prev, transformation: 'completed' }));
          setTransformedFilename(transformation_result.split(/[\\/]/).pop());
          setProgress(80);
        }, 4500);
      }

      // Report
      setTimeout(() => {
        setAgentStatus(prev => ({ ...prev, report: 'running' }));
        setProgress(90);
      }, 5000);

      if (report_path) {
        setTimeout(() => {
          setAgentStatus(prev => ({ ...prev, report: 'completed' }));
          setReportPath(report_path);
          setProgress(100);
        }, 5500);
      }

      setUploadStatus(message);
      setAiAnalysis(JSON.stringify({ category, valid, transformation_result, report_path }, null, 2));
      toast.success('Process completed successfully!');
    } catch (err) {
      console.error('❌ Upload failed:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Upload failed';
      setError(errorMsg);
      toast.error(errorMsg);
      setAgentStatus(prev => ({
        ...prev,
        ingestion: { ...prev.ingestion, status: 'failed' }
      }));
      setLogs(err.response?.data?.logs?.map(log => ({
        text: log,
        timestamp: new Date().toISOString(),
      })) || [{ text: errorMsg, timestamp: new Date().toISOString() }]);
    } finally {
      setTimeout(() => setLoading(false), 6000);
    }
  };

  const downloadReport = (format = 'markdown') => {
    if (!reportPath) {
      toast.error('No report available to download');
      return;
    }

    if (format === 'markdown') {
      window.open(`http://localhost:8000${reportPath}`, '_blank');
      toast.info('Downloading Markdown report...');
    } else if (format === 'pdf') {
      axios
        .post('http://localhost:8000/api/download_pdf/', { report_path: reportPath }, {
          responseType: 'blob',
        })
        .then((response) => {
          const url = window.URL.createObjectURL(new Blob([response.data]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', reportPath.replace('.md', '.pdf'));
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          toast.info('Downloading PDF report...');
        })
        .catch((err) => {
          const errorMsg = err.response?.data?.error || 'Failed to download PDF';
          toast.error(errorMsg);
        });
    }
  };

  const goToChat = () => {
    if (transformedFilename) {
      navigate(`/chat?filename=${encodeURIComponent(transformedFilename)}`);
    } else {
      toast.error('No transformed file available to query');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <FaSpinner className="animate-spin text-indigo-600" />;
      case 'completed':
        return <FaCheckCircle className="text-green-600" />;
      case 'failed':
        return <FaSpinner className="text-red-600" />;
      default:
        return <FaSpinner className="text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ToastContainer position="top-right" autoClose={3000} />
      {/* Header */}
      <header className="bg-indigo-800 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold flex items-center">
            <FaChartLine className="mr-2" /> DataEng-Automata
          </h1>
          <nav>
            <Link to="/customize-schema" className="text-indigo-200 hover:text-white transition-colors">
              Customize Schemas
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* File Upload Section */}
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Upload Dataset</h2>
              <div
                className="border-2 border-dashed border-indigo-300 p-6 rounded-lg text-center transition-all duration-300 hover:border-indigo-500"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".csv,.json,.xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                  id="fileInput"
                />
                <label htmlFor="fileInput" className="cursor-pointer flex flex-col items-center">
                  <FaUpload className="text-4xl text-indigo-500 mb-2" />
                  <p className="text-gray-600">Drag & drop or click to select (.csv, .json, .xlsx)</p>
                </label>
                {file && <p className="mt-2 text-sm text-gray-700">Selected: {file.name}</p>}
              </div>
              <div className="mt-4">
                <label className="block text-gray-700 font-semibold mb-1">Database</label>
                <select
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="" disabled>Select a database</option>
                  {databases.map((db) => (
                    <option key={db} value={db}>{db}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleUpload}
                disabled={loading || !file || !dbName}
                className="w-full bg-indigo-600 text-white p-3 rounded-lg mt-4 hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center transition-all duration-300"
              >
                {loading ? (
                  <FaSpinner className="animate-spin mr-2" />
                ) : (
                  <FaUpload className="mr-2" />
                )}
                {loading ? 'Processing...' : 'Upload & Analyze'}
              </button>
            </div>

            {/* Progress Roadmap */}
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Processing Roadmap</h2>
              <div className="space-y-4">
                {/* Ingestion Section */}
                <div className="bg-gray-100 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-800">Data Ingestion</h3>
                    {getStatusIcon(agentStatus.ingestion.status)}
                  </div>
                  <div className="pl-4 space-y-2">
                    {Object.entries(agentStatus.ingestion.tasks).map(([task, status]) => (
                      <motion.div
                        key={task}
                        className="flex items-center justify-between"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                      >
                        <span className="text-sm text-gray-600 capitalize">{task.replace(/([A-Z])/g, ' $1').trim()}</span>
                        {getStatusIcon(status)}
                      </motion.div>
                    ))}
                  </div>
                </div>
                {/* Transformation */}
                <motion.div
                  className="flex items-center justify-between p-3 bg-gray-100 rounded-lg"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <span className="text-sm text-gray-600">Transformation</span>
                  {getStatusIcon(agentStatus.transformation)}
                </motion.div>
                {/* Report */}
                <motion.div
                  className="flex items-center justify-between p-3 bg-gray-100 rounded-lg"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <span className="text-sm text-gray-600">Report Generation</span>
                  {getStatusIcon(agentStatus.report)}
                </motion.div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-600 text-center mt-2">Progress: {progress}%</p>
            </div>
          </div>

          {/* Logs and Analysis */}
          <div className="mt-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Execution Logs</h2>
            <div className="bg-gray-100 border border-gray-200 p-4 rounded-lg max-h-60 overflow-y-auto">
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

          {/* Status and Analysis */}
          {uploadStatus && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-100 border border-green-200 p-4 rounded-lg text-green-800 mt-4"
            >
              <strong>Status:</strong> {uploadStatus}
            </motion.div>
          )}
          {aiAnalysis && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-100 border border-gray-200 p-4 rounded-lg text-sm overflow-auto max-h-60 mt-4"
            >
              <strong>AI Analysis:</strong>
              <pre className="whitespace-pre-wrap text-gray-700">{aiAnalysis}</pre>
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-4 mt-6">
            {reportPath && (
              <>
                <button
                  onClick={() => downloadReport('markdown')}
                  className="flex-1 bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 flex items-center justify-center transition-all duration-300"
                  disabled={agentStatus.report !== 'completed'}
                >
                  <FaFileCsv className="mr-2" /> Download Markdown
                </button>
                <button
                  onClick={() => downloadReport('pdf')}
                  className="flex-1 bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 flex items-center justify-center transition-all duration-300"
                  disabled={agentStatus.report !== 'completed'}
                >
                  <FaFilePdf className="mr-2" /> Download PDF
                </button>
              </>
            )}
            {uploadStatus && (
              <button
                onClick={goToChat}
                className="flex-1 bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 flex items-center justify-center transition-all duration-300"
              >
                <FaComments className="mr-2" /> Go to Chat
              </button>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-100 border border-red-200 p-4 rounded-lg text-red-800 mt-4"
            >
              <strong>Error:</strong> {error}
              <button
                onClick={() => setError('')}
                className="ml-2 text-red-500 hover:text-red-700"
              >
                ×
              </button>
            </motion.div>
          )}
        </motion.div>
      </main>

      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed top-0 right-0 h-full w-80 bg-white shadow-xl p-6 overflow-y-auto z-50"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Ingestion Logs</h2>
              <button
                onClick={toggleSidebar}
                className="text-gray-600 hover:text-red-600 transition-all duration-300"
              >
                ×
              </button>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {logContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-indigo-800 text-white p-4 text-center">
        <p>&copy; 2025 DataEng-Automata. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default Home;