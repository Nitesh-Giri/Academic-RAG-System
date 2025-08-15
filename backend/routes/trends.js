import express from "express"
const router = express.Router()
import ResearchTrend from "../models/ResearchTrend.js"
import Paper from "../models/Paper.js"
import Citation from "../models/Citation.js"

// Get publication timeline data
router.get("/publication-timeline", async (req, res) => {
  try {
    const timeframe = req.query.timeframe || "year" // year, month, week
    const limit = Number.parseInt(req.query.limit) || 10

    // Get papers grouped by year
    const pipeline = [
      {
        $group: {
          _id: { $year: "$publishedDate" },
          count: { $sum: 1 },
          totalCitations: { $sum: "$citationCount" },
          averageImpact: { $avg: "$impactScore" }
        }
      },
      { $sort: { "_id": -1 } },
      { $limit: limit }
    ]

    const timelineData = await Paper.aggregate(pipeline)

    // Format the data for the frontend
    const formattedData = timelineData.map(item => ({
      year: item._id,
      papers: item.count,
      citations: item.totalCitations,
      averageImpact: Math.round(item.averageImpact * 100) / 100
    })).reverse() // Show oldest to newest

    res.json(formattedData)
  } catch (error) {
    console.error("Error fetching publication timeline:", error)
    res.status(500).json({ error: error.message })
  }
})

// Get research topics (alias for /topics)
router.get("/research-topics", async (req, res) => {
  try {
    const timeframe = req.query.timeframe || "year"
    const limit = Number.parseInt(req.query.limit) || 20

    // Generate topic data from actual papers in the database
    const papers = await Paper.find().limit(100)
    
    // Group papers by categories/keywords to create topic data
    const topicMap = {}
    
    papers.forEach(paper => {
      const categories = paper.categories || []
      const keywords = paper.keywords || []
      
      categories.forEach(category => {
        if (!topicMap[category]) {
          topicMap[category] = { papers: 0, citations: 0 }
        }
        topicMap[category].papers++
        topicMap[category].citations += paper.citationCount || 0
      })
      
      keywords.forEach(keyword => {
        if (!topicMap[keyword]) {
          topicMap[keyword] = { papers: 0, citations: 0 }
        }
        topicMap[keyword].papers++
        topicMap[keyword].citations += paper.citationCount || 0
      })
    })
    
    // Convert to array and sort by paper count
    const topics = Object.entries(topicMap)
      .map(([topic, data]) => ({
        topic,
        papers: data.papers,
        color: getRandomColor(topic)
      }))
      .sort((a, b) => b.papers - a.papers)
      .slice(0, limit)
    
    // Return empty array if no real data - let the frontend handle empty states

    res.json(topics)
  } catch (error) {
    console.error("Error fetching research topics:", error)
    res.status(500).json({ error: error.message })
  }
})

// Get top authors
router.get("/top-authors", async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit) || 20
    
    // Aggregate papers by authors to get author statistics
    const pipeline = [
      { $unwind: "$authors" },
      {
        $group: {
          _id: "$authors.name",
          papers: { $sum: 1 },
          citations: { $sum: "$citationCount" },
          totalImpact: { $sum: "$impactScore" },
          affiliations: { $addToSet: "$authors.affiliation" }
        }
      },
      {
        $project: {
          name: "$_id",
          papers: 1,
          citations: 1,
          hIndex: { $min: ["$papers", "$citations"] }, // Simple h-index approximation
          affiliation: { $arrayElemAt: ["$affiliations", 0] }
        }
      },
      { $sort: { citations: -1, papers: -1 } },
      { $limit: limit }
    ]
    
    const authors = await Paper.aggregate(pipeline)
    
    // Return empty array if no real data - let the frontend handle empty states

    res.json(authors)
  } catch (error) {
    console.error("Error fetching top authors:", error)
    res.status(500).json({ error: error.message })
  }
})

// Helper function to generate consistent colors for topics
function getRandomColor(topic) {
  const colors = ["#0ea5e9", "#d97706", "#059669", "#dc2626", "#7c3aed", "#ea580c", "#16a34a", "#dc2626"]
  const hash = topic.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0)
    return a & a
  }, 0)
  return colors[Math.abs(hash) % colors.length]
}

// Get trending research topics
router.get("/topics", async (req, res) => {
  try {
    const timeframe = req.query.timeframe || "year" // year, month, week
    const limit = Number.parseInt(req.query.limit) || 20

    const trends = await ResearchTrend.find()
      .sort({ growthRate: -1, averageImpact: -1 })
      .limit(limit)
      .populate("topPapers", "title authors publishedDate citationCount")

    res.json(trends)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get emerging research areas
router.get("/emerging", async (req, res) => {
  try {
    const minGrowthRate = Number.parseFloat(req.query.minGrowthRate) || 0.5
    const limit = Number.parseInt(req.query.limit) || 10

    const emergingTrends = await ResearchTrend.find({
      growthRate: { $gte: minGrowthRate },
      paperCount: { $gte: 10 }, // Minimum papers to be considered
    })
      .sort({ growthRate: -1 })
      .limit(limit)

    res.json(emergingTrends)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get research trend analysis for specific topic
router.get("/analysis/:topic", async (req, res) => {
  try {
    const topic = req.params.topic
    const trend = await ResearchTrend.findOne({ topic }).populate(
      "topPapers",
      "title authors publishedDate citationCount impactScore",
    )

    if (!trend) {
      return res.status(404).json({ error: "Trend not found" })
    }

    // Get additional analysis
    const analysis = await generateTrendAnalysis(topic)

    res.json({ trend, analysis })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Generate trend report
router.post("/report", async (req, res) => {
  try {
    const { categories, dateRange, includeEmergingAuthors = true } = req.body

    const report = await generateTrendReport({
      categories,
      dateRange,
      includeEmergingAuthors,
    })

    res.json(report)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update research trends (cron job)
router.post("/update", async (req, res) => {
  try {
    const papers = await Paper.find({})
    const citations = await Citation.find({})

    // Calculate trends
    const trends = {
      totalPapers: papers.length,
      totalCitations: citations.length,
      avgCitationsPerPaper: papers.length > 0 ? citations.length / papers.length : 0,
      topCategories: await getTopCategories(papers),
      citationTrends: await getCitationTrends(papers, citations),
    }

    // Save trends to database
    await ResearchTrend.findOneAndUpdate({}, trends, { upsert: true, new: true })

    res.json({ message: "Research trends updated successfully", trends })
  } catch (error) {
    console.error("Error updating research trends:", error)
    res.status(500).json({ error: error.message })
  }
})

// Helper functions
async function generateTrendAnalysis(topic) {
  const trend = await ResearchTrend.findOne({ topic })
  if (!trend) return null

  // Get papers related to this trend
  const papers = await Paper.find({
    $or: [{ keywords: { $in: trend.keywords } }, { categories: { $in: trend.categories } }],
  }).sort({ publishedDate: -1 })

  // Analyze temporal patterns
  const temporalAnalysis = analyzeTemporalPatterns(papers)

  // Identify key contributors
  const keyContributors = identifyKeyContributors(papers)

  // Find related trends
  const relatedTrends = await findRelatedTrends(trend)

  // Predict future trajectory
  const futurePrediction = predictTrendTrajectory(trend.timeSeriesData)

  return {
    temporalAnalysis,
    keyContributors,
    relatedTrends,
    futurePrediction,
    totalPapers: papers.length,
    averageCitationsPerPaper: papers.reduce((sum, p) => sum + p.citationCount, 0) / papers.length,
  }
}

function analyzeTemporalPatterns(papers) {
  const yearlyData = {}

  papers.forEach((paper) => {
    const year = new Date(paper.publishedDate).getFullYear()
    if (!yearlyData[year]) {
      yearlyData[year] = { count: 0, totalCitations: 0, totalImpact: 0 }
    }
    yearlyData[year].count++
    yearlyData[year].totalCitations += paper.citationCount
    yearlyData[year].totalImpact += paper.impactScore
  })

  // Calculate growth rates
  const years = Object.keys(yearlyData).sort()
  const growthRates = []

  for (let i = 1; i < years.length; i++) {
    const currentYear = years[i]
    const previousYear = years[i - 1]
    const growthRate = (yearlyData[currentYear].count - yearlyData[previousYear].count) / yearlyData[previousYear].count
    growthRates.push({ year: currentYear, growthRate })
  }

  return {
    yearlyData,
    growthRates,
    peakYear: years.reduce((peak, year) => (yearlyData[year].count > yearlyData[peak].count ? year : peak)),
  }
}

function identifyKeyContributors(papers) {
  const authorContributions = {}

  papers.forEach((paper) => {
    paper.authors.forEach((author) => {
      if (!authorContributions[author.name]) {
        authorContributions[author.name] = {
          name: author.name,
          affiliation: author.affiliation,
          paperCount: 0,
          totalCitations: 0,
          totalImpact: 0,
          papers: [],
        }
      }

      const contrib = authorContributions[author.name]
      contrib.paperCount++
      contrib.totalCitations += paper.citationCount
      contrib.totalImpact += paper.impactScore
      contrib.papers.push(paper._id)
    })
  })

  // Calculate h-index for each author
  Object.values(authorContributions).forEach((author) => {
    const citationCounts = author.papers
      .map((paperId) => papers.find((p) => p._id.equals(paperId))?.citationCount || 0)
      .sort((a, b) => b - a)

    author.hIndex = calculateHIndex(citationCounts)
  })

  return Object.values(authorContributions)
    .sort((a, b) => b.totalImpact - a.totalImpact)
    .slice(0, 20)
}

function calculateHIndex(citationCounts) {
  let hIndex = 0
  for (let i = 0; i < citationCounts.length; i++) {
    if (citationCounts[i] >= i + 1) {
      hIndex = i + 1
    } else {
      break
    }
  }
  return hIndex
}

async function findRelatedTrends(trend) {
  const relatedTrends = await ResearchTrend.find({
    _id: { $ne: trend._id },
    $or: [{ keywords: { $in: trend.keywords } }, { categories: { $in: trend.categories } }],
  }).limit(10)

  return relatedTrends.map((relatedTrend) => ({
    topic: relatedTrend.topic,
    similarity: calculateTrendSimilarity(trend, relatedTrend),
    growthRate: relatedTrend.growthRate,
  }))
}

function calculateTrendSimilarity(trend1, trend2) {
  const keywords1 = new Set(trend1.keywords)
  const keywords2 = new Set(trend2.keywords)
  const categories1 = new Set(trend1.categories)
  const categories2 = new Set(trend2.categories)

  const keywordIntersection = new Set([...keywords1].filter((k) => keywords2.has(k)))
  const categoryIntersection = new Set([...categories1].filter((c) => categories2.has(c)))

  const keywordSimilarity = keywordIntersection.size / Math.max(keywords1.size, keywords2.size)
  const categorySimilarity = categoryIntersection.size / Math.max(categories1.size, categories2.size)

  return Math.round((keywordSimilarity * 0.6 + categorySimilarity * 0.4) * 100) / 100
}

function predictTrendTrajectory(timeSeriesData) {
  if (timeSeriesData.length < 3) return { prediction: "insufficient_data" }

  // Simple linear regression for trend prediction
  const years = timeSeriesData.map((d) => d.year)
  const paperCounts = timeSeriesData.map((d) => d.paperCount)

  const n = years.length
  const sumX = years.reduce((a, b) => a + b, 0)
  const sumY = paperCounts.reduce((a, b) => a + b, 0)
  const sumXY = years.reduce((sum, x, i) => sum + x * paperCounts[i], 0)
  const sumXX = years.reduce((sum, x) => sum + x * x, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  const currentYear = new Date().getFullYear()
  const nextYearPrediction = slope * (currentYear + 1) + intercept
  const twoYearPrediction = slope * (currentYear + 2) + intercept

  return {
    slope,
    predictions: {
      [currentYear + 1]: Math.max(0, Math.round(nextYearPrediction)),
      [currentYear + 2]: Math.max(0, Math.round(twoYearPrediction)),
    },
    trajectory: slope > 0 ? "growing" : slope < 0 ? "declining" : "stable",
  }
}

async function generateTrendReport(options) {
  const { categories, dateRange, includeEmergingAuthors } = options

  const filter = {}
  if (categories && categories.length > 0) {
    filter.categories = { $in: categories }
  }

  const trends = await ResearchTrend.find(filter)
    .sort({ growthRate: -1 })
    .populate("topPapers", "title authors publishedDate")

  const report = {
    generatedAt: new Date(),
    totalTrends: trends.length,
    topGrowingTrends: trends.slice(0, 10),
    emergingTrends: trends.filter((t) => t.growthRate > 0.5),
    decliningTrends: trends.filter((t) => t.growthRate < -0.2),
    summary: {
      averageGrowthRate: trends.reduce((sum, t) => sum + t.growthRate, 0) / trends.length,
      totalPapers: trends.reduce((sum, t) => sum + t.paperCount, 0),
      totalCitations: trends.reduce((sum, t) => sum + t.citationCount, 0),
    },
  }

  if (includeEmergingAuthors) {
    report.emergingAuthors = await identifyEmergingAuthors(categories, dateRange)
  }

  return report
}

async function identifyEmergingAuthors(categories, dateRange) {
  const filter = {}
  if (categories && categories.length > 0) {
    filter.categories = { $in: categories }
  }
  if (dateRange) {
    filter.publishedDate = {
      $gte: new Date(dateRange.start),
      $lte: new Date(dateRange.end),
    }
  }

  const recentPapers = await Paper.find(filter).sort({ publishedDate: -1 }).limit(1000)

  const authorStats = {}
  recentPapers.forEach((paper) => {
    paper.authors.forEach((author) => {
      if (!authorStats[author.name]) {
        authorStats[author.name] = {
          name: author.name,
          affiliation: author.affiliation,
          recentPapers: 0,
          totalCitations: 0,
          averageImpact: 0,
        }
      }
      authorStats[author.name].recentPapers++
      authorStats[author.name].totalCitations += paper.citationCount
      authorStats[author.name].averageImpact += paper.impactScore
    })
  })

  return Object.values(authorStats)
    .map((author) => ({
      ...author,
      averageImpact: author.averageImpact / author.recentPapers,
    }))
    .filter((author) => author.recentPapers >= 3) // Minimum threshold
    .sort((a, b) => b.averageImpact - a.averageImpact)
    .slice(0, 50)
}

async function updateResearchTrends() {
  try {
    const papers = await Paper.find({})
    const citations = await Citation.find({})

    // Calculate trends
    const trends = {
      totalPapers: papers.length,
      totalCitations: citations.length,
      avgCitationsPerPaper: papers.length > 0 ? citations.length / papers.length : 0,
      topCategories: await getTopCategories(papers),
      citationTrends: await getCitationTrends(papers, citations),
    }

    // Save trends to database
    await ResearchTrend.findOneAndUpdate({}, trends, { upsert: true, new: true })

    return trends
  } catch (error) {
    console.error("Error updating research trends:", error)
    throw error
  }
}

export default router
