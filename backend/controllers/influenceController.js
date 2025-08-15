import Paper from "../models/Paper.js"
import Citation from "../models/Citation.js"

class InfluenceScoring {
  constructor() {
    this.scoringWeights = {
      citationCount: 0.3,
      citationVelocity: 0.2,
      authorReputation: 0.15,
      journalImpact: 0.1,
      recency: 0.1,
      networkCentrality: 0.15,
    }
  }

  // Calculate comprehensive influence score
  async calculateInfluenceScore(paperId) {
    try {
      const paper = await Paper.findById(paperId).populate("authors", "name affiliation")
      if (!paper) {
        throw new Error("Paper not found")
      }

      const scores = {
        citationCount: this.scoreCitationCount(paper),
        citationVelocity: await this.scoreCitationVelocity(paper),
        authorReputation: await this.scoreAuthorReputation(paper),
        journalImpact: this.scoreJournalImpact(paper),
        recency: this.scoreRecency(paper),
        networkCentrality: await this.scoreNetworkCentrality(paperId),
      }

      // Calculate weighted total
      const totalScore = Object.entries(scores).reduce((total, [metric, score]) => {
        return total + score * this.scoringWeights[metric]
      }, 0)

      return {
        paperId: paperId,
        totalScore: Math.round(totalScore * 100) / 100,
        componentScores: scores,
        weights: this.scoringWeights,
        calculatedAt: new Date(),
      }
    } catch (error) {
      console.error("Error calculating influence score:", error)
      throw error
    }
  }

  // Score based on citation count
  scoreCitationCount(paper) {
    // Logarithmic scaling to prevent extreme values
    return Math.log10(paper.citationCount + 1) * 10
  }

  // Score based on citation velocity (citations per year)
  async scoreCitationVelocity(paper) {
    const currentYear = new Date().getFullYear()
    const paperYear = paper.publishedDate.getFullYear()
    const yearsPublished = Math.max(1, currentYear - paperYear)

    const velocity = paper.citationCount / yearsPublished

    // Score based on velocity with diminishing returns
    return Math.min(velocity * 2, 100)
  }

  // Score based on author reputation
  async scoreAuthorReputation(paper) {
    if (!paper.authors || paper.authors.length === 0) {
      return 0
    }

    const authorScores = []

    for (const author of paper.authors) {
      // Get author's other papers
      const authorPapers = await Paper.find({
        "authors.name": author.name,
        _id: { $ne: paper._id },
      })

      if (authorPapers.length === 0) {
        authorScores.push(0)
        continue
      }

      // Calculate h-index
      const citationCounts = authorPapers.map((p) => p.citationCount).sort((a, b) => b - a)
      const hIndex = this.calculateHIndex(citationCounts)

      // Calculate average impact
      const avgImpact = authorPapers.reduce((sum, p) => sum + p.impactScore, 0) / authorPapers.length

      const authorScore = hIndex * 2 + avgImpact * 0.5
      authorScores.push(authorScore)
    }

    // Return average author score
    return authorScores.reduce((sum, score) => sum + score, 0) / authorScores.length
  }

  // Score based on journal impact
  scoreJournalImpact(paper) {
    if (!paper.journal || !paper.journal.name) {
      return 5 // Default score for unknown journals
    }

    // Simplified journal impact factors
    const journalImpacts = {
      nature: 50,
      science: 45,
      cell: 40,
      pnas: 35,
      "nature communications": 30,
      "plos one": 15,
      arxiv: 10,
    }

    const journalName = paper.journal.name.toLowerCase()
    return journalImpacts[journalName] || 10
  }

  // Score based on recency (newer papers get slight boost)
  scoreRecency(paper) {
    const currentYear = new Date().getFullYear()
    const paperYear = paper.publishedDate.getFullYear()
    const age = currentYear - paperYear

    // Recency bonus decreases with age
    if (age <= 1) return 20
    if (age <= 3) return 15
    if (age <= 5) return 10
    if (age <= 10) return 5
    return 0
  }

  // Score based on network centrality
  async scoreNetworkCentrality(paperId) {
    try {
      // Get citation network position
      const incomingCitations = await Citation.countDocuments({ citedPaper: paperId })
      const outgoingCitations = await Citation.countDocuments({ citingPaper: paperId })

      // Simple centrality measure
      const centralityScore = Math.log10(incomingCitations + 1) * 5 + Math.log10(outgoingCitations + 1) * 2

      return Math.min(centralityScore, 50)
    } catch (error) {
      console.error("Error calculating network centrality:", error)
      return 0
    }
  }

  // Calculate h-index
  calculateHIndex(citationCounts) {
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

  // Batch calculate influence scores
  async batchCalculateInfluenceScores(paperIds) {
    const results = []

    for (const paperId of paperIds) {
      try {
        const score = await this.calculateInfluenceScore(paperId)
        results.push(score)

        // Update paper in database
        await Paper.findByIdAndUpdate(paperId, {
          impactScore: score.totalScore,
          updatedAt: new Date(),
        })
      } catch (error) {
        results.push({
          paperId: paperId,
          error: error.message,
        })
      }
    }

    return results
  }

  // Get influence rankings
  async getInfluenceRankings(options = {}) {
    const { category = null, limit = 100, minCitations = 10 } = options

    const filter = { citationCount: { $gte: minCitations } }
    if (category) {
      filter.categories = category
    }

    const papers = await Paper.find(filter)
      .populate("authors", "name affiliation")
      .sort({ impactScore: -1 })
      .limit(limit)

    return papers.map((paper, index) => ({
      rank: index + 1,
      paper: {
        id: paper._id,
        title: paper.title,
        authors: paper.authors,
        publishedDate: paper.publishedDate,
        citationCount: paper.citationCount,
        impactScore: paper.impactScore,
        categories: paper.categories,
      },
    }))
  }

  // Compare influence scores
  async compareInfluenceScores(paperIds) {
    const scores = []

    for (const paperId of paperIds) {
      try {
        const score = await this.calculateInfluenceScore(paperId)
        scores.push(score)
      } catch (error) {
        scores.push({
          paperId: paperId,
          error: error.message,
        })
      }
    }

    // Sort by total score
    scores.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))

    return {
      comparison: scores,
      summary: {
        highest: scores[0],
        lowest: scores[scores.length - 1],
        average: scores.reduce((sum, s) => sum + (s.totalScore || 0), 0) / scores.length,
      },
    }
  }

  // Update scoring weights
  updateScoringWeights(newWeights) {
    this.scoringWeights = { ...this.scoringWeights, ...newWeights }

    // Ensure weights sum to 1
    const totalWeight = Object.values(this.scoringWeights).reduce((sum, weight) => sum + weight, 0)
    if (Math.abs(totalWeight - 1) > 0.01) {
      console.warn(`Warning: Scoring weights sum to ${totalWeight}, not 1.0`)
    }

    return this.scoringWeights
  }
}

export default new InfluenceScoring()
