import express from "express"
import multer from "multer"
const router = express.Router()
import paperController from "../controllers/paperController.js"

// Configure multer for file uploads
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [".pdf", ".txt", ".doc", ".docx"]
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf("."))

    if (allowedTypes.includes(fileExtension)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${fileExtension}`), false)
    }
  },
})

// General upload endpoint (defaults to single file)
router.post("/", upload.single("paper"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {}

    const result = await paperController.processPaper(req.file.buffer, req.file.originalname, metadata)

    res.json({
      message: "Paper processed successfully",
      ...result,
    })
  } catch (error) {
    console.error("Error in /upload endpoint:", error)
    
    // Provide more specific error messages
    let errorMessage = error.message
    if (error.message.includes("PDF extraction failed")) {
      errorMessage = "Failed to extract text from PDF. The file might be corrupted or password-protected."
    } else if (error.message.includes("Paper processing failed")) {
      errorMessage = "Failed to process the paper. Please check if the file contains readable text."
    } else if (error.message.includes("Failed to extract text content")) {
      errorMessage = "Could not extract text content from the file. Please ensure the file contains readable text."
    }
    
    res.status(500).json({ 
      error: errorMessage,
      filename: req.file?.originalname || "unknown",
      fileSize: req.file?.size || 0,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// Multiple file upload
router.post("/batch", upload.array("papers", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" })
    }

    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : []

    const results = await paperController.batchProcess(req.files, metadata)

    const successCount = results.filter((r) => r.success).length
    const failureCount = results.length - successCount

    res.json({
      message: `Processed ${results.length} files: ${successCount} successful, ${failureCount} failed`,
      results: results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Upload from URL
router.post("/url", async (req, res) => {
  try {
    const { url, metadata = {} } = req.body

    if (!url) {
      return res.status(400).json({ error: "URL is required" })
    }

    // Download file from URL
    const axios = (await import("axios")).default
    const response = await axios.get(url, { responseType: "arraybuffer" })

    const filename = url.split("/").pop() || "paper.pdf"
    const buffer = Buffer.from(response.data)

    const result = await paperController.processPaper(buffer, filename, metadata)

    res.json({
      message: "Paper from URL processed successfully",
      url: url,
      ...result,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get processing status
router.get("/status/:paperId", async (req, res) => {
  try {
    const Paper = (await import("../models/Paper.js")).default
    const Citation = (await import("../models/Citation.js")).default

    const paper = await Paper.findById(req.params.paperId)
    if (!paper) {
      return res.status(404).json({ error: "Paper not found" })
    }

    const citationCount = await Citation.countDocuments({
      $or: [{ citingPaper: req.params.paperId }, { citedPaper: req.params.paperId }],
    })

    res.json({
      paper: {
        id: paper._id,
        title: paper.title,
        status: "processed",
        createdAt: paper.createdAt,
        updatedAt: paper.updatedAt,
      },
      processing: {
        citationsExtracted: paper.references.length,
        citationsLinked: citationCount,
        keywordsExtracted: paper.keywords.length,
        impactScore: paper.impactScore,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large. Maximum size is 50MB." })
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ error: "Too many files. Maximum is 10 files per batch." })
    }
  }
  res.status(500).json({ error: error.message })
})

export default router
