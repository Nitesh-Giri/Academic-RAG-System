"use client"

import { useState } from "react"
import { UploadIcon } from "lucide-react"
import api from "../services/api"

export function Upload() {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState([])

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files)
    const newFiles = selectedFiles.map((file) => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: "pending",
      progress: 0,
    }))
    setFiles((prev) => [...prev, ...newFiles])
  }

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const uploadFiles = async () => {
    if (files.length === 0) return

    setUploading(true)
    const results = []

    for (const fileItem of files) {
      try {
        const formData = new FormData()
        formData.append("paper", fileItem.file)

        const response = await api.post("/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (progressEvent) => {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            setFiles((prev) => prev.map((f) => (f.id === fileItem.id ? { ...f, progress, status: "uploading" } : f)))
          },
        })

        results.push({
          filename: fileItem.file.name,
          status: "success",
          data: response.data,
        })

        setFiles((prev) => prev.map((f) => (f.id === fileItem.id ? { ...f, status: "completed" } : f)))
      } catch (error) {
        results.push({
          filename: fileItem.file.name,
          status: "error",
          error: error.response?.data?.message || "Upload failed",
        })

        setFiles((prev) => prev.map((f) => (f.id === fileItem.id ? { ...f, status: "error" } : f)))
      }
    }

    setUploadResults(results)
    setUploading(false)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-serif font-bold text-slate-900 bg-gradient-to-r from-blue-400 via-purple-400 to-rose-400 bg-clip-text text-transparent">Upload Research Papers</h1>
        <p className="text-slate-600 font-serif text-white">
          Upload PDF files of academic papers to add them to the citation network and enable AI-powered analysis
        </p>
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors">
          <UploadIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">Upload PDF Files</h3>
          <p className="text-slate-600 mb-4">Drag and drop files here, or click to select</p>
          <input type="file" multiple accept=".pdf" onChange={handleFileSelect} className="hidden" id="file-upload" />
          <label
            htmlFor="file-upload"
            className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg cursor-pointer inline-flex items-center space-x-2 transition-colors"
          >
            <UploadIcon className="h-4 w-4" />
            <span>Select Files</span>
          </label>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Selected Files ({files.length})</h2>
            <button
              onClick={uploadFiles}
              disabled={uploading}
              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            >
              {uploading ? "Uploading..." : "Upload All Files"}
            </button>
          </div>

          <div className="space-y-3">
            {files.map((fileItem) => (
              <div key={fileItem.id} className="flex items-center space-x-4 p-3 border border-slate-200 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{fileItem.file.name}</p>
                  <p className="text-sm text-slate-500">{(fileItem.file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>

                <div className="flex items-center space-x-4">
                  {fileItem.status === "uploading" && (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm text-slate-600">{fileItem.progress}%</span>
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    {fileItem.status === "completed" && <span className="text-green-600">✓</span>}
                    {fileItem.status === "error" && <span className="text-red-600">✗</span>}
                  </div>

                  <button onClick={() => removeFile(fileItem.id)} className="text-slate-400 hover:text-slate-600">
                    <span>×</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Results */}
      {uploadResults.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Upload Results</h2>
          <div className="space-y-3">
            {uploadResults.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  result.status === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex items-center space-x-2">
                  {result.status === "success" && <span className="text-green-600">✓</span>}
                  {result.status === "error" && <span className="text-red-600">✗</span>}
                  <span className="font-medium text-slate-900">{result.filename}</span>
                </div>

                {result.status === "success" && (
                  <div className="mt-2 text-sm text-green-700">
                    Paper uploaded successfully! {result.data.extractedCitations} citations and {result.data.extractedKeywords} keywords extracted.
                  </div>
                )}

                {result.status === "error" && <p className="mt-2 text-sm text-red-700">{result.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
