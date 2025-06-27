import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaUpload, FaCheckCircle, FaSpinner, FaFileCsv, FaChartBar, FaComments } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { toast, ToastContainer } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import 'react-toastify/dist/ReactToastify.css';

function Home() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [agentStatus, setAgentStatus] = useState({
    ingestion: 'pending',
    transformation: 'pending',
    report: 'pending',
  });
  const [reportPath, setReportPath] = useState('');
  const [logs, setLogs] = useState([]);
  const [transformedFilename, setTransformedFilename] = useState('');

  useEffect(() => {
    if (!navigate) {
      console.error('useNavigate is not available. Ensure Home is rendered within a Router.');
    }
  }, [navigate]);

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
    setAgentStatus({ ingestion: 'pending', transformation: 'pending', report: 'pending' });
    setReportPath('');
    setLogs([]);
    setTransformedFilename('');
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      toast.error('Please select a file');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);
      setProgress(10);
      setAgentStatus({ ...agentStatus, ingestion: 'running' });
      setLogs([{ text: 'Starting data ingestion...', timestamp: new Date().toISOString() }]);

      const response = await axios.post('http://localhost:8000/api/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      console.log('✅ Backend response:', response.data);

      const { message, category, valid, transformation_result, transformed_filename, report_path, logs: backendLogs } = response.data;

      setLogs(backendLogs.map(log => ({
        text: log,
        timestamp: new Date().toISOString(),
      })));

      setProgress(33);
      setAgentStatus({ ...agentStatus, ingestion: 'completed' });

      if (transformation_result) {
        setProgress(66);
        setAgentStatus({ ...agentStatus, transformation: 'completed' });
        setTransformedFilename(transformed_filename || transformation_result.split(/[\\/]/).pop()); // Handle both \ and /
      }

      if (report_path) {
        setProgress(100);
        setAgentStatus({ ...agentStatus, report: 'completed' });
        setReportPath(report_path);
      }

      setUploadStatus(message);
      setAiAnalysis(JSON.stringify({ category, valid, transformation_result, report_path }, null, 2));
      toast.success('Process completed successfully!');
    } catch (err) {
      console.error('❌ Upload failed:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Upload failed';
      setError(errorMsg);
      toast.error(errorMsg);
      setAgentStatus({
        ingestion: err.response?.data?.error ? 'failed' : agentStatus.ingestion,
        transformation: 'pending',
        report: 'pending',
      });
      setLogs(err.response?.data?.logs?.map(log => ({
        text: log,
        timestamp: new Date().toISOString(),
      })) || [{ text: errorMsg, timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (reportPath) {
      window.open(`http://localhost:8000${reportPath}`, '_blank');
      toast.info('Downloading report...');
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
        return <FaSpinner className="animate-spin text-blue-500" />;
      case 'completed':
        return <FaCheckCircle className="text-green-500" />;
      case 'failed':
        return <FaSpinner className="text-red-500" />;
      default:
        return <FaSpinner className="text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-4">
      <ToastContainer />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-white rounded-xl shadow-2xl p-6"
      >
        <h1 className="text-4xl font-bold text-center text-gray-800 mb-6 flex items-center justify-center">
          <FaChartBar className="mr-2" /> DataEng-Automata
        </h1>

        <div className="space-y-6">
          <div
            className="border-2 border-dashed border-gray-300 p-6 rounded-lg text-center transition-all duration-300 hover:border-blue-500"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".csv,.json,.xlsx"
              onChange={handleFileChange}
              className="w-full p-2 mb-4 border rounded hidden"
              id="fileInput"
            />
            <label
              htmlFor="fileInput"
              className="cursor-pointer flex flex-col items-center"
            >
              <FaUpload className="text-4xl text-gray-500 mb-2" />
              <p className="text-gray-600">
                Drag & drop a file here or click to select (.csv, .json, .xlsx)
              </p>
            </label>
            {file && <p className="mt-2 text-sm text-gray-700">Selected: {file.name}</p>}
          </div>

          <button
            onClick={handleUpload}
            disabled={loading || !file}
            className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center transition-all duration-300"
          >
            {loading ? (
              <FaSpinner className="animate-spin mr-2" />
            ) : (
              <FaUpload className="mr-2" />
            )}
            {loading ? 'Processing...' : 'Upload & Analyze'}
          </button>

          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 text-center">Progress: {progress}%</p>

          <div className="space-y-4">
            {Object.entries(agentStatus).map(([agent, status]) => (
              <motion.div
                key={agent}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <span className="capitalize text-gray-700">
                  {agent} {status === 'running' && '...'}: {status}
                </span>
                {getStatusIcon(status)}
              </motion.div>
            ))}
          </div>

          <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg max-h-60 overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Execution Logs</h3>
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

          {uploadStatus && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 border border-green-200 p-4 rounded-lg text-green-800"
            >
              <strong>Status:</strong> {uploadStatus}
            </motion.div>
          )}

          {aiAnalysis && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-50 border border-gray-200 p-4 rounded-lg text-sm overflow-auto max-h-60"
            >
              <strong>AI Analysis:</strong>
              <pre className="whitespace-pre-wrap text-gray-700">{aiAnalysis}</pre>
            </motion.div>
          )}

          <div className="flex space-x-4">
            {reportPath && (
              <button
                onClick={downloadReport}
                className="flex-1 bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 flex items-center justify-center mt-4 transition-all duration-300"
              >
                <FaFileCsv className="mr-2" /> Download Report
              </button>
            )}
            {uploadStatus && (
              <button
                onClick={goToChat}
                className="flex-1 bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 flex items-center justify-center mt-4 transition-all duration-300"
              >
                <FaComments className="mr-2" /> Go to Chat
              </button>
            )}
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-200 p-4 rounded-lg text-red-800"
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
        </div>
      </motion.div>
    </div>
  );
}

export default Home;