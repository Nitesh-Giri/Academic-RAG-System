import express from "express"
const router = express.Router()
import ragController from "../controllers/ragController.js"
import embeddingController from "../controllers/embeddingController.js"

// Main RAG query endpoint
router.post("/query", async (req, res) => {
  try {
    const { query, options = {} } = req.body

    if (!query) {
      return res.status(400).json({ error: "Query is required" })
    }

    const result = await ragController.processQuery(query, options)
    
    // Check if the result contains an error
    if (result.metadata && result.metadata.error) {
      console.error("RAG query error:", result.metadata.error)
      // Still return the result but with a warning
      return res.status(200).json({
        ...result,
        warning: "Query processed with some issues. See metadata for details."
      })
    }
    
    res.json(result)
  } catch (error) {
    console.error("Error in RAG query endpoint:", error)
    res.status(500).json({ 
      error: "Internal server error during RAG processing",
      details: error.message,
      query: req.body.query || "unknown"
    })
  }
})

// Advanced multi-strategy query
router.post("/advanced-query", async (req, res) => {
  try {
    const { query, strategies = ["semantic", "keyword", "citation"] } = req.body

    if (!query) {
      return res.status(400).json({ error: "Query is required" })
    }

    const result = await ragController.processAdvancedQuery(query, strategies)
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Semantic similarity search using MongoDB
router.post("/similarity", async (req, res) => {
  try {
    const { query, limit = 10, threshold = 0.7 } = req.body

    if (!query) {
      return res.status(400).json({ error: "Query is required" })
    }

    const queryEmbedding = await embeddingController.generateEmbedding(query)
    const results = await embeddingController.findSimilarPapers(queryEmbedding, limit, threshold)

    res.json(results)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Find similar papers to a given paper using MongoDB
router.get("/similar/:paperId", async (req, res) => {
  try {
    const { paperId } = req.params
    const { limit = 10, threshold = 0.8 } = req.query

    const Paper = (await import("../models/Paper.js")).default
    const paper = await Paper.findById(paperId)

    if (!paper || !paper.embedding || paper.embedding.length === 0) {
      return res.status(404).json({ error: "Paper not found or no embedding available" })
    }

    const similarPapers = await embeddingController.findSimilarPapers(
      paper.embedding,
      Number.parseInt(limit) + 1,
      Number.parseFloat(threshold),
    )

    // Remove the original paper from results
    const filteredResults = similarPapers
      .filter((item) => item.paper._id.toString() !== paperId)
      .slice(0, Number.parseInt(limit))

    res.json(filteredResults)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get vector database statistics
router.get("/stats", async (req, res) => {
  try {
    const Paper = (await import("../models/Paper.js")).default
    const Citation = (await import("../models/Citation.js")).default

    const totalPapers = await Paper.countDocuments()
    const papersWithEmbeddings = await Paper.countDocuments({
      embedding: { $exists: true, $ne: [] },
    })
    const totalCitations = await Citation.countDocuments()

    const stats = {
      totalPapers,
      papersWithEmbeddings,
      totalCitations,
      embeddingCoverage: totalPapers > 0 ? ((papersWithEmbeddings / totalPapers) * 100).toFixed(2) + "%" : "0%",
    }

    res.json(stats)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Initialize vector database
router.post("/initialize", async (req, res) => {
  try {
    res.json({ message: "MongoDB-based search is ready. No additional initialization required." })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Reindex all papers
router.post("/reindex", async (req, res) => {
  try {
    const Paper = (await import("../models/Paper.js")).default
    const papers = await Paper.find().limit(100) // Limit for performance

    const results = await embeddingController.batchAddPapers(papers)

    const successCount = results.filter((r) => r.success).length
    const failureCount = results.length - successCount

    res.json({
      message: `Reindexing completed: ${successCount} successful, ${failureCount} failed`,
      results: results,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
