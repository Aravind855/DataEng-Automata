"use client"

import { useState, useEffect, useRef } from "react"
import axios from "axios"
import {
  FaUpload,
  FaCheckCircle,
  FaSpinner,
  FaFileCsv,
  FaFilePdf,
  FaComments,
  FaHistory,
  FaDatabase,
  FaCog,
  FaRocket,
} from "react-icons/fa"
import { motion, AnimatePresence } from "framer-motion"
import { toast, ToastContainer } from "react-toastify"
import { useNavigate, Link } from "react-router-dom"
import "react-toastify/dist/ReactToastify.css"
import React from 'react';


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

function Home() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [dbName, setDbName] = useState("")
  const [databases, setDatabases] = useState([])
  const [uploadStatus, setUploadStatus] = useState("")
  const [aiAnalysis, setAiAnalysis] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [agentStatus, setAgentStatus] = useState({
    ingestion: {
      status: "pending",
      tasks: {
        classification: "pending",
        validation: "pending",
        primaryKey: "pending",
        insertion: "pending",
        move: "pending",
        log: "pending",
      },
    },
    transformation: "pending",
    report: "pending",
  })
  const [reportPath, setReportPath] = useState("")
  const [logs, setLogs] = useState([])
  const [transformedFilename, setTransformedFilename] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [logContent, setLogContent] = useState("")

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

  const handleFileChange = (e) => {
    setFile(e.target.files[0])
    resetState()
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setFile(e.dataTransfer.files[0])
    resetState()
  }

  const resetState = () => {
    setUploadStatus("")
    setAiAnalysis("")
    setError("")
    setProgress(0)
    setAgentStatus({
      ingestion: {
        status: "pending",
        tasks: {
          classification: "pending",
          validation: "pending",
          primaryKey: "pending",
          insertion: "pending",
          move: "pending",
          log: "pending",
        },
      },
      transformation: "pending",
      report: "pending",
    })
    setReportPath("")
    setLogs([])
    setTransformedFilename("")
  }

  const toggleSidebar = async () => {
    if (!isSidebarOpen) {
      try {
        const response = await axios.get("http://localhost:8000/api/get_logs/")
        setLogContent(response.data.logs || "No logs available")
      } catch (err) {
        toast.error("Failed to fetch logs")
        setLogContent("Error: Unable to fetch logs")
      }
    }
    setIsSidebarOpen(!isSidebarOpen)
  }

  const handleUpload = async () => {
    if (!file || !dbName) {
      setError("Please select a file and database")
      toast.error("Please select a file and database")
      return
    }

    const formData = new FormData()
    formData.append("file", file)
    formData.append("db_name", dbName)

    try {
      setLoading(true)
      setProgress(10)
      setAgentStatus((prev) => ({
        ...prev,
        ingestion: {
          ...prev.ingestion,
          status: "running",
          tasks: { ...prev.ingestion.tasks, classification: "running" },
        },
      }))
      setLogs([{ text: "Starting data classification...", timestamp: new Date().toISOString() }])

      const response = await axios.post("http://localhost:8000/api/upload/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      const { message, category, valid, transformation_result, report_path, logs: backendLogs } = response.data

      setLogs(
        backendLogs.map((log) => ({
          text: log,
          timestamp: new Date().toISOString(),
        })),
      )

      let taskProgress = 10
      const ingestionTasks = ["classification", "validation", "primaryKey", "insertion", "move", "log"]

      ingestionTasks.forEach((task, index) => {
        setTimeout(
          () => {
            setAgentStatus((prev) => ({
              ...prev,
              ingestion: {
                ...prev.ingestion,
                tasks: { ...prev.ingestion.tasks, [task]: "completed" },
              },
            }))
            taskProgress += 15
            setProgress(taskProgress)
          },
          (index + 1) * 500,
        )
      })

      setTimeout(() => {
        setAgentStatus((prev) => ({
          ...prev,
          ingestion: { ...prev.ingestion, status: "completed" },
        }))
        setProgress(40)
      }, 3500)

      setTimeout(() => {
        setAgentStatus((prev) => ({ ...prev, transformation: "running" }))
        setProgress(50)
      }, 4000)

      if (transformation_result) {
        setTimeout(() => {
          setAgentStatus((prev) => ({ ...prev, transformation: "completed" }))
          setTransformedFilename(transformation_result.split(/[\\/]/).pop())
          setProgress(80)
        }, 4500)
      }

      setTimeout(() => {
        setAgentStatus((prev) => ({ ...prev, report: "running" }))
        setProgress(90)
      }, 5000)

      if (report_path) {
        setTimeout(() => {
          setAgentStatus((prev) => ({ ...prev, report: "completed" }))
          setReportPath(report_path)
          setProgress(100)
        }, 5500)
      }

      setUploadStatus(message)
      setAiAnalysis(JSON.stringify({ category, valid, transformation_result, report_path }, null, 2))
      toast.success("Process completed successfully!")
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || "Upload failed"
      setError(errorMsg)
      toast.error(errorMsg)
      setAgentStatus((prev) => ({
        ...prev,
        ingestion: { ...prev.ingestion, status: "failed" },
      }))
      setLogs(
        err.response?.data?.logs?.map((log) => ({
          text: log,
          timestamp: new Date().toISOString(),
        })) || [{ text: errorMsg, timestamp: new Date().toISOString() }],
      )
    } finally {
      setTimeout(() => setLoading(false), 6000)
    }
  }

  const downloadReport = (format = "markdown") => {
    if (!reportPath) {
      toast.error("No report available to download")
      return
    }

    if (format === "markdown") {
      window.open(`http://localhost:8000${reportPath}`, "_blank")
      toast.info("Downloading Markdown report...")
    } else if (format === "pdf") {
      axios
        .post(
          "http://localhost:8000/api/download_pdf/",
          { report_path: reportPath },
          {
            responseType: "blob",
          },
        )
        .then((response) => {
          const url = window.URL.createObjectURL(new Blob([response.data]))
          const link = document.createElement("a")
          link.href = url
          link.setAttribute("download", reportPath.replace(".md", ".pdf"))
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)
          toast.info("Downloading PDF report...")
        })
        .catch((err) => {
          const errorMsg = err.response?.data?.error || "Failed to download PDF"
          toast.error(errorMsg)
        })
    }
  }

  const goToChat = () => {
    if (transformedFilename) {
      navigate(`/chat?filename=${encodeURIComponent(transformedFilename)}`)
    } else {
      toast.error("No transformed file available to query")
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case "running":
        return <FaSpinner className="animate-spin text-blue-400" />
      case "completed":
        return <FaCheckCircle className="text-green-400" />
      case "failed":
        return <FaSpinner className="text-red-400" />
      default:
        return <FaSpinner className="text-gray-400" />
    }
  }

  const roadmapData = {
    ingestion: {
      title: "Data Ingestion",
      tasks: [
        "Dataset Classification",
        "Schema Validation",
        "Primary Key Detection",
        "Dataset Ingestion",
        "File Movement",
        "Log Generation",
      ],
    },
    transformation: {
      title: "Data Transformation",
      tasks: [ "Data Cleaning", "Feature Engineering", "Transformed data ingestion"],
    },
    report: {
      title: "Report Generation",
      tasks: ["Anamoly Detection", "Data Profiling", "Report Generation"],
    },
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
                className="text-white/80 hover:text-white transition-colors flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-white/10"
              >
                <FaCog className="text-sm" />
                <span>Schema</span>
              </Link>
              <button
                onClick={toggleSidebar}
                className="text-white/80 hover:text-white transition-colors flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-white/10"
              >
                <FaHistory className="text-sm" />
                <span>Logs</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Product Introduction */}
      <section className="container mx-auto px-6 py-12 text-center z-12 relative">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h2 className="text-4xl font-bold mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Intelligent Data Engineering Platform
          </h2>
          <p className="text-xl text-white/70 max-w-3xl mx-auto leading-relaxed">
            Transform your raw data into actionable insights with our AI-powered automation platform. Streamline data
            ingestion, transformation, and reporting with intelligent processing workflows.
          </p>
        </motion.div>
      </section>

      {/* Main Content */}
      <main className="container mx-auto py-8 px-6 z-10 relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Upload Dataset Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="backdrop-blur-md bg-white/10 p-8 rounded-2xl shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300"
          >
            <h2 className="text-2xl font-semibold mb-6 flex items-center">
              <FaUpload className="mr-3 text-blue-400" /> Upload Dataset
            </h2>

            <div
              className="border-2 border-dashed border-blue-400/50 p-8 rounded-xl text-center hover:border-blue-400 transition-colors duration-300 mb-6"
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
                <FaUpload className="text-5xl text-blue-400 mb-4" />
                <p className="text-white/80 text-lg mb-2">Drag & drop or click to select</p>
                <p className="text-white/60 text-sm">Supported formats: .csv, .json, .xlsx</p>
              </label>
              {file && (
                <div className="mt-4 p-3 bg-white/10 rounded-lg">
                  <p className="text-sm text-green-400">Selected: {file.name}</p>
                </div>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-white/80 font-semibold mb-3 text-lg">Database Selection</label>
              <select
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
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
            </div>

            <button
              onClick={handleUpload}
              disabled={loading || !file || !dbName}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 rounded-xl hover:from-blue-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 flex items-center justify-center transition-all duration-300 text-lg font-semibold shadow-lg"
            >
              {loading ? <FaSpinner className="animate-spin mr-3" /> : <FaUpload className="mr-3" />}
              {loading ? "Processing..." : "Upload & Analyze"}
            </button>
          </motion.div>

          {/* Execution Logs Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="backdrop-blur-md bg-white/10 p-8 rounded-2xl shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300"
          >
            <h2 className="text-2xl font-semibold mb-6 flex items-center">
              <FaHistory className="mr-3 text-green-400" /> Execution Logs
            </h2>
            <div className="bg-black/30 backdrop-blur-sm border border-white/10 p-6 rounded-xl max-h-80 overflow-y-auto">
              <AnimatePresence>
                {logs.length > 0 ? (
                  logs.map((log, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-sm text-white/70 mb-2 p-2 rounded bg-white/5"
                    >
                      <span className="text-xs text-blue-400 mr-3 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      {log.text}
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center text-white/50 py-8">
                    <FaHistory className="text-4xl mx-auto mb-4 opacity-50" />
                    <p>No logs available yet</p>
                    <p className="text-sm mt-2">Upload a dataset to see execution logs</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* Processing Roadmap - Vertical */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="backdrop-blur-md bg-white/10 p-8 rounded-2xl shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300 mb-8"
        >
          <h2 className="text-2xl font-semibold mb-8 flex items-center justify-center">
            <FaCog className="mr-3 text-purple-400" /> Processing Roadmap
          </h2>

          <div className="flex flex-col space-y-8">
            {Object.entries(roadmapData).map(([key, stage], index) => (
              <div key={key} className="flex items-start space-x-6">
                {/* Status Icon */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      agentStatus[key] === "completed"
                        ? "bg-green-500/20 border-2 border-green-400"
                        : agentStatus[key] === "running"
                          ? "bg-blue-500/20 border-2 border-blue-400"
                          : "bg-gray-500/20 border-2 border-gray-400"
                    }`}
                  >
                    {getStatusIcon(key === "ingestion" ? agentStatus.ingestion.status : agentStatus[key])}
                  </div>
                  {index < Object.keys(roadmapData).length - 1 && (
                    <div className="w-0.5 h-16 bg-gradient-to-b from-white/30 to-transparent mt-4"></div>
                  )}
                </div>

                {/* Stage Content */}
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white mb-4">{stage.title}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {stage.tasks.map((task, taskIndex) => {
                      let taskStatus = "pending"
                      if (key === "ingestion") {
                        const taskKeys = ["classification", "validation", "primaryKey", "insertion", "move", "log"]
                        taskStatus = agentStatus.ingestion.tasks[taskKeys[taskIndex]] || "pending"
                      } else {
                        taskStatus =
                          agentStatus[key] === "completed"
                            ? "completed"
                            : agentStatus[key] === "running"
                              ? "running"
                              : "pending"
                      }

                      return (
                        <div
                          key={taskIndex}
                          className={`p-3 rounded-lg backdrop-blur-sm border transition-all duration-300 ${
                            taskStatus === "completed"
                              ? "bg-green-500/10 border-green-400/30"
                              : taskStatus === "running"
                                ? "bg-blue-500/10 border-blue-400/30"
                                : "bg-white/5 border-white/10"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-white/80">{task}</span>
                            <div className="w-4 h-4">{getStatusIcon(taskStatus)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="mt-8">
            <div className="flex justify-between text-sm text-white/60 mb-2">
              <span>Overall Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-500 shadow-lg"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </motion.div>

        {/* Status and Results Cards */}
        {uploadStatus && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="backdrop-blur-md bg-white/10 p-8 rounded-2xl shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300 mb-8"
          >
            <h2 className="text-2xl font-semibold mb-4 flex items-center">
              <FaCheckCircle className="mr-3 text-green-400" /> Status
            </h2>
            <p className="text-white/80 text-lg">{uploadStatus}</p>
          </motion.div>
        )}

        {aiAnalysis && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="backdrop-blur-md bg-white/10 p-8 rounded-2xl shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300 mb-8"
          >
            <h2 className="text-2xl font-semibold mb-4 flex items-center">
              <FaDatabase className="mr-3 text-blue-400" /> AI Analysis
            </h2>
            <pre className="whitespace-pre-wrap text-white/70 overflow-auto max-h-60 bg-black/20 p-4 rounded-lg font-mono text-sm">
              {aiAnalysis}
            </pre>
          </motion.div>
        )}

        {/* Action Buttons */}
        {(reportPath || uploadStatus) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="backdrop-blur-md bg-white/10 p-8 rounded-2xl shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300 mb-8"
          >
            <h2 className="text-2xl font-semibold mb-6 flex items-center">
              <FaCog className="mr-3 text-purple-400" /> Actions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {reportPath && (
                <>
                  <button
                    onClick={() => downloadReport("markdown")}
                    className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-4 rounded-xl hover:from-green-600 hover:to-emerald-700 flex items-center justify-center transition-all duration-300 disabled:from-gray-600 disabled:to-gray-700 shadow-lg"
                    disabled={agentStatus.report !== "completed"}
                  >
                    <FaFileCsv className="mr-2" /> Download Markdown
                  </button>
                  <button
                    onClick={() => downloadReport("pdf")}
                    className="bg-gradient-to-r from-red-500 to-pink-600 text-white p-4 rounded-xl hover:from-red-600 hover:to-pink-700 flex items-center justify-center transition-all duration-300 disabled:from-gray-600 disabled:to-gray-700 shadow-lg"
                    disabled={agentStatus.report !== "completed"}
                  >
                    <FaFilePdf className="mr-2" /> Download PDF
                  </button>
                </>
              )}
              {uploadStatus && (
                <button
                  onClick={goToChat}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 rounded-xl hover:from-blue-600 hover:to-purple-700 flex items-center justify-center transition-all duration-300 shadow-lg"
                >
                  <FaComments className="mr-2" /> Go to Chat
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Error Card */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="backdrop-blur-md bg-red-500/10 p-8 rounded-2xl shadow-2xl border border-red-400/30 hover:bg-red-500/15 transition-all duration-300"
          >
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-semibold mb-4 flex items-center text-red-400">
                  <FaSpinner className="mr-3" /> Error
                </h2>
                <p className="text-white/80">{error}</p>
              </div>
              <button onClick={() => setError("")} className="text-red-400 hover:text-red-300 text-2xl">
                ×
              </button>
            </div>
          </motion.div>
        )}
      </main>

      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="fixed top-0 right-0 h-full w-96 backdrop-blur-md bg-white/10 border-l border-white/20 shadow-2xl p-6 overflow-y-auto z-50 text-white"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Ingestion Logs</h2>
              <button
                onClick={toggleSidebar}
                className="text-white/60 hover:text-red-400 transition-all duration-300 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="text-sm text-white/80 whitespace-pre-wrap bg-black/20 p-4 rounded-lg font-mono">
              {logContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="backdrop-blur-md bg-white/10 border-t border-white/20 text-white p-6 text-center z-10 relative">
        <p className="text-white/70">© 2025 DataEng-Automata. Transforming data into intelligence.</p>
      </footer>
    </div>
  )
}

export default Home
