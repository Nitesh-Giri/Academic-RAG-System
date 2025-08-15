// Dynamic imports for CommonJS modules
let natural, compromise

async function loadDependencies() {
  if (!natural) natural = (await import("natural")).default
  if (!compromise) compromise = (await import("compromise")).default
}

// Extract citations from paper content
async function extractCitations(content) {
  await loadDependencies()
  const citations = []

  // Regular expressions for different citation formats
  const citationPatterns = [
    // APA style: (Author, Year) or (Author et al., Year)
    /\(([A-Za-z\s,&]+(?:et\s+al\.?)?),?\s*(\d{4}[a-z]?)\)/g,
    // IEEE style: [1], [2-5], [1,2,3]
    /\[(\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*)\]/g,
    // Nature style: Author et al.¹ or Author¹
    /([A-Za-z]+\s+(?:et\s+al\.?)?)[\s\u00B9-\u00B9\u2070-\u209F]+/g,
    // DOI references
    /(doi:\s*10\.\d+\/[^\s]+)/gi,
    // arXiv references
    /(arXiv:\d{4}\.\d{4,5})/gi,
    // Harvard style: Author (Year) - more specific pattern
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+et\s+al\.?)?)\s*\((\d{4}[a-z]?)\)/g,
    // Vancouver style: Author et al. [1]
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+et\s+al\.?)?)\s*\[(\d+)\]/g,
    // Simple year references: (2023), (2023a), (2023b)
    /\((\d{4}[a-z]?)\)/g,
    // Author names followed by year: Smith 2023, Johnson et al. 2023
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+et\s+al\.?)?)\s+(\d{4})/g,
    // References section: [1] Author, "Title", Journal, Year
    /\[(\d+)\]\s+([A-Za-z\s,&]+(?:et\s+al\.?)?),\s*"([^"]+)",\s*([^,]+),\s*(\d{4})/g
  ]

  citationPatterns.forEach((pattern, patternIndex) => {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const context = extractCitationContext(content, match.index)
      
      // Extract additional metadata based on pattern type
      let citationData = {
        text: match[0],
        context: context,
        position: match.index,
        type: determineCitationType(match[0]),
        authors: [],
        year: null,
        journal: null,
        doi: null
      }

      // Try to extract authors and year from different patterns
      if (patternIndex === 0) { // APA style: (Author, Year)
        if (match[1] && match[2]) {
          citationData.authors = match[1].split(',').map(a => a.trim())
          citationData.year = parseInt(match[2])
        }
      } else if (patternIndex === 5) { // Harvard style: Author (Year)
        if (match[1] && match[2]) {
          citationData.authors = match[1].split(',').map(a => a.trim())
          citationData.year = parseInt(match[2])
        }
      } else if (patternIndex === 6) { // Vancouver style: Author [Number]
        if (match[1]) {
          citationData.authors = match[1].split(',').map(a => a.trim())
        }
      } else if (patternIndex === 7) { // Year only: (2023)
        if (match[1]) {
          citationData.year = parseInt(match[1])
        }
      } else if (patternIndex === 8) { // Author-Year: Smith 2023
        if (match[1] && match[2]) {
          citationData.authors = match[1].split(',').map(a => a.trim())
          citationData.year = parseInt(match[2])
        }
      } else if (patternIndex === 9) { // References: [1] Author, "Title", Journal, Year
        if (match[1] && match[2] && match[3] && match[4] && match[5]) {
          citationData.authors = match[2].split(',').map(a => a.trim())
          citationData.journal = match[4].trim()
          citationData.year = parseInt(match[5])
        }
      }

      // Extract DOI if present
      const doiMatch = match[0].match(/doi:\s*(10\.\d+\/[^\s]+)/i)
      if (doiMatch) {
        citationData.doi = doiMatch[1]
      }

      // Extract arXiv ID if present
      const arxivMatch = match[0].match(/arXiv:(\d{4}\.\d{4,5})/i)
      if (arxivMatch) {
        citationData.arxivId = arxivMatch[1]
      }

      citations.push(citationData)
    }
  })

  // Remove duplicates based on text and position
  const uniqueCitations = []
  const seen = new Set()
  
  citations.forEach(citation => {
    const key = `${citation.text}-${citation.position}`
    if (!seen.has(key)) {
      seen.add(key)
      uniqueCitations.push(citation)
    }
  })

  console.log(`Extracted ${uniqueCitations.length} citations from paper content`)
  return uniqueCitations
}

// Extract context around citation
function extractCitationContext(content, position, contextLength = 200) {
  const start = Math.max(0, position - contextLength)
  const end = Math.min(content.length, position + contextLength)
  return content.substring(start, end).trim()
}

// Determine citation type based on pattern
function determineCitationType(citationText) {
  if (citationText.includes("doi:")) return "doi"
  if (citationText.includes("arXiv:")) return "arxiv"
  if (/\[\d+\]/.test(citationText)) return "ieee"
  if (/\([^)]+,\s*\d{4}\)/.test(citationText)) return "apa"
  if (/[A-Za-z]+\s+\(\d{4}\)/.test(citationText)) return "harvard"
  if (/[A-Za-z]+\s+\[\d+\]/.test(citationText)) return "vancouver"
  if (/\(\d{4}[a-z]?\)/.test(citationText)) return "year_only"
  if (/[A-Za-z]+\s+\d{4}/.test(citationText)) return "author_year"
  // Default to "direct" instead of "unknown"
  return "direct"
}

// Calculate impact score based on various metrics
function calculateImpactScore(paper) {
  const { citationCount = 0, publishedDate, references = [], citedBy = [], journal = {} } = paper

  // Age factor (newer papers get slight boost)
  const currentYear = new Date().getFullYear()
  const paperYear = new Date(publishedDate).getFullYear()
  const ageFactor = Math.max(0.1, 1 - (currentYear - paperYear) * 0.05)

  // Citation velocity (citations per year)
  const yearsPublished = Math.max(1, currentYear - paperYear)
  const citationVelocity = citationCount / yearsPublished

  // Reference quality (impact of cited papers)
  const avgReferenceCitations =
    references.length > 0 ? references.reduce((sum, ref) => sum + (ref.citationCount || 0), 0) / references.length : 0

  // Journal impact factor (simplified)
  const journalFactor = getJournalImpactFactor(journal.name)

  // Calculate composite score
  const impactScore =
    citationVelocity * 0.4 + citationCount * 0.3 + avgReferenceCitations * 0.1 + journalFactor * 0.1 + ageFactor * 0.1

  return Math.round(impactScore * 100) / 100
}

// Simplified journal impact factor lookup
function getJournalImpactFactor(journalName) {
  const impactFactors = {
    nature: 10.0,
    science: 9.5,
    cell: 9.0,
    pnas: 8.0,
    "nature communications": 7.5,
    "plos one": 3.0,
    arxiv: 2.0,
  }

  if (!journalName) return 1.0

  const normalizedName = journalName.toLowerCase()
  return impactFactors[normalizedName] || 2.5
}

// Identify seminal papers based on citation patterns
function identifySeminalPapers(papers) {
  const seminalThreshold = {
    minCitations: 100,
    minImpactScore: 50,
    minAge: 2, // years
  }

  return papers.filter((paper) => {
    const age = new Date().getFullYear() - new Date(paper.publishedDate).getFullYear()

    return (
      paper.citationCount >= seminalThreshold.minCitations &&
      paper.impactScore >= seminalThreshold.minImpactScore &&
      age >= seminalThreshold.minAge
    )
  })
}

// Extract keywords from paper content
async function extractKeywords(title, abstract, content) {
  try {
    await loadDependencies()
    const text = `${title} ${abstract} ${content}`.toLowerCase()

    // Use natural language processing to extract key terms
    let tokens
    try {
      tokens = new natural.WordTokenizer().tokenize(text)
    } catch (error) {
      console.warn("WordTokenizer failed, using fallback:", error.message)
      // Fallback: simple word splitting
      tokens = text.split(/\s+/)
    }

    const filteredTokens = tokens.filter(
      (token) => token.length > 3 && !natural.stopwords.includes(token) && /^[a-zA-Z]+$/.test(token),
    )

    // Calculate TF-IDF scores (simplified)
    const termFreq = {}
    filteredTokens.forEach((token) => {
      termFreq[token] = (termFreq[token] || 0) + 1
    })

    // Get top keywords
    const keywords = Object.entries(termFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([term]) => term)

    return keywords
  } catch (error) {
    console.error("Error extracting keywords:", error)
    // Return basic keywords as fallback
    const text = `${title} ${abstract} ${content}`.toLowerCase()
    const words = text.split(/\s+/).filter(word => word.length > 3 && /^[a-zA-Z]+$/.test(word))
    return words.slice(0, 10)
  }
}

// Analyze citation sentiment
async function analyzeCitationSentiment(context) {
  try {
    await loadDependencies()
    
    let analyzer
    try {
      analyzer = new natural.SentimentAnalyzer("English", natural.PorterStemmer, ["negation"])
    } catch (error) {
      console.warn("SentimentAnalyzer failed, using fallback:", error.message)
      // Return neutral sentiment as fallback
      return "neutral"
    }

    let tokens
    try {
      tokens = new natural.WordTokenizer().tokenize(context.toLowerCase())
    } catch (error) {
      console.warn("WordTokenizer failed in sentiment analysis, using fallback:", error.message)
      tokens = context.toLowerCase().split(/\s+/)
    }

    const stemmedTokens = tokens.map((token) => {
      try {
        return natural.PorterStemmer.stem(token)
      } catch (error) {
        return token // Return original token if stemming fails
      }
    })

    const score = analyzer.getSentiment(stemmedTokens)

    if (score > 0.1) return "positive"
    if (score < -0.1) return "negative"
    return "neutral"
  } catch (error) {
    console.error("Error analyzing citation sentiment:", error)
    return "neutral" // Default to neutral sentiment
  }
}

export {
  extractCitations,
  calculateImpactScore,
  identifySeminalPapers,
  extractKeywords,
  analyzeCitationSentiment,
  extractCitationContext,
  determineCitationType,
}
