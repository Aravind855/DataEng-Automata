import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaDatabase, FaPlus, FaSave, FaTrash, FaEdit, FaRocket, FaCog, FaComments, FaTable, FaColumns, FaProjectDiagram, FaEye, FaCheck, FaTimes } from 'react-icons/fa';
import { toast, ToastContainer } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import 'react-toastify/dist/ReactToastify.css';


const CustomizeSchema = () => {
  const [databases, setDatabases] = useState([]);
  const [dbName, setDbName] = useState('');
  const [useExistingDb, setUseExistingDb] = useState(true);
  const [collections, setCollections] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [form, setForm] = useState({
    category: '',
    columns: [''],
    isEdit: false,
    editIndex: null,
    useExistingCollection: false,
  });
  const [loading, setLoading] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

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

  const fetchCollectionsAndSchemas = async (dbName) => {
    if (!dbName) {
      setCollections([]);
      setSchemas([]);
      return;
    }

    try {
      const collectionsResponse = await axios.post(
        'http://localhost:8000/api/list_collections/',
        { db_name: dbName },
        { headers: { 'Content-Type': 'application/json' } }
      );
      setCollections(collectionsResponse.data.collections || []);

      const schemasResponse = await axios.post(
        'http://localhost:8000/api/list_schemas/',
        { db_name: dbName },
        { headers: { 'Content-Type': 'application/json' } }
      );
      setSchemas(schemasResponse.data.schemas || []);
    } catch (err) {
      toast.error(`Failed to fetch data for ${dbName}`);
      setCollections([]);
      setSchemas([]);
    }
  };

  const handleDbChange = (value) => {
    setDbName(value);
    setForm({ category: '', columns: [''], isEdit: false, editIndex: null, useExistingCollection: false });
    fetchCollectionsAndSchemas(value);
  };

  const handleColumnChange = (index, value) => {
    const newColumns = [...form.columns];
    newColumns[index] = value;
    setForm({ ...form, columns: newColumns });
  };

  const handleAddColumn = () => {
    setForm({ ...form, columns: [...form.columns, ''] });
  };

  const handleRemoveColumn = (index) => {
    if (form.columns.length > 1) {
      const newColumns = form.columns.filter((_, i) => i !== index);
      setForm({ ...form, columns: newColumns });
    }
  };

  const handleEditSchema = (schema, index) => {
    setForm({
      category: schema.category,
      columns: schema.columns.length ? schema.columns : [''],
      isEdit: true,
      editIndex: index,
      useExistingCollection: true,
    });
  };

  const handleDeleteSchema = async (category) => {
    if (!window.confirm(`Are you sure you want to delete the schema for ${category}?`)) return;

    setLoading(true);
    try {
      const response = await axios.post(
        'http://localhost:8000/api/delete_schema/',
        { db_name: dbName, category },
        { headers: { 'Content-Type': 'application/json' } }
      );
      toast.success(response.data.message);
      fetchCollectionsAndSchemas(dbName);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to delete schema';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dbName) {
      toast.error('Please select or enter a database name');
      return;
    }
    if (!form.category || form.columns.some((col) => !col.trim())) {
      toast.error('Please fill in collection name and all column fields');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        'http://localhost:8000/api/save_schema/',
        {
          db_name: dbName,
          category: form.category,
          columns: form.columns.filter((col) => col.trim()),
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      toast.success(response.data.message);
      setForm({ category: '', columns: [''], isEdit: false, editIndex: null, useExistingCollection: false });
      fetchCollectionsAndSchemas(dbName);
      if (!useExistingDb) {
        const response = await axios.get('http://localhost:8000/api/list_databases/');
        setDatabases(response.data.databases || []);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to save schema';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const getColumnIcon = (columnName) => {
    const name = columnName.toLowerCase();
    if (name.includes('id')) return '';
    if (name.includes('name') || name.includes('title')) ;
    if (name.includes('date') || name.includes('time')) ;
    if (name.includes('price') || name.includes('amount') || name.includes('cost')) ;
    if (name.includes('email')) return;
    if (name.includes('phone')) return ;
    if (name.includes('address')) return ;
    return '';
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-gray-200 font-sans">
      <ToastContainer position="top-right" autoClose={3000} theme="dark" />

      {/* Header */}
      <header className="bg-slate-900/90 backdrop-blur-lg border-b border-slate-700 shadow-md z-50 sticky top-0 shrink-0">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-md flex items-center justify-center shadow-lg">
                <FaRocket className="text-gray-200 text-xl" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-100">
                DataEng-Automata
              </h1>
              <div className="hidden md:flex items-center space-x-2">
                <FaCog className="text-blue-400" />
                <span className="text-gray-400 text-sm">Schema Editor</span>
              </div>
            </div>
            <nav className="flex space-x-6">
              <a
                href="/"
                className="text-gray-400 hover:text-gray-100 transition-colors flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-slate-800"
              >
                <FaDatabase className="text-sm" />
                <span>Home</span>
              </a>
              <a
                href="/chat"
                className="text-gray-400 hover:text-gray-100 transition-colors flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-slate-800"
              >
                <FaComments className="text-sm" />
                <span>Chat</span>
              </a>
              <a
                href="/customize-schema"
                className="text-blue-400 flex items-center space-x-2 px-3 py-2 rounded-md bg-slate-800"
              >
                <FaCog className="text-sm" />
                <span>Schema</span>
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex container mx-auto px-6 py-8 z-10 relative flex-1 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full h-full">
          {/* Left Sidebar - Database Selection & Schemas */}
          <div className="md:col-span-1 space-y-6">
            {/* Database Selection */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="bg-slate-900/80 backdrop-blur-lg p-6 rounded-xl shadow-xl border border-slate-700 hover:bg-slate-900/90 transition-all duration-300"
            >
              <h3 className="text-lg font-medium mb-4 flex items-center text-gray-100">
                <FaDatabase className="mr-2 text-blue-400" />
                Database Selection
              </h3>
              <div className="space-y-4">
                <div className="flex space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={useExistingDb}
                      onChange={() => setUseExistingDb(true)}
                      className="w-4 h-4 text-blue-500 bg-slate-800 border-slate-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-300">Existing</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={!useExistingDb}
                      onChange={() => setUseExistingDb(false)}
                      className="w-4 h-4 text-blue-500 bg-slate-800 border-slate-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-300">Create New</span>
                  </label>
                </div>
                {useExistingDb ? (
                  <select
                    value={dbName}
                    onChange={(e) => handleDbChange(e.target.value)}
                    className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  >
                    <option value="" disabled className="text-gray-500">
                      Select a database
                    </option>
                    {databases.map((db) => (
                      <option key={db} value={db} className="text-gray-200 bg-slate-800">
                        {db}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    placeholder="Enter new database name"
                    className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                )}
              </div>
            </motion.div>

            {/* Existing Schemas */}
            {dbName && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
                className="bg-slate-900/80 backdrop-blur-lg p-6 rounded-xl shadow-xl border border-slate-700 hover:bg-slate-900/90 transition-all duration-300 flex-1 overflow-y-auto"
              >
                <h3 className="text-lg font-medium mb-4 flex items-center text-gray-100">
                  <FaTable className="mr-2 text-blue-400" />
                  Existing Schemas
                </h3>
                <div className="space-y-3">
                  {schemas.length > 0 ? (
                    schemas.map((schema, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-slate-800/50 p-4 rounded-lg border border-slate-600"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold flex items-center text-gray-100">
                            <FaTable className="mr-2 text-blue-400" />
                            {schema.category}
                          </h4>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setSelectedSchema(schema);
                                setShowPreview(true);
                              }}
                              className="p-2 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition-all duration-200"
                              title="Preview Schema"
                            >
                              <FaEye className="text-blue-400" />
                            </button>
                            <button
                              onClick={() => handleEditSchema(schema, index)}
                              className="p-2 bg-yellow-500/20 rounded-lg hover:bg-yellow-500/30 transition-all duration-200"
                              title="Edit Schema"
                            >
                              <FaEdit className="text-yellow-400" />
                            </button>
                            <button
                              onClick={() => handleDeleteSchema(schema.category)}
                              className="p-2 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-all duration-200"
                              title="Delete Schema"
                            >
                              <FaTrash className="text-red-400" />
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-gray-300">
                          <span className="text-gray-400">Columns: </span>
                          {schema.columns.slice(0, 3).map((col, i) => (
                            <span key={i} className="mr-2">
                              {getColumnIcon(col)} {col}
                              {i < Math.min(schema.columns.length, 3) - 1 && ', '}
                            </span>
                          ))}
                          {schema.columns.length > 3 && (
                            <span className="text-blue-400">+{schema.columns.length - 3} more</span>
                          )}
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <FaTable className="text-4xl mx-auto mb-4 opacity-50" />
                      <p>No schemas found</p>
                      <p className="text-sm mt-2">Create your first schema to get started</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Schema Editor */}
          <div className="md:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="bg-slate-900/80 backdrop-blur-lg p-6 rounded-xl shadow-xl border border-slate-700 h-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold flex items-center text-gray-100">
                  <FaProjectDiagram className="mr-2 text-blue-400" />
                  {form.isEdit ? `Edit Schema: ${form.category}` : 'Create New Schema'}
                </h3>
                {form.isEdit && (
                  <button
                    onClick={() =>
                      setForm({
                        category: '',
                        columns: [''],
                        isEdit: false,
                        editIndex: null,
                        useExistingCollection: false,
                      })
                    }
                    className="px-4 py-2 bg-slate-800 rounded-lg flex items-center text-gray-300 hover:bg-slate-700 transition-all duration-200"
                  >
                    <FaTimes className="mr-2" />
                    Cancel Edit
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-gray-300 mb-2">Collection Name</label>
                  {form.useExistingCollection && !form.isEdit ? (
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      disabled={!dbName}
                    >
                      <option value="" disabled className="text-gray-500">
                        Select a collection
                      </option>
                      {collections.map((col) => (
                        <option key={col} value={col} className="text-gray-200 bg-slate-800">
                          {col}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Enter collection name (e.g., users, products, orders)"
                      className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      disabled={form.isEdit}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-gray-300 mb-2 flex items-center">
                    <FaColumns className="mr-2 text-blue-400" />
                    Schema Columns
                  </label>
                  <div className="space-y-4">
                    <AnimatePresence>
                      {form.columns.map((col, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ duration: 0.3 }}
                          className="bg-slate-800/50 p-4 rounded-lg border border-slate-600"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                              <span className="text-gray-200 font-bold">{index + 1}</span>
                            </div>
                            <div className="flex-1">
                              <input
                                type="text"
                                value={col}
                                onChange={(e) => handleColumnChange(index, e.target.value)}
                                placeholder={`Column ${index + 1} name (e.g., user_id, email, created_at)`}
                                className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                              />
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-2xl">{getColumnIcon(col)}</span>
                              {form.columns.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveColumn(index)}
                                  className="p-2 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-all duration-200"
                                >
                                  <FaTrash className="text-red-400" />
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <motion.button
                      type="button"
                      onClick={handleAddColumn}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full p-4 bg-slate-800 border-2 border-dashed border-blue-400/30 rounded-lg flex items-center justify-center text-blue-400 hover:bg-slate-700 transition-all duration-200"
                    >
                      <FaPlus className="mr-2" />
                      Add New Column
                    </motion.button>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-gray-100 p-4 rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-600 disabled:to-slate-600 flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg"
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-200 mr-2"></div>
                        Saving...
                      </div>
                    ) : (
                      <>
                        <FaSave className="mr-2" />
                        {form.isEdit ? 'Update Schema' : 'Create Schema'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Schema Preview Modal */}
      <AnimatePresence>
        {showPreview && selectedSchema && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900/80 backdrop-blur-lg p-6 rounded-xl shadow-xl border border-slate-700 max-w-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold flex items-center text-gray-100">
                  <FaEye className="mr-2 text-blue-400" />
                  Schema Preview: {selectedSchema.category}
                </h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-2 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-all duration-200"
                >
                  <FaTimes className="text-red-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-600">
                  <h4 className="text-lg font-semibold mb-2 flex items-center text-gray-100">
                    <FaTable className="mr-2 text-blue-400" />
                    Table Structure
                  </h4>
                  <div className="space-y-2">
                    {selectedSchema.columns.map((column, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-600">
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl">{getColumnIcon(column)}</span>
                          <span className="text-gray-200">{column}</span>
                        </div>
                        <span className="text-sm text-gray-400">Column {index + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-600">
                  <h4 className="text-lg font-semibold mb-2 flex items-center text-gray-100">
                    <FaDatabase className="mr-2 text-blue-400" />
                    Schema Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Collection Name:</span>
                      <p className="text-gray-200">{selectedSchema.category}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Total Columns:</span>
                      <p className="text-gray-200">{selectedSchema.columns.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-slate-900/90 backdrop-blur-lg border-t border-slate-700 text-gray-400 p-6 text-center z-10 relative shrink-0">
        <p>© 2025 DataEng-Automata. Building the future of data architecture.</p>
      </footer>
    </div>
  );
};

export default CustomizeSchema;