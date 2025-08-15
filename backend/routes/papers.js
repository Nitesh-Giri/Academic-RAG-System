import express from "express"
const router = express.Router()
import Paper from "../models/Paper.js"
import Citation from "../models/Citation.js"
import { extractCitations, calculateImpactScore } from "../utils/paperAnalysis.js"
import mongoose from "mongoose"
import paperController from "../controllers/paperController.js"

// Get all papers with pagination and filtering
router.get("/", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    const filter = {}
    if (req.query.category) filter.categories = req.query.category
    if (req.query.year) {
      const year = Number.parseInt(req.query.year)
      filter.publishedDate = {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1),
      }
    }

    const sortBy = req.query.sortBy || "publishedDate"
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1

    const papers = await Paper.find(filter)
      .populate("references", "title authors publishedDate")
      .populate("citedBy", "title authors publishedDate")
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)

    const total = await Paper.countDocuments(filter)

    res.json({
      papers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get paper statistics for dashboard
router.get("/stats", async (req, res) => {
  try {
    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database not connected" })
    }

    const [totalPapers, totalCitations, researchAreas, seminalWorks] = await Promise.all([
      Paper.countDocuments(),
      Citation.countDocuments(),
      Paper.distinct("categories").then(categories => categories.length),
      Paper.countDocuments({ isSeminal: true })
    ])

    res.json({
      totalPapers,
      totalCitations,
      researchAreas,
      seminalWorks
    })
  } catch (error) {
    console.error("Error in /stats endpoint:", error)
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// Get seminal papers
router.get("/seminal/list", async (req, res) => {
  try {
    const category = req.query.category
    const limit = Number.parseInt(req.query.limit) || 50

    const filter = { isSeminal: true }
    if (category) filter.categories = category

    const seminalPapers = await Paper.find(filter)
      .sort({ impactScore: -1, citationCount: -1 })
      .limit(limit)
      .populate("authors", "name affiliation")

    res.json(seminalPapers)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get paper by ID with full citation network
router.get("/:id", async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id)
      .populate("references", "title authors publishedDate citationCount impactScore")
      .populate("citedBy", "title authors publishedDate citationCount impactScore")

    if (!paper) {
      return res.status(404).json({ error: "Paper not found" })
    }

    // Get citation contexts
    const citations = await Citation.find({
      $or: [{ citingPaper: paper._id }, { citedPaper: paper._id }],
    }).populate("citingPaper citedPaper", "title authors")

    res.json({ paper, citations })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Add new paper
router.post("/", async (req, res) => {
  try {
    const paperData = req.body

    // Extract citations from content
    const extractedCitations = await extractCitations(paperData.content)

    const paper = new Paper({
      ...paperData,
      citationCount: 0,
      impactScore: 0,
    })

    await paper.save()

    // Process citations asynchronously
    if (extractedCitations.length > 0) {
      processCitations(paper._id, extractedCitations)
    }

    res.status(201).json(paper)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Update paper
router.put("/:id", async (req, res) => {
  try {
    const paper = await Paper.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true },
    )

    if (!paper) {
      return res.status(404).json({ error: "Paper not found" })
    }

    res.json(paper)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Delete paper
router.delete("/:id", async (req, res) => {
  try {
    const paper = await Paper.findByIdAndDelete(req.params.id)

    if (!paper) {
      return res.status(404).json({ error: "Paper not found" })
    }

    // Clean up citations
    await Citation.deleteMany({
      $or: [{ citingPaper: req.params.id }, { citedPaper: req.params.id }],
    })

    res.json({ message: "Paper deleted successfully" })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Manually update all research trends
router.post("/update-trends", async (req, res) => {
  try {
    const result = await paperController.updateAllResearchTrends()
    res.json(result)
  } catch (error) {
    console.error("Error updating research trends:", error)
    res.status(500).json({ 
      success: false, 
      error: "Failed to update research trends" 
    })
  }
})

// Get citation statistics
router.get("/citation-stats", async (req, res) => {
  try {
    const stats = await paperController.getCitationStats()
    res.json({ success: true, stats })
  } catch (error) {
    console.error("Error getting citation stats:", error)
    res.status(500).json({ 
      success: false, 
      error: "Failed to get citation statistics" 
    })
  }
})

async function processCitations(paperId, citations) {
  // This would be implemented to process extracted citations
  // and create Citation documents linking papers
}

export default router
