import { GoogleGenerativeAI } from "@google/generative-ai"

class EmbeddingService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    this.embeddingModel = this.genAI.getGenerativeModel({ model: "embedding-001" })
    this.textModel = this.genAI.getGenerativeModel({ model: "gemini-pro" })

    this.embeddingDimension = 768 // Gemini embedding dimension
  }

  // Generate embeddings for text using Gemini
  async generateEmbedding(text, provider = "gemini") {
    try {
      const cleanText = this.preprocessText(text)
      return await this.generateGeminiEmbedding(cleanText)
    } catch (error) {
      console.error("Error generating embedding:", error)
      throw new Error(`Embedding generation failed: ${error.message}`)
    }
  }

  // Generate Gemini embeddings
  async generateGeminiEmbedding(text) {
    const result = await this.embeddingModel.embedContent(text)
    return result.embedding.values
  }

  // Batch generate embeddings
  async batchGenerateEmbeddings(texts, provider = "gemini") {
    const embeddings = []

    // Process in batches to avoid rate limits
    const batchSize = 10
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      const batchEmbeddings = await Promise.all(batch.map((text) => this.generateEmbedding(text, provider)))
      embeddings.push(...batchEmbeddings)

      // Add delay between batches
      if (i + batchSize < texts.length) {
        await this.delay(1000)
      }
    }

    return embeddings
  }

  // Generate embeddings for paper chunks
  async generatePaperEmbeddings(paper) {
    const chunks = this.chunkPaper(paper)
    const embeddings = []

    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk.text)
      embeddings.push({
        ...chunk,
        embedding: embedding,
      })
    }

    return embeddings
  }

  // Chunk paper content for better embeddings
  chunkPaper(paper) {
    const chunks = []

    // Title and abstract as separate chunks
    if (paper.title) {
      chunks.push({
        type: "title",
        text: paper.title,
        metadata: { section: "title", paperId: paper._id },
      })
    }

    if (paper.abstract) {
      chunks.push({
        type: "abstract",
        text: paper.abstract,
        metadata: { section: "abstract", paperId: paper._id },
      })
    }

    // Chunk main content
    if (paper.content) {
      const contentChunks = this.chunkText(paper.content, {
        maxChunkSize: 1000,
        overlap: 200,
        preserveSentences: true,
      })

      contentChunks.forEach((chunk, index) => {
        chunks.push({
          type: "content",
          text: chunk,
          metadata: {
            section: "content",
            chunkIndex: index,
            paperId: paper._id,
          },
        })
      })
    }

    // Keywords as a single chunk
    if (paper.keywords && paper.keywords.length > 0) {
      chunks.push({
        type: "keywords",
        text: paper.keywords.join(", "),
        metadata: { section: "keywords", paperId: paper._id },
      })
    }

    return chunks
  }

  // Advanced text chunking with overlap
  chunkText(text, options = {}) {
    const { maxChunkSize = 1000, overlap = 200, preserveSentences = true, preserveParagraphs = false } = options

    if (preserveParagraphs) {
      return this.chunkByParagraphs(text, maxChunkSize, overlap)
    }

    if (preserveSentences) {
      return this.chunkBySentences(text, maxChunkSize, overlap)
    }

    return this.chunkByWords(text, maxChunkSize, overlap)
  }

  // Chunk by paragraphs
  chunkByParagraphs(text, maxChunkSize, overlap) {
    const paragraphs = text.split(/\n\s*\n/)
    const chunks = []
    let currentChunk = ""

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length <= maxChunkSize) {
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim())
        }
        currentChunk = paragraph
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim())
    }

    return this.addOverlap(chunks, overlap)
  }

  // Chunk by sentences
  chunkBySentences(text, maxChunkSize, overlap) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
    const chunks = []
    let currentChunk = ""

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length <= maxChunkSize) {
        currentChunk += (currentChunk ? " " : "") + sentence.trim()
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim())
        }
        currentChunk = sentence.trim()
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim())
    }

    return this.addOverlap(chunks, overlap)
  }

  // Chunk by words
  chunkByWords(text, maxChunkSize, overlap) {
    const words = text.split(/\s+/)
    const chunks = []
    let currentChunk = []

    for (const word of words) {
      const chunkText = currentChunk.join(" ") + " " + word
      if (chunkText.length <= maxChunkSize) {
        currentChunk.push(word)
      } else {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.join(" "))
        }
        currentChunk = [word]
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "))
    }

    return this.addOverlap(chunks, overlap)
  }

  // Add overlap between chunks
  addOverlap(chunks, overlapSize) {
    if (overlapSize <= 0 || chunks.length <= 1) {
      return chunks
    }

    const overlappedChunks = [chunks[0]]

    for (let i = 1; i < chunks.length; i++) {
      const prevChunk = chunks[i - 1]
      const currentChunk = chunks[i]

      // Get overlap from previous chunk
      const prevWords = prevChunk.split(/\s+/)
      const overlapWords = prevWords.slice(-Math.floor(overlapSize / 10)) // Approximate word count

      const overlappedChunk = overlapWords.join(" ") + " " + currentChunk
      overlappedChunks.push(overlappedChunk)
    }

    return overlappedChunks
  }

  // Preprocess text for embedding
  preprocessText(text) {
    return text
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/[^\x20-\x7E]/g, "") // Remove non-ASCII characters
      .trim()
      .substring(0, 8000) // Limit length for embedding models
  }

  // Calculate cosine similarity between embeddings
  cosineSimilarity(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
      throw new Error("Embeddings must have the same dimension")
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

  // Utility delay function
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export default new EmbeddingService()
