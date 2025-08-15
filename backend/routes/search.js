import express from "express"
const router = express.Router()
import Paper from "../models/Paper.js"
import Citation from "../models/Citation.js"

// General search endpoint
router.post("/", async (req, res) => {
  try {
    const { query, type = "semantic", limit = 20 } = req.body

    let results
    if (type === "semantic") {
      results = await performSemanticSearch(query, limit)
    } else if (type === "advanced") {
      results = await performAdvancedSearch(query, limit)
    } else {
      // Default to semantic search
      results = await performSemanticSearch(query, limit)
    }

    res.json({
      results,
      query,
      type,
      total: results.length
    })
  } catch (error) {
    console.error("Error in /search endpoint:", error)
    res.status(500).json({ error: error.message })
  }
})

// Semantic search endpoint
router.post("/semantic", async (req, res) => {
  try {
    const { query, limit = 20, filters = {} } = req.body

    // This would integrate with vector database for semantic search
    // For now, implementing text-based search
    const searchResults = await performSemanticSearch(query, limit, filters)

    res.json(searchResults)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Advanced search with multiple criteria
router.post("/advanced", async (req, res) => {
  try {
    const {
      query,
      authors,
      dateRange,
      categories,
      minCitations,
      maxCitations,
      journals,
      sortBy = "relevance",
      limit = 20,
      page = 1,
    } = req.body

    const searchFilter = buildAdvancedSearchFilter({
      query,
      authors,
      dateRange,
      categories,
      minCitations,
      maxCitations,
      journals,
    })

    const skip = (page - 1) * limit
    const sortOptions = buildSortOptions(sortBy)

    const [papers, total] = await Promise.all([
      Paper.find(searchFilter).populate("authors", "name affiliation").sort(sortOptions).skip(skip).limit(limit),
      Paper.countDocuments(searchFilter),
    ])

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

// Search similar papers
router.get("/similar/:paperId", async (req, res) => {
  try {
    const paperId = req.params.paperId
    const limit = Number.parseInt(req.query.limit) || 10

    const similarPapers = await findSimilarPapers(paperId, limit)
    res.json(similarPapers)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Search by citation patterns
router.post("/citation-patterns", async (req, res) => {
  try {
    const { pattern, limit = 20 } = req.body

    const results = await searchByCitationPatterns(pattern, limit)
    res.json(results)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Helper functions
async function performSemanticSearch(query, limit, filters) {
  try {
    // First, let's check if there are any papers in the database
    const totalPapers = await Paper.countDocuments({})
    
    if (totalPapers === 0) {
      return []
    }
    
    // Improved search with multiple strategies
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2)
    
    // Strategy 1: Exact phrase search
    let searchFilter = {
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { abstract: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } },
        { keywords: { $in: queryTerms } }
      ],
      ...filters,
    }
    
    let papers = await Paper.find(searchFilter)
      .populate("authors", "name affiliation")
      .sort({ impactScore: -1, citationCount: -1 })
      .limit(limit)
    
    // Strategy 2: If no results, try individual term search
    if (papers.length === 0 && queryTerms.length > 1) {
      const termFilters = queryTerms.map(term => ({
        $or: [
          { title: { $regex: term, $options: 'i' } },
          { abstract: { $regex: term, $options: 'i' } },
          { content: { $regex: term, $options: 'i' } },
          { keywords: { $regex: term, $options: 'i' } }
        ]
      }))
      
      searchFilter = {
        $and: termFilters,
        ...filters,
      }
      
      papers = await Paper.find(searchFilter)
        .populate("authors", "name affiliation")
        .sort({ impactScore: -1, citationCount: -1 })
        .limit(limit)
    }
    
    // Strategy 3: If still no results, try broader search
    if (papers.length === 0) {
      const broaderTerms = queryTerms.filter(term => term.length > 3)
      if (broaderTerms.length > 0) {
        const broaderFilter = {
          $or: broaderTerms.map(term => ({
            $or: [
              { title: { $regex: term, $options: 'i' } },
              { abstract: { $regex: term, $options: 'i' } },
              { content: { $regex: term, $options: 'i' } }
            ]
          }))
        }
        
        papers = await Paper.find(broaderFilter)
          .populate("authors", "name affiliation")
          .sort({ impactScore: -1, citationCount: -1 })
          .limit(limit)
      }
    }
    
    // Strategy 4: Last resort - return all papers if query is very general
    if (papers.length === 0 && queryTerms.length <= 2) {
      papers = await Paper.find({})
        .populate("authors", "name affiliation")
        .sort({ impactScore: -1, citationCount: -1 })
        .limit(limit)
    }
    
    return papers.map((paper) => ({
      ...paper.toObject(),
      relevanceScore: calculateRelevanceScore(paper, query),
    }))
  } catch (error) {
    console.error("Error in performSemanticSearch:", error)
    return []
  }
}

function buildAdvancedSearchFilter(criteria) {
  const filter = {}

  if (criteria.query) {
    const queryRegex = new RegExp(criteria.query, "i")
    filter.$or = [{ title: queryRegex }, { abstract: queryRegex }, { content: queryRegex }]
  }

  if (criteria.authors && criteria.authors.length > 0) {
    filter["authors.name"] = { $in: criteria.authors.map((name) => new RegExp(name, "i")) }
  }

  if (criteria.dateRange) {
    filter.publishedDate = {}
    if (criteria.dateRange.start) {
      filter.publishedDate.$gte = new Date(criteria.dateRange.start)
    }
    if (criteria.dateRange.end) {
      filter.publishedDate.$lte = new Date(criteria.dateRange.end)
    }
  }

  if (criteria.categories && criteria.categories.length > 0) {
    filter.categories = { $in: criteria.categories }
  }

  if (criteria.minCitations !== undefined) {
    filter.citationCount = { ...filter.citationCount, $gte: criteria.minCitations }
  }

  if (criteria.maxCitations !== undefined) {
    filter.citationCount = { ...filter.citationCount, $lte: criteria.maxCitations }
  }

  if (criteria.journals && criteria.journals.length > 0) {
    filter["journal.name"] = { $in: criteria.journals.map((name) => new RegExp(name, "i")) }
  }

  return filter
}

function buildSortOptions(sortBy) {
  const sortOptions = {
    relevance: { impactScore: -1, citationCount: -1 },
    date: { publishedDate: -1 },
    citations: { citationCount: -1 },
    impact: { impactScore: -1 },
    title: { title: 1 },
  }

  return sortOptions[sortBy] || sortOptions.relevance
}

async function findSimilarPapers(paperId, limit) {
  const paper = await Paper.findById(paperId)
  if (!paper) throw new Error("Paper not found")

  // Find papers with similar keywords and categories
  const similarPapers = await Paper.find({
    _id: { $ne: paperId },
    $or: [{ keywords: { $in: paper.keywords } }, { categories: { $in: paper.categories } }],
  })
    .populate("authors", "name affiliation")
    .sort({ impactScore: -1 })
    .limit(limit)

  return similarPapers.map((similarPaper) => ({
    ...similarPaper.toObject(),
    similarity: calculateSimilarity(paper, similarPaper),
  }))
}

async function searchByCitationPatterns(pattern, limit) {
  // Search for papers based on citation patterns
  const { citationType, minStrength, sentiment } = pattern

  const citationFilter = {}
  if (citationType) citationFilter.citationType = citationType
  if (minStrength) citationFilter.strength = { $gte: minStrength }
  if (sentiment) citationFilter.sentiment = sentiment

  const citations = await Citation.find(citationFilter)
    .populate("citedPaper", "title authors publishedDate citationCount impactScore")
    .limit(limit)

  return citations.map((citation) => citation.citedPaper)
}

function calculateRelevanceScore(paper, query) {
  const queryTerms = query.toLowerCase().split(" ")
  const paperText = `${paper.title} ${paper.abstract}`.toLowerCase()

  let score = 0
  queryTerms.forEach((term) => {
    const termCount = (paperText.match(new RegExp(term, "g")) || []).length
    score += termCount
  })

  // Boost score based on paper metrics
  score += paper.citationCount * 0.01
  score += paper.impactScore * 0.1

  return Math.round(score * 100) / 100
}

function calculateSimilarity(paper1, paper2) {
  const keywords1 = new Set(paper1.keywords)
  const keywords2 = new Set(paper2.keywords)
  const categories1 = new Set(paper1.categories)
  const categories2 = new Set(paper2.categories)

  const keywordIntersection = new Set([...keywords1].filter((k) => keywords2.has(k)))
  const categoryIntersection = new Set([...categories1].filter((c) => categories2.has(c)))

  const keywordSimilarity = keywordIntersection.size / Math.max(keywords1.size, keywords2.size)
  const categorySimilarity = categoryIntersection.size / Math.max(categories1.size, categories2.size)

  return Math.round((keywordSimilarity * 0.7 + categorySimilarity * 0.3) * 100) / 100
}

export default router
