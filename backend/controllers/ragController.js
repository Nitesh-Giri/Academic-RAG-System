import embeddingController from "./embeddingController.js"
import Paper from "../models/Paper.js"
import Citation from "../models/Citation.js"

class RAGController {
  constructor() {
    this.maxContextLength = 4000
    this.defaultTopK = 5
    this.similarityThreshold = 0.7
  }

  // Main RAG query processing
  async processQuery(query, options = {}) {
    const {
      topK = this.defaultTopK,
      includeChunks = true,
      includeCitations = true,
      contextLength = this.maxContextLength,
      filters = {},
    } = options

    try {
      // Step 1: Retrieve relevant documents using MongoDB-based search
      const retrievalResults = await this.retrieveRelevantDocuments(query, {
        topK,
        includeChunks,
        includeCitations,
        filters,
      })

      // Check if we found any relevant documents
      if (!retrievalResults.papers || retrievalResults.papers.length === 0) {
        return {
          query: query,
          response: "I couldn't find any relevant papers in the database for your query. This could be because:\n\n1. No papers have been uploaded yet\n2. The search terms don't match any available content\n3. The papers don't have the information you're looking for\n\nTry:\n- Using different search terms\n- Uploading more research papers\n- Checking if the papers contain the information you need",
          context: { parts: [], totalLength: 0, sources: 0 },
          sources: { papers: [], chunks: [], citations: [] },
          metadata: {
            totalSources: 0,
            avgSimilarity: 0,
            processingTime: Date.now(),
            message: "No relevant papers found"
          },
        }
      }

      // Step 2: Build context
      const context = await this.buildContext(retrievalResults, contextLength)

      // Step 3: Generate response using Gemini
      const response = await this.generateResponse(query, context)

      return {
        query: query,
        response: response,
        context: context,
        sources: retrievalResults,
        metadata: {
          totalSources: retrievalResults.papers?.length || 0,
          avgSimilarity: this.calculateAverageSimilarity(retrievalResults.papers || []),
          processingTime: Date.now(),
        },
      }
    } catch (error) {
      console.error("Error processing RAG query:", error)
      
      // Return a helpful error response instead of throwing
      return {
        query: query,
        response: "I encountered an error while processing your query. This might be due to:\n\n1. A temporary service issue\n2. Database connectivity problems\n3. An unexpected error in the system\n\nPlease try again in a moment, or contact support if the problem persists.",
        context: { parts: [], totalLength: 0, sources: 0 },
        sources: { papers: [], chunks: [], citations: [] },
        metadata: {
          totalSources: 0,
          avgSimilarity: 0,
          processingTime: Date.now(),
          error: error.message
        },
      }
    }
  }

  async retrieveRelevantDocuments(query, options = {}) {
    const { topK, includeChunks, includeCitations, filters } = options

    try {
      // Generate query embedding
      const queryEmbedding = await embeddingController.generateEmbedding(query)

      // Search papers using MongoDB-based similarity
      const paperResults = await embeddingController.findSimilarPapers(queryEmbedding, topK, this.similarityThreshold, query)

      const results = {
        papers: paperResults || [],
        chunks: [],
        citations: [],
      }

      // Include chunk-level search if requested
      if (includeChunks) {
        const chunkResults = await embeddingController.searchPaperChunks(
          queryEmbedding,
          topK * 3,
          this.similarityThreshold,
        )
        results.chunks = chunkResults
      }

      // Apply additional filters
      if (filters.categories && filters.categories.length > 0) {
        results.papers = results.papers.filter((result) =>
          result.paper?.categories?.some((cat) => filters.categories.includes(cat)),
        )
      }

      if (filters.dateRange) {
        const { start, end } = filters.dateRange
        results.papers = results.papers.filter((result) => {
          if (!result.paper?.publishedDate) return false
          const pubDate = new Date(result.paper.publishedDate)
          return pubDate >= new Date(start) && pubDate <= new Date(end)
        })
      }

      if (filters.minCitations) {
        results.papers = results.papers.filter((result) => (result.paper?.citationCount || 0) >= filters.minCitations)
      }

      return results
    } catch (error) {
      console.error("Error retrieving relevant documents:", error)
      throw error
    }
  }

  // Build context from retrieved documents
  async buildContext(retrievalResults, maxLength) {
    const contextParts = []
    let currentLength = 0

    // Prioritize by relevance and type
    const prioritizedSources = this.prioritizeSources(retrievalResults)

    for (const source of prioritizedSources) {
      const contextText = this.extractContextText(source)
      const sourceLength = contextText.length

      if (currentLength + sourceLength <= maxLength) {
        contextParts.push({
          type: source.type || "document",
          text: contextText,
          source: source,
          similarity: source.similarity || 0,
        })
        currentLength += sourceLength
      } else {
        // Truncate if needed
        const remainingLength = maxLength - currentLength
        if (remainingLength > 100) {
          const truncatedText = contextText.substring(0, remainingLength - 3) + "..."
          contextParts.push({
            type: source.type || "document",
            text: truncatedText,
            source: source,
            similarity: source.similarity || 0,
            truncated: true,
          })
        }
        break
      }
    }

    return {
      parts: contextParts,
      totalLength: currentLength,
      sources: contextParts.length,
    }
  }

  // Generate response using Gemini
  async generateResponse(query, context) {
    try {
      const contextText = context.parts.map((part) => part.text).join("\n\n")
      const response = await embeddingController.generateResponse(query, contextText)

      return {
        answer: response,
        sources: context.parts.map((part) => ({
          title: part.source.paper?.title || "Unknown",
          similarity: part.similarity,
          type: part.type,
        })),
      }
    } catch (error) {
      console.error("Error generating response:", error)
      return {
        answer: "I apologize, but I encountered an error generating a response. Please try again.",
        sources: [],
      }
    }
  }

  // Prioritize sources for context building
  prioritizeSources(retrievalResults) {
    const sources = []

    // Add papers (highest priority)
    if (retrievalResults.papers) {
      retrievalResults.papers.forEach((result) => {
        sources.push({
          type: "paper",
          ...result,
        })
      })
    }

    // Add chunks (medium priority)
    if (retrievalResults.chunks) {
      retrievalResults.chunks.forEach((result) => {
        sources.push({
          type: "chunk",
          ...result,
        })
      })
    }

    // Add citations (lower priority)
    if (retrievalResults.citations) {
      retrievalResults.citations.forEach((result) => {
        sources.push({
          type: "citation",
          ...result,
        })
      })
    }

    // Sort by similarity score
    return sources.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
  }

  // Extract context text from different source types
  extractContextText(source) {
    if (source.chunk && source.chunk.text) {
      return source.chunk.text
    }

    if (source.paper) {
      const paper = source.paper
      const parts = []

      parts.push(`Title: ${paper.title}`)

      if (paper.authors && paper.authors.length > 0) {
        const authorNames = paper.authors.map((a) => a.name).join(", ")
        parts.push(`Authors: ${authorNames}`)
      }

      if (paper.abstract) {
        parts.push(`Abstract: ${paper.abstract}`)
      }

      if (paper.keywords && paper.keywords.length > 0) {
        parts.push(`Keywords: ${paper.keywords.join(", ")}`)
      }

      parts.push(`Citations: ${paper.citationCount || 0}`)
      parts.push(`Published: ${paper.publishedDate ? new Date(paper.publishedDate).getFullYear() : "Unknown"}`)

      return parts.join("\n")
    }

    return source.text || ""
  }

  // Calculate average similarity
  calculateAverageSimilarity(results) {
    if (!results || results.length === 0) return 0
    const sum = results.reduce((acc, result) => acc + (result.similarity || 0), 0)
    return Math.round((sum / results.length) * 100) / 100
  }

  // Advanced query processing with multiple strategies
  async processAdvancedQuery(query, strategies = ["semantic", "keyword", "citation"]) {
    const results = {}

    for (const strategy of strategies) {
      switch (strategy) {
        case "semantic":
          results.semantic = await this.processQuery(query, { includeChunks: true })
          break
        case "keyword":
          results.keyword = await this.keywordSearch(query)
          break
        case "citation":
          results.citation = await this.citationBasedSearch(query)
          break
      }
    }

    // Combine and rank results
    return this.combineSearchResults(results)
  }

  // Keyword-based search
  async keywordSearch(query) {
    const keywords = query.toLowerCase().split(/\s+/)
    const papers = await Paper.find({
      $or: [
        { title: { $regex: keywords.join("|"), $options: "i" } },
        { abstract: { $regex: keywords.join("|"), $options: "i" } },
        { keywords: { $in: keywords } },
      ],
    })
      .populate("authors", "name affiliation")
      .limit(10)

    return {
      papers: papers.map((paper) => ({
        paper: paper,
        similarity: 0.5, // Default similarity for keyword matches
        type: "keyword",
      })),
      chunks: [],
      citations: [],
    }
  }

  // Citation-based search
  async citationBasedSearch(query) {
    const citations = await Citation.find({
      context: { $regex: query, $options: "i" },
    })
      .populate("citingPaper citedPaper", "title authors publishedDate")
      .limit(20)

    return {
      papers: [],
      chunks: [],
      citations: citations.map((citation) => ({
        citation: citation,
        similarity: 0.6, // Default similarity for citation matches
        type: "citation",
      })),
    }
  }

  // Combine search results from multiple strategies
  combineSearchResults(results) {
    const combined = {
      papers: [],
      chunks: [],
      citations: [],
      strategies: Object.keys(results),
    }

    // Merge results with deduplication
    const seenPapers = new Set()
    const seenCitations = new Set()

    for (const [strategy, result] of Object.entries(results)) {
      result.papers?.forEach((paper) => {
        const paperId = paper.paper?._id?.toString()
        if (paperId && !seenPapers.has(paperId)) {
          seenPapers.add(paperId)
          combined.papers.push({ ...paper, strategy })
        }
      })

      result.citations?.forEach((citation) => {
        const citationId = citation.citation?._id?.toString() || citation.id
        if (citationId && !seenCitations.has(citationId)) {
          seenCitations.add(citationId)
          combined.citations.push({ ...citation, strategy })
        }
      })

      if (result.chunks) {
        combined.chunks.push(...result.chunks.map((chunk) => ({ ...chunk, strategy })))
      }
    }

    // Sort by similarity
    combined.papers.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    combined.citations.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    combined.chunks.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))

    return combined
  }
}

export default new RAGController()
