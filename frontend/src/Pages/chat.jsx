"use client"

import { useState, useEffect, useRef } from "react"
import React from 'react'
import axios from "axios"
import {
  FaPaperPlane,
  FaSpinner,
  FaRocket,
  FaDatabase,
  FaComments,
  FaCog,
  FaHistory,
  FaUser,
  FaRobot,
  FaBrain,
  FaChartLine,
} from "react-icons/fa"
import { motion, AnimatePresence } from "framer-motion"
import { toast, ToastContainer } from "react-toastify"
import { useLocation, Link } from "react-router-dom"
import "react-toastify/dist/ReactToastify.css"

// DataFlowBackground component with updated metallic particle effect
const DataFlowBackground = () => {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particlesArray = []
    const numberOfParticles = 100

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width
        this.y = Math.random() * canvas.height
        this.size = Math.random() * 2 + 0.5
        this.speedX = Math.random() * 1.5 - 0.75
        this.speedY = Math.random() * 1.5 - 0.75
        this.color = `hsl(${Math.random() * 60 + 180}, 30%, 60%)` // Metallic blue-gray tones
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
        ctx.fillStyle = `rgba(255, 255, 255, 0.2)`
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fill()

        for (let i = 0; i < particlesArray.length; i++) {
          const dx = this.x - particlesArray[i].x
          const dy = this.y - particlesArray[i].y
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (distance < 120) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 - distance / 2400})`
            ctx.lineWidth = 0.3
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
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)" // Dark slate background
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

function Chat() {
  const [query, setQuery] = useState("")
  const [filename, setFilename] = useState("")
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState([])
  const [availableFiles, setAvailableFiles] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  const location = useLocation()
  const messagesEndRef = useRef(null)

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const response = await axios.get("http://localhost:8000/api/available_files/")
        const files = response.data.files || []
        setAvailableFiles(files)

        const params = new URLSearchParams(location.search)
        const urlFilename = params.get("filename")
        if (urlFilename && files.includes(urlFilename)) {
          setFilename(urlFilename)
        }
      } catch (err) {
        toast.error("Failed to fetch available files")
      }
    }

    fetchFiles()
  }, [location.search])

  const handleQuerySubmit = async () => {
    if (!query || !filename) {
      toast.error("Please enter a query and select a file")
      return
    }

    const newMessage = { text: query, sender: "user", timestamp: new Date().toISOString() }
    setMessages([...messages, newMessage])
    setLogs([...logs, { text: `User query: ${query}`, timestamp: new Date().toISOString() }])

    setLoading(true)
    setIsTyping(true)

    try {
      const formData = new FormData()
      formData.append("query", query)
      formData.append("filename", filename)

      const response = await axios.post("http://localhost:8000/api/query_rag/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      const { message, response: botResponse, logs: backendLogs } = response.data

      setTimeout(() => {
        setMessages([
          ...messages,
          newMessage,
          { text: botResponse, sender: "bot", timestamp: new Date().toISOString() },
        ])
        setLogs([...logs, ...backendLogs.map((log) => ({ text: log, timestamp: new Date().toISOString() }))])
        toast.success(message)
        setIsTyping(false)
      }, 1000)
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to process query"
      setMessages([...messages, newMessage, { text: errorMsg, sender: "bot", timestamp: new Date().toISOString() }])
      setLogs([
        ...logs,
        ...(err.response?.data?.logs?.map((log) => ({
          text: log,
          timestamp: new Date().toISOString(),
        })) || [{ text: errorMsg, timestamp: new Date().toISOString() }]),
      ])
      toast.error(errorMsg)
      setIsTyping(false)
    } finally {
      setLoading(false)
      setQuery("")
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleQuerySubmit()
    }
  }

  const suggestedQueries = [
    "What are the main trends in this dataset?",
    "Show me statistical summary of the data",
    "What are the key insights from this data?",
    "Identify any anomalies or outliers",
    "What correlations exist in the data?",
  ]

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-gray-200 font-sans">
      <DataFlowBackground />
      <ToastContainer position="top-right" autoClose={3000} theme="dark" />

      {/* Header */}
      <header className="bg-slate-900/90 backdrop-blur-lg border-b border-slate-700 shadow-md z-50 sticky top-0">
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
                <FaBrain className="text-blue-400" />
                <span className="text-gray-400 text-sm">AI Assistant</span>
              </div>
            </div>
            <nav className="flex space-x-6">
              <Link
                to="/"
                className="text-gray-400 hover:text-gray-100 transition-colors flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-slate-800"
              >
                <FaDatabase className="text-sm" />
                <span>Home</span>
              </Link>
              <Link
                to="/chat"
                className="text-blue-400 flex items-center space-x-2 px-3 py-2 rounded-md bg-slate-800"
              >
                <FaComments className="text-sm" />
                <span>Chat</span>
              </Link>
              <Link
                to="/customize-schema"
                className="text-gray-400 hover:text-gray-100 transition-colors flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-slate-800"
              >
                <FaCog className="text-sm" />
                <span>Schema</span>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow container mx-auto py-8 px-6 z-10 relative">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full">
          {/* Left Sidebar - Dataset Selection & Info */}
          <div className="xl:col-span-1 space-y-6">
            {/* Dataset Selection */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="bg-slate-900/80 backdrop-blur-lg p-6 rounded-xl shadow-xl border border-slate-700 hover:bg-slate-900/90 transition-all duration-300"
            >
              <h3 className="text-lg font-medium mb-4 flex items-center text-gray-100">
                <FaDatabase className="mr-2 text-blue-400" />
                Dataset Selection
              </h3>
              <select
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              >
                <option value="" disabled className="text-gray-500">
                  Select a dataset
                </option>
                {availableFiles.map((file) => (
                  <option key={file} value={file} className="text-gray-200 bg-slate-800">
                    {file}
                  </option>
                ))}
              </select>
              {filename && (
                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-sm text-blue-400 flex items-center">
                    <FaChartLine className="mr-2" />
                    Active Dataset: {filename}
                  </p>
                </div>
              )}
            </motion.div>


            {/* Query Logs */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.4 }}
              className="bg-slate-900/80 backdrop-blur-lg p-6 rounded-xl shadow-xl border border-slate-700 hover:bg-slate-900/90 transition-all duration-300 flex-1"
            >
              <h3 className="text-lg font-medium mb-4 flex items-center text-gray-100">
                <FaHistory className="mr-2 text-blue-400" />
                Query Logs
              </h3>
              <div className="bg-slate-800/50 border border-slate-600 p-4 rounded-lg max-h-60 overflow-y-auto">
                <AnimatePresence>
                  {logs.length > 0 ? (
                    logs.map((log, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className="text-xs text-gray-300 mb-2 p-2 rounded bg-slate-800/50 border border-slate-600"
                      >
                        <span className="text-blue-400 mr-2 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        {log.text}
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center text-gray-400 py-4">
                      <FaHistory className="text-2xl mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No queries yet</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          {/* Main Chat Area */}
          <div className="xl:col-span-3 flex flex-col">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="bg-slate-900/80 backdrop-blur-lg rounded-xl shadow-xl border border-slate-700 flex flex-col h-full"
            >
              {/* Chat Header */}
              <div className="p-6 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
                      <FaRobot className="text-gray-200 text-xl" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-100">AI Data Assistant</h2>
                      <p className="text-gray-400 text-sm">Ask questions about your dataset</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-400">Online</span>
                  </div>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 p-6 flex flex-col gap-4 min-h-0">
                {messages.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="flex flex-col items-center justify-center flex-1 text-center"
                  >
                    <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
                      <FaBrain className="text-gray-200 text-2xl" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2 text-gray-100">
                      Welcome to AI Data Assistant
                    </h3>
                    <p className="text-gray-400 max-w-md">
                      Select a dataset and start asking questions to get intelligent insights about your data.
                    </p>
                  </motion.div>
                )}

                <AnimatePresence>
                  {messages.map((msg, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.98 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`flex items-start space-x-3 max-w-2xl`}>
                        {msg.sender === "bot" && (
                          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                            <FaRobot className="text-gray-200 text-sm" />
                          </div>
                        )}
                        <div
                          className={`p-4 rounded-lg bg-slate-800/70 border ${
                            msg.sender === "user"
                              ? "bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border-blue-500/30 ml-auto"
                              : "border-slate-600"
                          } shadow-md transition-all duration-200 hover:shadow-lg`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-400 font-medium">
                              {msg.sender === "user" ? "You" : "AI Assistant"}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-gray-200 leading-relaxed">{msg.text}</p>
                        </div>
                        {msg.sender === "user" && (
                          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                            <FaUser className="text-gray-200 text-sm" />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Typing Indicator */}
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="flex justify-start"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
                        <FaRobot className="text-gray-200 text-sm" />
                      </div>
                      <div className="p-4 rounded-lg bg-slate-800/70 border border-slate-600 shadow-md">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.1s" }}
                          ></div>
                          <div
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.2s" }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-6 border-t border-slate-700">
                <div className="flex items-end space-x-4">
                  <div className="flex-1">
                    <textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask a question about your dataset..."
                      className="w-full p-4 bg-slate-800 border border-slate-600 rounded-lg text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none"
                      rows={3}
                    />
                  </div>
                  <button
                    onClick={handleQuerySubmit}
                    disabled={loading || !query || !filename}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 text-gray-100 p-4 rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-600 disabled:to-slate-600 flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg min-w-[60px]"
                  >
                    {loading ? <FaSpinner className="animate-spin text-xl" /> : <FaPaperPlane className="text-xl" />}
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3 text-sm text-gray-400">
                  <span>Press Enter to send, Shift+Enter for new line</span>
                  <span>{query.length}/500</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900/90 backdrop-blur-lg border-t border-slate-700 text-gray-400 p-6 text-center z-10 relative">
        <p>© 2025 DataEng-Automata. Intelligent conversations with your data.</p>
      </footer>
    </div>
  )
}

export default Chat