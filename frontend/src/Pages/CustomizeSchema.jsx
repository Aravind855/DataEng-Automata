"use client"

import { useState, useEffect, useRef } from "react"
import axios from "axios"
import React from 'react';

import {
  FaDatabase,
  FaPlus,
  FaSave,
  FaTrash,
  FaEdit,
  FaRocket,
  FaCog,
  FaComments,
  FaTable,
  FaColumns,
  FaProjectDiagram,
  FaEye,
  FaCheck,
  FaTimes,
} from "react-icons/fa"
import { toast, ToastContainer } from "react-toastify"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import "react-toastify/dist/ReactToastify.css"

const DataFlowBackground = () => {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particlesArray = []
    const numberOfParticles = 150

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width
        this.y = Math.random() * canvas.height
        this.size = Math.random() * 2 + 1
        this.speedX = Math.random() * 2 - 1
        this.speedY = Math.random() * 2 - 1
        this.color = `hsl(${Math.random() * 360}, 70%, 50%)`
      }

      update() {
        this.x += this.speedX
        this.y += this.speedY
        if (this.x > canvas.width) this.x = 0
        if (this.x < 0) this.x = canvas.width
        if (this.y > canvas.height) this.y = 0
        if (this.y < 0) this.y = canvas.height
      }

      draw() {
        ctx.fillStyle = `rgba(255, 255, 255, 0.1)`
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fill()

        for (let i = 0; i < particlesArray.length; i++) {
          const dx = this.x - particlesArray[i].x
          const dy = this.y - particlesArray[i].y
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (distance < 100) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 - distance / 2000})`
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(this.x, this.y)
            ctx.lineTo(particlesArray[i].x, particlesArray[i].y)
            ctx.stroke()
          }
        }
      }
    }

    for (let i = 0; i < numberOfParticles; i++) {
      particlesArray.push(new Particle())
    }

    function animate() {
      ctx.fillStyle = "rgba(26, 26, 46, 0.8)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update()
        particlesArray[i].draw()
      }
      requestAnimationFrame(animate)
    }

    animate()

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return <canvas ref={canvasRef} className="absolute top-0 left-0 z-0" />
}

function CustomizeSchema() {
  const [databases, setDatabases] = useState([])
  const [dbName, setDbName] = useState("")
  const [useExistingDb, setUseExistingDb] = useState(true)
  const [collections, setCollections] = useState([])
  const [schemas, setSchemas] = useState([])
  const [form, setForm] = useState({
    category: "",
    columns: [""],
    isEdit: false,
    editIndex: null,
    useExistingCollection: false,
  })
  const [loading, setLoading] = useState(false)
  const [selectedSchema, setSelectedSchema] = useState(null)
  const [showPreview, setShowPreview] = useState(false)

  const columnTypes = [
    { value: "VARCHAR(255)", label: "Text", icon: "📝" },
    { value: "INT", label: "Number", icon: "🔢" },
    { value: "DATE", label: "Date", icon: "📅" },
    { value: "BOOLEAN", label: "Boolean", icon: "✅" },
    { value: "DECIMAL(10,2)", label: "Decimal", icon: "💰" },
    { value: "TEXT", label: "Long Text", icon: "📄" },
  ]

  useEffect(() => {
    const fetchDatabases = async () => {
      try {
        const response = await axios.get("http://localhost:8000/api/list_databases/")
        setDatabases(response.data.databases || [])
      } catch (err) {
        toast.error("Failed to fetch databases")
      }
    }
    fetchDatabases()
  }, [])

  const fetchCollectionsAndSchemas = async (dbName) => {
    if (!dbName) {
      setCollections([])
      setSchemas([])
      return
    }

    try {
      const collectionsResponse = await axios.post(
        "http://localhost:8000/api/list_collections/",
        { db_name: dbName },
        { headers: { "Content-Type": "application/json" } },
      )
      setCollections(collectionsResponse.data.collections || [])

      const schemasResponse = await axios.post(
        "http://localhost:8000/api/list_schemas/",
        { db_name: dbName },
        { headers: { "Content-Type": "application/json" } },
      )
      setSchemas(schemasResponse.data.schemas || [])
    } catch (err) {
      toast.error(`Failed to fetch data for ${dbName}`)
      setCollections([])
      setSchemas([])
    }
  }

  const handleDbChange = (value) => {
    setDbName(value)
    setForm({ category: "", columns: [""], isEdit: false, editIndex: null, useExistingCollection: false })
    fetchCollectionsAndSchemas(value)
  }

  const handleColumnChange = (index, value) => {
    const newColumns = [...form.columns]
    newColumns[index] = value
    setForm({ ...form, columns: newColumns })
  }

  const handleAddColumn = () => {
    setForm({ ...form, columns: [...form.columns, ""] })
  }

  const handleRemoveColumn = (index) => {
    if (form.columns.length > 1) {
      const newColumns = form.columns.filter((_, i) => i !== index)
      setForm({ ...form, columns: newColumns })
    }
  }

  const handleEditSchema = (schema, index) => {
    setForm({
      category: schema.category,
      columns: schema.columns.length ? schema.columns : [""],
      isEdit: true,
      editIndex: index,
      useExistingCollection: true,
    })
  }

  const handleDeleteSchema = async (category) => {
    if (!window.confirm(`Are you sure you want to delete the schema for ${category}?`)) return

    setLoading(true)
    try {
      const response = await axios.post(
        "http://localhost:8000/api/delete_schema/",
        { db_name: dbName, category },
        { headers: { "Content-Type": "application/json" } },
      )
      toast.success(response.data.message)
      fetchCollectionsAndSchemas(dbName)
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to delete schema"
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!dbName) {
      toast.error("Please select or enter a database name")
      return
    }
    if (!form.category || form.columns.some((col) => !col.trim())) {
      toast.error("Please fill in collection name and all column fields")
      return
    }

    setLoading(true)
    try {
      const response = await axios.post(
        "http://localhost:8000/api/save_schema/",
        {
          db_name: dbName,
          category: form.category,
          columns: form.columns.filter((col) => col.trim()),
        },
        { headers: { "Content-Type": "application/json" } },
      )
      toast.success(response.data.message)
      setForm({ category: "", columns: [""], isEdit: false, editIndex: null, useExistingCollection: false })
      fetchCollectionsAndSchemas(dbName)
      if (!useExistingDb) {
        const response = await axios.get("http://localhost:8000/api/list_databases/")
        setDatabases(response.data.databases || [])
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to save schema"
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const getColumnIcon = (columnName) => {
    const name = columnName.toLowerCase()
    if (name.includes("id")) return "🔑"
    if (name.includes("name") || name.includes("title")) return "📝"
    if (name.includes("date") || name.includes("time")) return "📅"
    if (name.includes("price") || name.includes("amount") || name.includes("cost")) return "💰"
    if (name.includes("email")) return "📧"
    if (name.includes("phone")) return "📞"
    if (name.includes("address")) return "🏠"
    return "📊"
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white overflow-hidden">
      <DataFlowBackground />
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <header className="backdrop-blur-md bg-white/10 border-b border-white/20 shadow-lg z-50 relative">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <FaRocket className="text-white text-xl" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                DataEng-Automata
              </h1>
              <div className="hidden md:flex items-center space-x-2 ml-4">
                <FaProjectDiagram className="text-purple-400" />
                <span className="text-white/70">Schema Builder</span>
              </div>
            </div>
            <nav className="flex space-x-8">
              <Link
                to="/"
                className="text-white/80 hover:text-white transition-colors flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-white/10"
              >
                <FaDatabase className="text-sm" />
                <span>Home</span>
              </Link>
              <Link
                to="/chat"
                className="text-white/80 hover:text-white transition-colors flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-white/10"
              >
                <FaComments className="text-sm" />
                <span>Chat</span>
              </Link>
              <Link
                to="/customize-schema"
                className="text-purple-400 flex items-center space-x-2 px-3 py-2 rounded-lg bg-white/10"
              >
                <FaCog className="text-sm" />
                <span>Schema</span>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-8 text-center z-10 relative">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-blue-400 to-green-400 bg-clip-text text-transparent">
            Visual Schema Builder
          </h2>
          <p className="text-lg text-white/70 max-w-2xl mx-auto">
            Design and manage your database schemas with our intuitive visual interface. Create, edit, and visualize
            your data structures effortlessly.
          </p>
        </motion.div>
      </section>

      {/* Main Content */}
      <main className="container mx-auto py-6 px-6 z-10 relative">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Left Panel - Database & Schema Management */}
          <div className="xl:col-span-1 space-y-6">
            {/* Database Selection */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="backdrop-blur-md bg-white/10 p-6 rounded-2xl shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300"
            >
              <h3 className="text-xl font-semibold mb-6 flex items-center">
                <FaDatabase className="mr-3 text-blue-400" />
                Database Selection
              </h3>

              <div className="space-y-4">
                <div className="flex space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={useExistingDb}
                      onChange={() => setUseExistingDb(true)}
                      className="w-4 h-4 text-blue-600 bg-white/10 border-white/30 focus:ring-blue-500"
                    />
                    <span className="text-white/80">Existing</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!useExistingDb}
                      onChange={() => setUseExistingDb(false)}
                      className="w-4 h-4 text-blue-600 bg-white/10 border-white/30 focus:ring-blue-500"
                    />
                    <span className="text-white/80">Create New</span>
                  </label>
                </div>

                {useExistingDb ? (
                  <select
                    value={dbName}
                    onChange={(e) => handleDbChange(e.target.value)}
                    className="w-full p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  >
                    <option value="" disabled className="text-gray-600">
                      Select a database
                    </option>
                    {databases.map((db) => (
                      <option key={db} value={db} className="text-gray-800 bg-white">
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
                    className="w-full p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                )}

                {dbName && (
                  <div className="p-3 bg-green-500/10 border border-green-400/30 rounded-lg">
                    <p className="text-sm text-green-400 flex items-center">
                      <FaCheck className="mr-2" />
                      Database: {dbName}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Existing Schemas */}
            {dbName && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="backdrop-blur-md bg-white/10 p-6 rounded-2xl shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300"
              >
                <h3 className="text-xl font-semibold mb-6 flex items-center">
                  <FaTable className="mr-3 text-green-400" />
                  Existing Schemas
                </h3>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {schemas.length > 0 ? (
                    schemas.map((schema, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-all duration-300"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-white flex items-center">
                            <FaTable className="mr-2 text-blue-400" />
                            {schema.category}
                          </h4>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setSelectedSchema(schema)
                                setShowPreview(true)
                              }}
                              className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition-colors"
                              title="Preview Schema"
                            >
                              <FaEye className="text-blue-400" />
                            </button>
                            <button
                              onClick={() => handleEditSchema(schema, index)}
                              className="p-2 bg-yellow-500/20 hover:bg-yellow-500/30 rounded-lg transition-colors"
                              title="Edit Schema"
                            >
                              <FaEdit className="text-yellow-400" />
                            </button>
                            <button
                              onClick={() => handleDeleteSchema(schema.category)}
                              className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors"
                              title="Delete Schema"
                            >
                              <FaTrash className="text-red-400" />
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-white/70">
                          <span className="text-white/50">Columns: </span>
                          {schema.columns.slice(0, 3).map((col, i) => (
                            <span key={i} className="inline-flex items-center mr-2">
                              {getColumnIcon(col)} {col}
                              {i < Math.min(schema.columns.length, 3) - 1 && ", "}
                            </span>
                          ))}
                          {schema.columns.length > 3 && (
                            <span className="text-blue-400">+{schema.columns.length - 3} more</span>
                          )}
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-white/50">
                      <FaTable className="text-4xl mx-auto mb-4 opacity-50" />
                      <p>No schemas found</p>
                      <p className="text-sm mt-2">Create your first schema to get started</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Right Panel - Schema Builder */}
          <div className="xl:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="backdrop-blur-md bg-white/10 p-8 rounded-2xl shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-semibold flex items-center">
                  <FaProjectDiagram className="mr-3 text-purple-400" />
                  {form.isEdit ? `Edit Schema: ${form.category}` : "Create New Schema"}
                </h3>
                {form.isEdit && (
                  <button
                    onClick={() =>
                      setForm({
                        category: "",
                        columns: [""],
                        isEdit: false,
                        editIndex: null,
                        useExistingCollection: false,
                      })
                    }
                    className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 rounded-lg transition-colors flex items-center"
                  >
                    <FaTimes className="mr-2" />
                    Cancel Edit
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Collection Name */}
                <div>
                  <div className="flex items-center space-x-4 mb-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.useExistingCollection}
                        onChange={(e) => setForm({ ...form, useExistingCollection: e.target.checked })}
                        className="w-4 h-4 text-blue-600 bg-white/10 border-white/30 focus:ring-blue-500"
                        disabled={!dbName || form.isEdit}
                      />
                      <span className="text-white/80">Use Existing Collection</span>
                    </label>
                  </div>

                  <label className="block text-white/80 font-semibold mb-3 text-lg">Collection Name</label>
                  {form.useExistingCollection && !form.isEdit ? (
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                      disabled={!dbName}
                    >
                      <option value="" disabled className="text-gray-600">
                        Select a collection
                      </option>
                      {collections.map((col) => (
                        <option key={col} value={col} className="text-gray-800 bg-white">
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
                      className="w-full p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                      disabled={form.isEdit}
                    />
                  )}
                </div>

                {/* Visual Column Builder */}
                <div>
                  <label className="block text-white/80 font-semibold mb-6 text-lg flex items-center">
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
                          className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all duration-300"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="flex-shrink-0">
                              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                                <span className="text-white font-bold">{index + 1}</span>
                              </div>
                            </div>
                            <div className="flex-1">
                              <input
                                type="text"
                                value={col}
                                onChange={(e) => handleColumnChange(index, e.target.value)}
                                placeholder={`Column ${index + 1} name (e.g., user_id, email, created_at)`}
                                className="w-full p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                              />
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-2xl">{getColumnIcon(col)}</span>
                              {form.columns.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveColumn(index)}
                                  className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors"
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
                      className="w-full p-4 bg-gradient-to-r from-green-500/20 to-emerald-600/20 border-2 border-dashed border-green-400/30 rounded-xl hover:border-green-400/50 transition-all duration-300 flex items-center justify-center text-green-400 hover:text-green-300"
                    >
                      <FaPlus className="mr-2" />
                      Add New Column
                    </motion.button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-4 pt-6">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-blue-600 text-white p-4 rounded-xl hover:from-purple-600 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 flex items-center justify-center transition-all duration-300 shadow-lg text-lg font-semibold"
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Saving...
                      </div>
                    ) : (
                      <>
                        <FaSave className="mr-2" />
                        {form.isEdit ? "Update Schema" : "Create Schema"}
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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="backdrop-blur-md bg-white/10 p-8 rounded-2xl shadow-2xl border border-white/20 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-semibold flex items-center">
                  <FaEye className="mr-3 text-blue-400" />
                  Schema Preview: {selectedSchema.category}
                </h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors"
                >
                  <FaTimes className="text-red-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                  <h4 className="text-lg font-semibold mb-4 text-white flex items-center">
                    <FaTable className="mr-2 text-green-400" />
                    Table Structure
                  </h4>
                  <div className="space-y-3">
                    {selectedSchema.columns.map((column, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="text-2xl">{getColumnIcon(column)}</span>
                          <span className="font-medium text-white">{column}</span>
                        </div>
                        <span className="text-sm text-white/60 bg-white/10 px-3 py-1 rounded-full">
                          Column {index + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                  <h4 className="text-lg font-semibold mb-4 text-white flex items-center">
                    <FaDatabase className="mr-2 text-purple-400" />
                    Schema Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-white/60">Collection Name:</span>
                      <p className="text-white font-medium">{selectedSchema.category}</p>
                    </div>
                    <div>
                      <span className="text-white/60">Total Columns:</span>
                      <p className="text-white font-medium">{selectedSchema.columns.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="backdrop-blur-md bg-white/10 border-t border-white/20 text-white p-6 text-center z-10 relative">
        <p className="text-white/70">© 2025 DataEng-Automata. Building the future of data architecture.</p>
      </footer>
    </div>
  )
}

export default CustomizeSchema
