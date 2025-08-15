import express from "express"
const router = express.Router()
import Citation from "../models/Citation.js"
import Paper from "../models/Paper.js"
import { analyzeCitationSentiment } from "../utils/paperAnalysis.js"

// Get citation network for a paper
router.get("/network/:paperId", async (req, res) => {
  try {
    const paperId = req.params.paperId
    const depth = Number.parseInt(req.query.depth) || 2

    const network = await buildCitationNetwork(paperId, depth)
    res.json(network)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get citations between two papers
router.get("/between/:paper1/:paper2", async (req, res) => {
  try {
    const { paper1, paper2 } = req.params

    const citations = await Citation.find({
      $or: [
        { citingPaper: paper1, citedPaper: paper2 },
        { citingPaper: paper2, citedPaper: paper1 },
      ],
    }).populate("citingPaper citedPaper", "title authors publishedDate")

    res.json(citations)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Add citation relationship
router.post("/", async (req, res) => {
  try {
    const { citingPaper, citedPaper, context, section } = req.body

    // Analyze citation sentiment
    const sentiment = await analyzeCitationSentiment(context)

    const citation = new Citation({
      citingPaper,
      citedPaper,
      context,
      section,
      sentiment,
      citationType: determineCitationType(context),
      strength: calculateCitationStrength(context),
    })

    await citation.save()

    // Update citation counts
    await updateCitationCounts(citingPaper, citedPaper)

    res.status(201).json(citation)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Get citation analysis for a paper
router.get("/analysis/:paperId", async (req, res) => {
  try {
    const paperId = req.params.paperId

    const [incomingCitations, outgoingCitations] = await Promise.all([
      Citation.find({ citedPaper: paperId }).populate("citingPaper", "title authors publishedDate categories"),
      Citation.find({ citingPaper: paperId }).populate("citedPaper", "title authors publishedDate categories"),
    ])

    const analysis = {
      incomingCount: incomingCitations.length,
      outgoingCount: outgoingCitations.length,
      sentimentDistribution: calculateSentimentDistribution(incomingCitations),
      citationTypes: calculateCitationTypes(incomingCitations),
      temporalPattern: calculateTemporalPattern(incomingCitations),
      topCitingFields: getTopCitingFields(incomingCitations),
      citationVelocity: calculateCitationVelocity(incomingCitations),
    }

    res.json(analysis)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Helper functions
async function buildCitationNetwork(paperId, depth, visited = new Set()) {
  if (depth <= 0 || visited.has(paperId)) {
    return { nodes: [], edges: [] }
  }

  visited.add(paperId)

  const paper = await Paper.findById(paperId).select("title authors publishedDate citationCount")
  if (!paper) return { nodes: [], edges: [] }

  const nodes = [{ id: paperId, ...paper.toObject() }]
  const edges = []

  // Get direct citations
  const citations = await Citation.find({
    $or: [{ citingPaper: paperId }, { citedPaper: paperId }],
  }).populate("citingPaper citedPaper", "title authors publishedDate citationCount")

  for (const citation of citations) {
    const relatedPaper = citation.citingPaper._id.toString() === paperId ? citation.citedPaper : citation.citingPaper

    if (!visited.has(relatedPaper._id.toString())) {
      const subNetwork = await buildCitationNetwork(relatedPaper._id.toString(), depth - 1, visited)
      nodes.push(...subNetwork.nodes)
      edges.push(...subNetwork.edges)
    }

    edges.push({
      source: citation.citingPaper._id,
      target: citation.citedPaper._id,
      type: citation.citationType,
      sentiment: citation.sentiment,
      strength: citation.strength,
    })
  }

  return { nodes, edges }
}

function determineCitationType(context) {
  const lowerContext = context.toLowerCase()

  if (lowerContext.includes("method") || lowerContext.includes("approach")) {
    return "methodological"
  }
  if (lowerContext.includes("however") || lowerContext.includes("contrary")) {
    return "contradictory"
  }
  if (lowerContext.includes("support") || lowerContext.includes("confirm")) {
    return "supportive"
  }

  return "direct"
}

function calculateCitationStrength(context) {
  const strengthIndicators = {
    high: ["fundamental", "seminal", "groundbreaking", "pioneering"],
    medium: ["important", "significant", "notable", "relevant"],
    low: ["mentioned", "noted", "referenced"],
  }

  const lowerContext = context.toLowerCase()

  for (const indicator of strengthIndicators.high) {
    if (lowerContext.includes(indicator)) return 0.9
  }
  for (const indicator of strengthIndicators.medium) {
    if (lowerContext.includes(indicator)) return 0.6
  }
  for (const indicator of strengthIndicators.low) {
    if (lowerContext.includes(indicator)) return 0.3
  }

  return 0.5 // default
}

async function updateCitationCounts(citingPaperId, citedPaperId) {
  await Paper.findByIdAndUpdate(citedPaperId, {
    $inc: { citationCount: 1 },
  })
}

function calculateSentimentDistribution(citations) {
  const distribution = { positive: 0, negative: 0, neutral: 0 }
  citations.forEach((citation) => {
    distribution[citation.sentiment]++
  })
  return distribution
}

function calculateCitationTypes(citations) {
  const types = {}
  citations.forEach((citation) => {
    types[citation.citationType] = (types[citation.citationType] || 0) + 1
  })
  return types
}

function calculateTemporalPattern(citations) {
  const yearCounts = {}
  citations.forEach((citation) => {
    const year = new Date(citation.citingPaper.publishedDate).getFullYear()
    yearCounts[year] = (yearCounts[year] || 0) + 1
  })
  return yearCounts
}

function getTopCitingFields(citations) {
  const fieldCounts = {}
  citations.forEach((citation) => {
    citation.citingPaper.categories?.forEach((category) => {
      fieldCounts[category] = (fieldCounts[category] || 0) + 1
    })
  })

  return Object.entries(fieldCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([field, count]) => ({ field, count }))
}

function calculateCitationVelocity(citations) {
  if (citations.length === 0) return 0

  const sortedCitations = citations.sort(
    (a, b) => new Date(a.citingPaper.publishedDate) - new Date(b.citingPaper.publishedDate),
  )

  const firstCitation = new Date(sortedCitations[0].citingPaper.publishedDate)
  const lastCitation = new Date(sortedCitations[sortedCitations.length - 1].citingPaper.publishedDate)
  const timeSpan = (lastCitation - firstCitation) / (1000 * 60 * 60 * 24 * 365) // years

  return timeSpan > 0 ? citations.length / timeSpan : citations.length
}

export default router
