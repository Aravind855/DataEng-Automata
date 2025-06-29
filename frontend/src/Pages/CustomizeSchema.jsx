import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaDatabase, FaPlus, FaSave, FaTrash, FaEdit } from 'react-icons/fa';
import { toast, ToastContainer } from 'react-toastify';
import { Link } from 'react-router-dom';
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
        console.error('Error fetching databases:', err);
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
      // Fetch collections
      const collectionsResponse = await axios.post(
        'http://localhost:8000/api/list_collections/',
        { db_name: dbName },
        { headers: { 'Content-Type': 'application/json' } }
      );
      console.log('Collections response:', collectionsResponse.data);
      setCollections(collectionsResponse.data.collections || []);

      // Fetch schemas
      const schemasResponse = await axios.post(
        'http://localhost:8000/api/list_schemas/',
        { db_name: dbName },
        { headers: { 'Content-Type': 'application/json' } }
      );
      console.log('Schemas response:', schemasResponse.data);
      setSchemas(schemasResponse.data.schemas || []);
    } catch (err) {
      console.error('Error fetching collections or schemas:', err);
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
      console.error('Error deleting schema:', err);
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
      console.error('Error saving schema:', err);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-4">
      <ToastContainer />
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl p-6">
        <h1 className="text-4xl font-bold text-center text-gray-800 mb-6 flex items-center justify-center">
          <FaDatabase className="mr-2" /> Manage Schemas
        </h1>
        <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Home
        </Link>
        <div className="space-y-6">
          <div>
            <label className="block text-gray-700 font-semibold mb-1">Database</label>
            <div className="flex items-center space-x-4 mb-2">
              <label>
                <input
                  type="radio"
                  checked={useExistingDb}
                  onChange={() => setUseExistingDb(true)}
                  className="mr-1"
                />
                Select Existing
              </label>
              <label>
                <input
                  type="radio"
                  checked={!useExistingDb}
                  onChange={() => setUseExistingDb(false)}
                  className="mr-1"
                />
                Create New
              </label>
            </div>
            {useExistingDb ? (
              <select
                value={dbName}
                onChange={(e) => handleDbChange(e.target.value)}
                className="w-full p-2 border rounded-lg"
                required
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
                className="w-full p-2 border rounded-lg"
                required
              />
            )}
          </div>
          {dbName && (
            <div>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Schemas in {dbName}</h2>
              {schemas.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-2 text-left">Collection</th>
                        <th className="border p-2 text-left">Columns</th>
                        <th className="border p-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schemas.map((schema, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="border p-2">{schema.category}</td>
                          <td className="border p-2">{schema.columns.join(', ')}</td>
                          <td className="border p-2">
                            <button
                              onClick={() => handleEditSchema(schema, index)}
                              className="text-blue-500 hover:text-blue-700 mr-2"
                              title="Edit Schema"
                            >
                              <FaEdit />
                            </button>
                            <button
                              onClick={() => handleDeleteSchema(schema.category)}
                              className="text-red-500 hover:text-red-700"
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
          <div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              {form.isEdit ? `Edit Schema for ${form.category}` : 'Add New Schema'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center space-x-4 mb-2">
                  <label>
                    <input
                      type="checkbox"
                      checked={form.useExistingCollection}
                      onChange={(e) => setForm({ ...form, useExistingCollection: e.target.checked })}
                      className="mr-1"
                      disabled={!dbName || form.isEdit}
                    />
                    Use Existing Collection
                  </label>
                </div>
                <label className="block text-gray-600 text-sm">Collection Name</label>
                {form.useExistingCollection && !form.isEdit ? (
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    required
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
                    className="w-full p-2 border rounded-lg"
                    required
                    disabled={form.isEdit}
                  />
                )}
              </div>
              <div>
                <label className="block text-gray-600 text-sm">Schema Columns</label>
                {form.columns.map((col, index) => (
                  <div key={index} className="flex items-center space-x-2 mb-2">
                    <input
                      type="text"
                      value={col}
                      onChange={(e) => handleColumnChange(index, e.target.value)}
                      placeholder={`Column ${index + 1} (e.g., customer_name)`}
                      className="flex-grow p-2 border rounded-lg"
                      required
                    />
                    {form.columns.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveColumn(index)}
                        className="bg-red-500 text-white p-2 rounded-lg hover:bg-red-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 flex items-center mt-2"
                >
                  <FaPlus className="mr-1" /> Add Column
                </button>
              </div>
              <div className="flex space-x-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
                >
                  {loading ? 'Saving...' : <><FaSave className="mr-2" /> {form.isEdit ? 'Update Schema' : 'Save Schema'}</>}
                </button>
                {form.isEdit && (
                  <button
                    type="button"
                    onClick={() => setForm({ category: '', columns: [''], isEdit: false, editIndex: null, useExistingCollection: false })}
                    className="flex-1 bg-gray-500 text-white p-3 rounded-lg hover:bg-gray-600"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CustomizeSchema;