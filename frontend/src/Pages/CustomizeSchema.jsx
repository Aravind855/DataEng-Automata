import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaDatabase, FaPlus, FaSave, FaTrash, FaEdit, FaChartLine } from 'react-icons/fa';
import { toast, ToastContainer } from 'react-toastify';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion'; // Added missing import
import 'react-toastify/dist/ReactToastify.css';

function CustomizeSchema() {
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
    if (!form.category || form.columns.some(col => !col.trim())) {
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
          columns: form.columns.filter(col => col.trim()),
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ToastContainer position="top-right" autoClose={3000} />
      {/* Header */}
      <header className="bg-indigo-800 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold flex items-center">
            <FaChartLine className="mr-2" /> Manage Schemas
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
            {/* Database Selection */}
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Select Database</h2>
              <div className="flex items-center space-x-4 mb-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={useExistingDb}
                    onChange={() => setUseExistingDb(true)}
                    className="mr-2 focus:ring-indigo-500"
                  />
                  Select Existing
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={!useExistingDb}
                    onChange={() => setUseExistingDb(false)}
                    className="mr-2 focus:ring-indigo-500"
                  />
                  Create New
                </label>
              </div>
              {useExistingDb ? (
                <select
                  value={dbName}
                  onChange={(e) => handleDbChange(e.target.value)}
                  className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="" disabled>Select a database</option>
                  {databases.map((db) => (
                    <option key={db} value={db}>{db}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  placeholder="Enter new database name (e.g., dataeng)"
                  className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              )}
            </div>

            {/* Schemas List */}
            {dbName && (
              <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Schemas in {dbName}</h2>
                {schemas.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border p-3 text-left text-gray-700">Collection</th>
                          <th className="border p-3 text-left text-gray-700">Columns</th>
                          <th className="border p-3 text-left text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schemas.map((schema, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="border p-3">{schema.category}</td>
                            <td className="border p-3">{schema.columns.join(', ')}</td>
                            <td className="border p-3">
                              <button
                                onClick={() => handleEditSchema(schema, index)}
                                className="text-indigo-600 hover:text-indigo-800 mr-3"
                                title="Edit Schema"
                              >
                                <FaEdit />
                              </button>
                              <button
                                onClick={() => handleDeleteSchema(schema.category)}
                                className="text-red-600 hover:text-red-800"
                                title="Delete Schema"
                              >
                                <FaTrash />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-600">No schemas found for this database.</p>
                )}
              </div>
            )}

            {/* Schema Form */}
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                {form.isEdit ? `Edit Schema for ${form.category}` : 'Add New Schema'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center space-x-4 mb-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={form.useExistingCollection}
                        onChange={(e) => setForm({ ...form, useExistingCollection: e.target.checked })}
                        className="mr-2 focus:ring-indigo-500"
                        disabled={!dbName || form.isEdit}
                      />
                      Use Existing Collection
                    </label>
                  </div>
                  <label className="block text-gray-600 text-sm mb-1">Collection Name</label>
                  {form.useExistingCollection && !form.isEdit ? (
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      disabled={!dbName}
                    >
                      <option value="" disabled>Select a collection</option>
                      {collections.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Enter collection name (e.g., sales)"
                      className="w-full p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      disabled={form.isEdit}
                    />
                  )}
                </div>
                <div>
                  <label className="block text-gray-600 text-sm mb-1">Schema Columns</label>
                  {form.columns.map((col, index) => (
                    <div key={index} className="flex items-center space-x-2 mb-2">
                      <input
                        type="text"
                        value={col}
                        onChange={(e) => handleColumnChange(index, e.target.value)}
                        placeholder={`Column ${index + 1} (e.g., customer_name)`}
                        className="flex-grow p-3 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      {form.columns.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveColumn(index)}
                          className="bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 transition-all duration-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 flex items-center mt-2 transition-all duration-300"
                  >
                    <FaPlus className="mr-1" /> Add Column
                  </button>
                </div>
                <div className="flex space-x-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center transition-all duration-300"
                  >
                    {loading ? 'Saving...' : <><FaSave className="mr-2" /> {form.isEdit ? 'Update Schema' : 'Save Schema'}</>}
                  </button>
                  {form.isEdit && (
                    <button
                      type="button"
                      onClick={() => setForm({ category: '', columns: [''], isEdit: false, editIndex: null, useExistingCollection: false })}
                      className="flex-1 bg-gray-500 text-white p-3 rounded-lg hover:bg-gray-600 transition-all duration-300"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </form>
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

export default CustomizeSchema;