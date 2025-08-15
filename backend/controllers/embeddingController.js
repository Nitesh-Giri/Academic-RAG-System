import { GoogleGenerativeAI } from "@google/generative-ai"
import mongoose from "mongoose"

class EmbeddingController {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" })
    // Note: Gemini doesn't have embedding-001, so we'll use text-based search as fallback
  }

  async generateEmbedding(text) {
    try {
      // Since Gemini doesn't have embedding models, we'll use a simple text-based approach
      // This is a fallback that creates a simple hash-based representation
      return this.createSimpleEmbedding(text)
    } catch (error) {
      console.error("Error generating embedding:", error)
      // Return a simple fallback embedding
      return this.createSimpleEmbedding(text)
    }
  }

  // Create a simple text-based embedding as fallback
  createSimpleEmbedding(text) {
    const words = text.toLowerCase().split(/\s+/)
    const wordFreq = {}
    
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1
    })
    
    // Create a simple vector representation
    const uniqueWords = Object.keys(wordFreq)
    const embedding = new Array(100).fill(0)
    
    uniqueWords.forEach((word, index) => {
      if (index < 100) {
        embedding[index] = wordFreq[word] / words.length
      }
    })
    
    return embedding
  }

  async generateEmbeddings(texts) {
    try {
      const embeddings = await Promise.all(texts.map((text) => this.generateEmbedding(text)))
      return embeddings
    } catch (error) {
      console.error("Error generating embeddings:", error)
      // Return simple embeddings as fallback
      return texts.map(text => this.createSimpleEmbedding(text))
    }
  }

  async generateResponse(prompt, context = "") {
    try {
      const fullPrompt = context ? `Context: ${context}\n\nQuestion: ${prompt}` : prompt

      const result = await this.model.generateContent(fullPrompt)
      const response = await result.response
      return response.text()
    } catch (error) {
      console.error("Error generating response:", error)
      // Return a helpful fallback response
      return this.generateFallbackResponse(prompt, context)
    }
  }

  // Generate a fallback response when Gemini fails
  generateFallbackResponse(prompt, context) {
    if (!context || context.trim() === "") {
      return "I apologize, but I'm currently unable to process your query. This might be due to a temporary service issue. Please try again later or contact support if the problem persists."
    }
    
    // Try to provide a basic response based on available context
    const contextParts = context.split('\n\n')
    const relevantInfo = contextParts.slice(0, 2).join('\n')
    
    return `Based on the available information: ${relevantInfo}\n\nI found some relevant content, but I'm currently experiencing technical difficulties with generating a full response. Please try again later.`
  }

  chunkText(text, maxChunkSize = 1000, overlap = 200) {
    const chunks = []
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)

    let currentChunk = ""
    let currentSize = 0

    for (const sentence of sentences) {
      const sentenceSize = sentence.length

      if (currentSize + sentenceSize > maxChunkSize && currentChunk) {
        chunks.push(currentChunk.trim())

        // Create overlap
        const words = currentChunk.split(" ")
        const overlapWords = words.slice(-Math.floor(overlap / 10))
        currentChunk = overlapWords.join(" ") + " " + sentence
        currentSize = currentChunk.length
      } else {
        currentChunk += (currentChunk ? " " : "") + sentence
        currentSize += sentenceSize
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim())
    }

    return chunks
  }

  async findSimilarPapers(queryEmbedding, limit = 10, threshold = 0.7, originalQuery = null) {
    try {
      const Paper = (await import("../models/Paper.js")).default
      
      // First try to find papers with embeddings
      let papers = await Paper.find({ embedding: { $exists: true, $ne: [] } })
      
      if (papers.length === 0) {
        // If no papers with embeddings, fall back to text-based search
        // Use originalQuery if provided, otherwise try to convert embedding to text (not ideal)
        const queryText = originalQuery || "general search"
        return await this.fallbackTextSearch(queryText, limit, threshold)
      }

      const similarities = papers.map((paper) => ({
        paper,
        similarity: this.cosineSimilarity(queryEmbedding, paper.embedding),
      }))

      return similarities
        .filter((item) => item.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
    } catch (error) {
      console.error("Error finding similar papers:", error)
      // Fall back to text-based search
      const queryText = originalQuery || "general search"
      return await this.fallbackTextSearch(queryText, limit, threshold)
    }
  }

  // Fallback text-based search when embeddings fail
  async fallbackTextSearch(queryText, limit = 10, threshold = 0.7) {
    try {
      const Paper = (await import("../models/Paper.js")).default
      
      // Ensure queryText is a string
      const query = typeof queryText === 'string' ? queryText : String(queryText || '')
      
      if (!query.trim()) {
        return []
      }
      
      // Simple text-based search
      const searchRegex = new RegExp(query.split(' ').join('|'), 'i')
      
      const papers = await Paper.find({
        $or: [
          { title: searchRegex },
          { abstract: searchRegex },
          { keywords: { $in: query.split(' ') } }
        ]
      }).limit(limit * 2) // Get more papers to filter by relevance
      
      // Calculate simple relevance scores
      const scoredPapers = papers.map(paper => {
        let score = 0
        
        // Title match gets highest score
        if (paper.title && paper.title.toLowerCase().includes(query.toLowerCase())) {
          score += 0.8
        }
        
        // Abstract match
        if (paper.abstract && paper.abstract.toLowerCase().includes(query.toLowerCase())) {
          score += 0.6
        }
        
        // Keyword match
        if (paper.keywords && paper.keywords.some(k => k.toLowerCase().includes(query.toLowerCase()))) {
          score += 0.4
        }
        
        // Boost by citation count and impact score
        score += (paper.citationCount || 0) * 0.01
        score += (paper.impactScore || 0) * 0.1
        
        return {
          paper,
          similarity: Math.min(score, 1.0) // Cap at 1.0
        }
      })
      
      return scoredPapers
        .filter(item => item.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
    } catch (error) {
      console.error("Error in fallback text search:", error)
      return []
    }
  }

  async searchPaperChunks(queryEmbedding, limit = 20, threshold = 0.7) {
    try {
      const Paper = (await import("../models/Paper.js")).default
      const papers = await Paper.find({ "chunks.embedding": { $exists: true } })

      const allChunks = []
      papers.forEach((paper) => {
        paper.chunks.forEach((chunk) => {
          if (chunk.embedding && chunk.embedding.length > 0) {
            const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding)
            if (similarity >= threshold) {
              allChunks.push({
                paperId: paper._id,
                paperTitle: paper.title,
                chunk,
                similarity,
              })
            }
          }
        })
      })

      return allChunks.sort((a, b) => b.similarity - a.similarity).slice(0, limit)
    } catch (error) {
      console.error("Error searching paper chunks:", error)
      return []
    }
  }

  cosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0
    }

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i]
      norm1 += embedding1[i] * embedding1[i]
      norm2 += embedding2[i] * embedding2[i]
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  }
}

export default new EmbeddingController()
