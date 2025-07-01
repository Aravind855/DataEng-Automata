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
    if (name.includes('id')) return '🔑';
    if (name.includes('name') || name.includes('title')) return '📝';
    if (name.includes('date') || name.includes('time')) return '📅';
    if (name.includes('price') || name.includes('amount') || name.includes('cost')) return '💰';
    if (name.includes('email')) return '📧';
    if (name.includes('phone')) return '📞';
    if (name.includes('address')) return '🏠';
    return '📊';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      <ToastContainer position="top-right" autoClose={3000} />

      <header className="bg-white/10 p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <FaRocket className="text-white text-xl" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              DataEng-Automata
            </h1>
          </div>
          <nav className="flex space-x-4">
            <a href="/" className="text-white/80 hover:text-white transition-colors flex items-center space-x-2">
              <FaDatabase />
              <span>Home</span>
            </a>
            <a href="/chat" className="text-white/80 hover:text-white transition-colors flex items-center space-x-2">
              <FaComments />
              <span>Chat</span>
            </a>
            <a href="/customize-schema" className="text-purple-400 flex items-center space-x-2">
              <FaCog />
              <span>Schema</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1 space-y-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="bg-white/10 p-6 rounded-lg shadow-lg"
            >
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <FaDatabase className="mr-2" />
                Database Selection
              </h3>
              <div className="space-y-4">
                <div className="flex space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={useExistingDb}
                      onChange={() => setUseExistingDb(true)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                    />
                    <span>Existing</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={!useExistingDb}
                      onChange={() => setUseExistingDb(false)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                    />
                    <span>Create New</span>
                  </label>
                </div>
                {useExistingDb ? (
                  <select
                    value={dbName}
                    onChange={(e) => handleDbChange(e.target.value)}
                    className="w-full p-2 bg-white/10 border border-white/20 rounded"
                  >
                    <option value="" disabled>
                      Select a database
                    </option>
                    {databases.map((db) => (
                      <option key={db} value={db}>
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
                    className="w-full p-2 bg-white/10 border border-white/20 rounded"
                  />
                )}
              </div>
            </motion.div>

            {dbName && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="bg-white/10 p-6 rounded-lg shadow-lg"
              >
                <h3 className="text-xl font-semibold mb-4 flex items-center">
                  <FaTable className="mr-2" />
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
                        className="bg-white/5 p-4 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold flex items-center">
                            <FaTable className="mr-2" />
                            {schema.category}
                          </h4>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setSelectedSchema(schema);
                                setShowPreview(true);
                              }}
                              className="p-2 bg-blue-500/20 rounded-lg"
                              title="Preview Schema"
                            >
                              <FaEye />
                            </button>
                            <button
                              onClick={() => handleEditSchema(schema, index)}
                              className="p-2 bg-yellow-500/20 rounded-lg"
                              title="Edit Schema"
                            >
                              <FaEdit />
                            </button>
                            <button
                              onClick={() => handleDeleteSchema(schema.category)}
                              className="p-2 bg-red-500/20 rounded-lg"
                              title="Delete Schema"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-400">Columns: </span>
                          {schema.columns.slice(0, 3).map((col, i) => (
                            <span key={i} className="mr-2">
                              {getColumnIcon(col)} {col}
                              {i < Math.min(schema.columns.length, 3) - 1 && ', '}
                            </span>
                          ))}
                          {schema.columns.length > 3 && <span className="text-blue-400">+{schema.columns.length - 3} more</span>}
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <FaTable className="text-4xl mx-auto mb-4" />
                      <p>No schemas found</p>
                      <p className="text-sm mt-2">Create your first schema to get started</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          <div className="md:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="bg-white/10 p-6 rounded-lg shadow-lg"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-semibold flex items-center">
                  <FaProjectDiagram className="mr-2" />
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
                    className="px-4 py-2 bg-gray-500/20 rounded-lg flex items-center"
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
                      className="w-full p-2 bg-white/10 border border-white/20 rounded"
                      disabled={!dbName}
                    >
                      <option value="" disabled>
                        Select a collection
                      </option>
                      {collections.map((col) => (
                        <option key={col} value={col}>
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
                      className="w-full p-2 bg-white/10 border border-white/20 rounded"
                      disabled={form.isEdit}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-gray-300 mb-2 flex items-center">
                    <FaColumns className="mr-2" />
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
                          className="bg-white/5 p-4 rounded-lg"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                              <span className="text-white font-bold">{index + 1}</span>
                            </div>
                            <div className="flex-1">
                              <input
                                type="text"
                                value={col}
                                onChange={(e) => handleColumnChange(index, e.target.value)}
                                placeholder={`Column ${index + 1} name (e.g., user_id, email, created_at)`}
                                className="w-full p-2 bg-white/10 border border-white/20 rounded"
                              />
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-2xl">{getColumnIcon(col)}</span>
                              {form.columns.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveColumn(index)}
                                  className="p-2 bg-red-500/20 rounded-lg"
                                >
                                  <FaTrash />
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
                      className="w-full p-4 bg-gradient-to-r from-green-500/20 to-emerald-600/20 border-2 border-dashed border-green-400/30 rounded-lg flex items-center justify-center text-green-400"
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
                    className="flex-1 bg-gradient-to-r from-purple-500 to-blue-600 text-white p-4 rounded-lg hover:from-purple-600 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 flex items-center justify-center"
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
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

      <AnimatePresence>
        {showPreview && selectedSchema && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white/10 p-6 rounded-lg shadow-lg max-w-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-semibold flex items-center">
                  <FaEye className="mr-2" />
                  Schema Preview: {selectedSchema.category}
                </h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-2 bg-red-500/20 rounded-lg"
                >
                  <FaTimes />
                </button>
              </div>
              <div className="space-y-4">
                <div className="bg-white/5 p-4 rounded-lg">
                  <h4 className="text-lg font-semibold mb-2 flex items-center">
                    <FaTable className="mr-2" />
                    Table Structure
                  </h4>
                  <div className="space-y-2">
                    {selectedSchema.columns.map((column, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl">{getColumnIcon(column)}</span>
                          <span>{column}</span>
                        </div>
                        <span className="text-sm text-gray-400">Column {index + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white/5 p-4 rounded-lg">
                  <h4 className="text-lg font-semibold mb-2 flex items-center">
                    <FaDatabase className="mr-2" />
                    Schema Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Collection Name:</span>
                      <p>{selectedSchema.category}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Total Columns:</span>
                      <p>{selectedSchema.columns.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="bg-white/10 p-4 text-center">
        <p className="text-gray-400">© 2025 DataEng-Automata. Building the future of data architecture.</p>
      </footer>
    </div>
  );
};

export default CustomizeSchema;
