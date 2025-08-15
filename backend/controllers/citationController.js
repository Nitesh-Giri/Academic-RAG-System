// Dynamic imports for CommonJS modules
let natural

async function loadDependencies() {
  if (!natural) natural = (await import("natural")).default
}

import Paper from "../models/Paper.js"

class CitationMatcher {
  constructor() {
    this.similarityThreshold = 0.7
    this.titleWeight = 0.6
    this.authorWeight = 0.3
    this.yearWeight = 0.1
  }

  // Advanced citation matching using multiple strategies
  async matchCitation(citationText, context = "") {
    const strategies = [
      this.matchByDOI.bind(this),
      this.matchByArxivId.bind(this),
      this.matchByTitleSimilarity.bind(this),
      this.matchByAuthorYear.bind(this),
      this.matchByFuzzySearch.bind(this),
    ]

    for (const strategy of strategies) {
      const match = await strategy(citationText, context)
      if (match) {
        return match
      }
    }

    return null
  }

  // Match by DOI
  async matchByDOI(citationText) {
    const doiPattern = /10\.\d+\/[^\s,)]+/
    const doiMatch = citationText.match(doiPattern)

    if (doiMatch) {
      const doi = doiMatch[0]
      const paper = await Paper.findOne({ doi: doi })
      if (paper) {
        return { paper, confidence: 1.0, method: "doi" }
      }
    }

    return null
  }

  // Match by arXiv ID
  async matchByArxivId(citationText) {
    const arxivPattern = /\d{4}\.\d{4,5}/
    const arxivMatch = citationText.match(arxivPattern)

    if (arxivMatch) {
      const arxivId = arxivMatch[0]
      const paper = await Paper.findOne({ arxivId: arxivId })
      if (paper) {
        return { paper, confidence: 1.0, method: "arxiv" }
      }
    }

    return null
  }

  // Match by title similarity
  async matchByTitleSimilarity(citationText) {
    await loadDependencies()
    // Extract potential title from citation
    const title = this.extractTitleFromCitation(citationText)
    if (!title || title.length < 10) return null

    // Search for papers with similar titles
    const titleRegex = new RegExp(title.split(/\s+/).slice(0, 5).join("|"), "i")
    const candidates = await Paper.find({ title: titleRegex }).limit(20)

    let bestMatch = null
    let bestSimilarity = 0

    for (const candidate of candidates) {
      const similarity = await this.calculateStringSimilarity(title, candidate.title)
      if (similarity > bestSimilarity && similarity > this.similarityThreshold) {
        bestSimilarity = similarity
        bestMatch = { paper: candidate, confidence: similarity, method: "title" }
      }
    }

    return bestMatch
  }

  // Match by author and year
  async matchByAuthorYear(citationText) {
    const authorYear = this.extractAuthorYear(citationText)
    if (!authorYear.author || !authorYear.year) return null

    const yearNum = Number.parseInt(authorYear.year)
    const candidates = await Paper.find({
      "authors.name": new RegExp(authorYear.author, "i"),
      publishedDate: {
        $gte: new Date(yearNum, 0, 1),
        $lt: new Date(yearNum + 1, 0, 1),
      },
    }).limit(10)

    if (candidates.length === 1) {
      return { paper: candidates[0], confidence: 0.8, method: "author-year" }
    }

    return null
  }

  // Fuzzy search matching
  async matchByFuzzySearch(citationText) {
    const searchTerms = this.extractSearchTerms(citationText)
    if (searchTerms.length === 0) return null

    const searchRegex = new RegExp(searchTerms.join("|"), "i")
    const candidates = await Paper.find({
      $or: [{ title: searchRegex }, { abstract: searchRegex }],
    }).limit(10)

    let bestMatch = null
    let bestScore = 0

    for (const candidate of candidates) {
      const score = this.calculateFuzzyScore(citationText, candidate)
      if (score > bestScore && score > 0.6) {
        bestScore = score
        bestMatch = { paper: candidate, confidence: score, method: "fuzzy" }
      }
    }

    return bestMatch
  }

  // Extract title from citation text
  extractTitleFromCitation(citationText) {
    // Common citation formats
    const patterns = [
      // "Title." Author, Year
      /^([^.]+)\./,
      // Author. "Title." Journal
      /"([^"]+)"/,
      // Author (Year). Title. Journal
      /$$\d{4}$$\.\s*([^.]+)\./,
    ]

    for (const pattern of patterns) {
      const match = citationText.match(pattern)
      if (match) {
        return match[1].trim()
      }
    }

    // Fallback: first part before comma or period
    const firstPart = citationText.split(/[,.]/)[0]
    if (firstPart.length > 10 && firstPart.length < 200) {
      return firstPart.trim()
    }

    return null
  }

  // Extract author and year from citation
  extractAuthorYear(citationText) {
    const patterns = [
      // Smith et al. (2020)
      /([A-Z][a-z]+)(?:\s+et\s+al\.?)?\s*$$(\d{4})$$/,
      // Smith, J. (2020)
      /([A-Z][a-z]+),?\s*[A-Z]\.?\s*$$(\d{4})$$/,
      // Smith 2020
      /([A-Z][a-z]+)\s+(\d{4})/,
    ]

    for (const pattern of patterns) {
      const match = citationText.match(pattern)
      if (match) {
        return { author: match[1], year: match[2] }
      }
    }

    return { author: null, year: null }
  }

  // Extract search terms from citation
  async extractSearchTerms(citationText) {
    await loadDependencies()
    const tokens = natural.WordTokenizer().tokenize(citationText.toLowerCase())
    return tokens
      .filter((token) => token.length > 3 && !natural.stopwords.includes(token) && /^[a-zA-Z]+$/.test(token))
      .slice(0, 10)
  }

  // Calculate string similarity using Jaro-Winkler
  async calculateStringSimilarity(str1, str2) {
    await loadDependencies()
    return natural.JaroWinklerDistance(str1.toLowerCase(), str2.toLowerCase())
  }

  // Calculate fuzzy matching score
  async calculateFuzzyScore(citationText, paper) {
    await loadDependencies()
    const citationTokens = new Set(await this.extractSearchTerms(citationText))
    const titleTokens = new Set(await this.extractSearchTerms(paper.title))
    const abstractTokens = new Set(await this.extractSearchTerms(paper.abstract || ""))

    // Calculate overlap
    const titleOverlap = this.calculateSetOverlap(citationTokens, titleTokens)
    const abstractOverlap = this.calculateSetOverlap(citationTokens, abstractTokens)

    // Weighted score
    return titleOverlap * 0.7 + abstractOverlap * 0.3
  }

  // Calculate set overlap (Jaccard similarity)
  calculateSetOverlap(set1, set2) {
    const intersection = new Set([...set1].filter((x) => set2.has(x)))
    const union = new Set([...set1, ...set2])
    return union.size > 0 ? intersection.size / union.size : 0
  }

  // Batch match citations
  async batchMatchCitations(citations) {
    const results = []

    for (const citation of citations) {
      try {
        const match = await this.matchCitation(citation.text, citation.context)
        results.push({
          citation: citation,
          match: match,
          matched: !!match,
        })
      } catch (error) {
        results.push({
          citation: citation,
          match: null,
          matched: false,
          error: error.message,
        })
      }
    }

    return results
  }
}

export default new CitationMatcher()
