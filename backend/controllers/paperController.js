// Dynamic imports for CommonJS modules
let natural, compromise

async function loadDependencies() {
  try {
    if (!natural) {
      try {
        natural = (await import("natural")).default
      } catch (naturalError) {
        console.warn("natural failed to load, using fallback:", naturalError.message)
        // Create a simple fallback for natural
        natural = {
          WordTokenizer: class {
            tokenize(text) {
              return text.split(/\s+/)
            }
          },
          stopwords: ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'],
          PorterStemmer: {
            stem: (word) => word
          },
          SentimentAnalyzer: class {
            constructor() {}
            getSentiment() { return 0; }
          }
        }
      }
    }
    if (!compromise) {
      try {
        compromise = (await import("compromise")).default
      } catch (compromiseError) {
        console.warn("compromise failed to load, using fallback:", compromiseError.message)
        // Create a simple fallback for compromise
        compromise = (text) => ({
          nouns: () => ({ out: () => [] }),
          verbs: () => ({ out: () => [] }),
          adjectives: () => ({ out: () => [] })
        })
      }
    }
  } catch (error) {
    console.error("Error loading dependencies:", error)
    // Don't throw error, just log it and continue with fallbacks
  }
}

// Simple PDF text extraction function
async function extractTextFromPDF(buffer) {
  try {
    // Convert buffer to string and look for text content
    const text = buffer.toString('utf8', 0, Math.min(buffer.length, 500000))
    
    let extractedText = ""
    
    // Method 1: Look for text objects in parentheses (most reliable for readable text)
    const textObjects = text.match(/\(([^)]+)\)/g)
    if (textObjects) {
      const cleanTextObjects = textObjects
        .map(obj => obj.replace(/[()]/g, ''))
        .filter(obj => {
          // Filter out garbage text - must contain letters and be reasonable length
          const hasLetters = /[A-Za-z]/.test(obj)
          const reasonableLength = obj.length > 3 && obj.length < 200
          const notGarbage = !/^[^\x20-\x7E]*$/.test(obj) // Must contain printable characters
          return hasLetters && reasonableLength && notGarbage
        })
        .join(' ')
      
      if (cleanTextObjects.length > 100) {
        extractedText += cleanTextObjects + " "
      }
    }
    
    // Method 2: Look for text streams with better filtering
    const textStreams = text.match(/\/Text\s*<<[^>]*>>\s*stream\s*([\s\S]*?)\s*endstream/gi)
    if (textStreams) {
      const cleanStreams = textStreams
        .map(stream => {
          const content = stream.replace(/\/Text\s*<<[^>]*>>\s*stream\s*/, '').replace(/\s*endstream/, '')
          // Clean up the stream content
          return content
            .replace(/[^\x20-\x7E\s]/g, ' ') // Remove non-printable characters
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
        })
        .filter(stream => {
          const hasLetters = /[A-Za-z]/.test(stream)
          const reasonableLength = stream.length > 50
          return hasLetters && reasonableLength
        })
        .join(' ')
      
      if (cleanStreams.length > 100) {
        extractedText += cleanStreams + " "
      }
    }
    
    // Method 3: Look for specific patterns that indicate readable text
    const readablePatterns = [
      /BT\s*([\s\S]*?)\s*ET/gi,
      /\(([^)]+)\)\s*Tj/gi,
      /\[([^\]]+)\]\s*TJ/gi
    ]
    
    for (const pattern of readablePatterns) {
      const matches = text.match(pattern)
      if (matches) {
        const cleanMatches = matches
          .map(match => {
            // Extract content from the match
            let content = match
            if (pattern.source.includes('BT')) {
              content = match.replace(/BT\s*/, '').replace(/\s*ET/, '')
            } else if (pattern.source.includes('Tj')) {
              content = match.replace(/\(([^)]+)\)\s*Tj/, '$1')
            } else if (pattern.source.includes('TJ')) {
              content = match.replace(/\[([^\]]+)\]\s*TJ/, '$1')
            }
            
            return content
              .replace(/[^\x20-\x7E\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
          })
          .filter(content => {
            const hasLetters = /[A-Za-z]/.test(content)
            const reasonableLength = content.length > 10 && content.length < 500
            return hasLetters && reasonableLength
          })
          .join(' ')
        
        if (cleanMatches.length > 50) {
          extractedText += cleanMatches + " "
        }
      }
    }
    
    // Clean up the final extracted text
    let cleanText = extractedText
      .replace(/[^\x20-\x7E\s]/g, ' ') // Remove non-printable characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/Tj/g, ' ') // Remove PDF operators
      .replace(/TJ/g, ' ')
      .replace(/BT/g, ' ')
      .replace(/ET/g, ' ')
      .replace(/stream/g, ' ')
      .replace(/endstream/g, ' ')
      .replace(/\d+\.\d+\s+/g, ' ') // Remove positioning numbers
      .replace(/\s+/g, ' ') // Normalize whitespace again
      .trim()
    
    // If we have substantial readable text, return it
    if (cleanText.length > 200 && /[A-Za-z]/.test(cleanText)) {
      return { text: cleanText }
    }
    
    // Method 4: Fallback - try to find any readable text patterns
    const fallbackPatterns = text.match(/[A-Za-z\s]{20,}/g)
    if (fallbackPatterns) {
      const fallbackText = fallbackPatterns
        .map(pattern => pattern.replace(/[^\x20-\x7E]/g, ' '))
        .filter(pattern => {
          const hasLetters = /[A-Za-z]/.test(pattern)
          const reasonableLength = pattern.trim().length > 20
          return hasLetters && reasonableLength
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      
      if (fallbackText.length > 100) {
        return { text: fallbackText }
      }
    }
    
    // If no text found, return a placeholder
    return { text: "PDF content could not be extracted. Please ensure the PDF contains readable text." }
  } catch (error) {
    console.error("PDF text extraction error:", error)
    return { text: "Error extracting text from PDF." }
  }
}
import { extractCitations, extractKeywords, calculateImpactScore } from "../utils/paperAnalysis.js"
import Paper from "../models/Paper.js"
import Citation from "../models/Citation.js"
import ResearchTrend from "../models/ResearchTrend.js"
import embeddingController from "./embeddingController.js"

class PaperProcessor {
  constructor() {
    this.supportedFormats = [".pdf", ".txt", ".doc", ".docx"]
    this.maxFileSize = 50 * 1024 * 1024 // 50MB
  }

  // Main processing pipeline
  async processPaper(fileBuffer, filename, metadata = {}) {
    try {
      // Load dependencies
      await loadDependencies()

      // Extract text content
      const textContent = await this.extractText(fileBuffer, filename)
      if (!textContent || textContent.trim().length === 0) {
        throw new Error("Failed to extract text content from file")
      }

      // Parse paper structure
      const paperStructure = await this.parsePaperStructure(textContent)

      // Extract metadata
      const extractedMetadata = await this.extractMetadata(textContent, paperStructure)

      // Merge provided metadata with extracted metadata
      const finalMetadata = { ...extractedMetadata, ...metadata }

      // Ensure we have a valid abstract
      if (!finalMetadata.abstract || finalMetadata.abstract.trim().length === 0) {
        finalMetadata.abstract = "Abstract could not be extracted from this PDF."
      }

      // Ensure we have a valid title
      if (!finalMetadata.title || finalMetadata.title.trim().length === 0) {
        finalMetadata.title = "Untitled Paper"
      }

      // Extract citations
      const citations = await extractCitations(textContent)
      console.log(`Extracted ${citations.length} citations from paper: ${finalMetadata.title}`)
      if (citations.length > 0) {
        console.log("Sample citations:", citations.slice(0, 3))
      }

      // Extract keywords
      const keywords = await extractKeywords(finalMetadata.title || "", finalMetadata.abstract || "", textContent)

      // Generate embedding (with fallback)
      let paperEmbedding
      try {
        const paperText = `${finalMetadata.title} ${finalMetadata.abstract || ""}`
        paperEmbedding = await embeddingController.generateEmbedding(paperText)
      } catch (embeddingError) {
        console.warn("Embedding generation failed, using fallback:", embeddingError.message)
        paperEmbedding = new Array(100).fill(0) // Simple fallback embedding
      }

      // Generate paper chunks (with fallback)
      let chunks
      try {
        chunks = await this.generatePaperChunks(finalMetadata, textContent)
      } catch (chunkError) {
        console.warn("Chunk generation failed, using fallback:", chunkError.message)
        chunks = [] // Empty chunks as fallback
      }

      // Create paper document
      const paperData = {
        title: finalMetadata.title || "Untitled Paper",
        authors: finalMetadata.authors || [],
        abstract: finalMetadata.abstract || "",
        content: textContent,
        doi: finalMetadata.doi || undefined,
        arxivId: finalMetadata.arxivId || undefined,
        publishedDate: finalMetadata.publishedDate || new Date(),
        journal: finalMetadata.journal || {},
        keywords: keywords || [],
        categories: finalMetadata.categories || ["General"],
        citationCount: 0,
        impactScore: 0,
        embedding: paperEmbedding,
        chunks: chunks,
      }

      // Save paper to database
      const paper = new Paper(paperData)
      await paper.save()

      // Process citations asynchronously (don't block on errors)
      try {
        await this.processCitationsAsync(paper._id, citations, textContent)
      } catch (citationError) {
        console.warn("Citation processing failed:", citationError.message)
      }

      // Update research trends asynchronously
      try {
        await this.updateResearchTrendsAsync(paper._id, finalMetadata.categories, keywords)
      } catch (trendError) {
        console.warn("Research trends update failed:", trendError.message)
      }

      return {
        success: true,
        paper: paper,
        extractedCitations: citations.length,
        extractedKeywords: keywords.length,
      }
    } catch (error) {
      console.error("Error processing paper:", error)
      throw new Error(`Paper processing failed: ${error.message}`)
    }
  }

  async generatePaperChunks(metadata, textContent) {
    const chunks = []

    try {
      // Title chunk
      if (metadata.title) {
        try {
          const titleEmbedding = await embeddingController.generateEmbedding(metadata.title)
          chunks.push({
            text: metadata.title,
            type: "title",
            section: "title",
            chunkIndex: 0,
            embedding: titleEmbedding,
          })
        } catch (error) {
          console.warn("Failed to generate title embedding:", error.message)
        }
      }

      // Abstract chunk
      if (metadata.abstract) {
        try {
          const abstractEmbedding = await embeddingController.generateEmbedding(metadata.abstract)
          chunks.push({
            text: metadata.abstract,
            type: "abstract",
            section: "abstract",
            chunkIndex: 0,
            embedding: abstractEmbedding,
          })
        } catch (error) {
          console.warn("Failed to generate abstract embedding:", error.message)
        }
      }

      // Content chunks
      try {
        const contentChunks = embeddingController.chunkText(textContent, 1000, 200)
        for (let i = 0; i < contentChunks.length; i++) {
          try {
            const chunkEmbedding = await embeddingController.generateEmbedding(contentChunks[i])
            chunks.push({
              text: contentChunks[i],
              type: "content",
              section: "content",
              chunkIndex: i,
              embedding: chunkEmbedding,
            })
          } catch (error) {
            console.warn(`Failed to generate embedding for content chunk ${i}:`, error.message)
            // Add chunk without embedding
            chunks.push({
              text: contentChunks[i],
              type: "content",
              section: "content",
              chunkIndex: i,
              embedding: new Array(100).fill(0), // Fallback embedding
            })
          }
        }
      } catch (error) {
        console.warn("Failed to generate content chunks:", error.message)
      }

      // Keywords chunk
      if (metadata.keywords && metadata.keywords.length > 0) {
        try {
          const keywordsText = metadata.keywords.join(", ")
          const keywordsEmbedding = await embeddingController.generateEmbedding(keywordsText)
          chunks.push({
            text: keywordsText,
            type: "keywords",
            section: "keywords",
            chunkIndex: 0,
            embedding: keywordsEmbedding,
          })
        } catch (error) {
          console.warn("Failed to generate keywords embedding:", error.message)
        }
      }
    } catch (error) {
      console.error("Error in generatePaperChunks:", error)
      // Return empty chunks array if everything fails
      return []
    }

    return chunks
  }

  // Extract text from different file formats
  async extractText(fileBuffer, filename) {
    const extension = filename.toLowerCase().substring(filename.lastIndexOf("."))

    switch (extension) {
      case ".pdf":
        return await this.extractFromPDF(fileBuffer)
      case ".txt":
        return fileBuffer.toString("utf-8")
      case ".doc":
      case ".docx":
        return await this.extractFromWord(fileBuffer)
      default:
        throw new Error(`Unsupported file format: ${extension}`)
    }
  }

  // Extract text from PDF
  async extractFromPDF(pdfBuffer) {
    try {
      const data = await extractTextFromPDF(pdfBuffer)
      
      if (!data || !data.text) {
        throw new Error("No text content extracted from PDF")
      }
      
      const cleanedText = this.cleanText(data.text)
      
      if (!cleanedText || cleanedText.trim().length === 0) {
        throw new Error("Text cleaning resulted in empty content")
      }
      
      return cleanedText
    } catch (error) {
      console.error("PDF extraction error details:", error)
      throw new Error(`PDF extraction failed: ${error.message}`)
    }
  }

  // Extract text from Word documents (simplified)
  async extractFromWord(docBuffer) {
    // This would require additional libraries like mammoth.js
    // For now, return placeholder
    throw new Error("Word document processing not yet implemented")
  }

  // Clean and normalize extracted text
  cleanText(text) {
    return text
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/\n{3,}/g, "\n\n") // Limit consecutive newlines
      .replace(/[^\x20-\x7E\n]/g, "") // Remove non-printable characters
      .trim()
  }

  // Parse paper structure (sections, headings, etc.)
  async parsePaperStructure(text) {
    const structure = {
      sections: [],
      headings: [],
      abstract: "",
      introduction: "",
      methodology: "",
      results: "",
      discussion: "",
      conclusion: "",
      references: "",
    }

    // Common section patterns
    const sectionPatterns = {
      abstract:
        /(?:^|\n)\s*(?:ABSTRACT|Abstract)\s*(?:\n|$)([\s\S]*?)(?=(?:^|\n)\s*(?:[A-Z][A-Z\s]{2,}|Introduction|INTRODUCTION|\d+\.?\s*[A-Z]))/i,
      introduction:
        /(?:^|\n)\s*(?:INTRODUCTION|Introduction|\d+\.?\s*Introduction)\s*(?:\n|$)([\s\S]*?)(?=(?:^|\n)\s*(?:[A-Z][A-Z\s]{2,}|\d+\.?\s*[A-Z]))/i,
      methodology:
        /(?:^|\n)\s*(?:METHODOLOGY|Methodology|METHODS|Methods|\d+\.?\s*(?:Methodology|Methods))\s*(?:\n|$)([\s\S]*?)(?=(?:^|\n)\s*(?:[A-Z][A-Z\s]{2,}|\d+\.?\s*[A-Z]))/i,
      results:
        /(?:^|\n)\s*(?:RESULTS|Results|\d+\.?\s*Results)\s*(?:\n|$)([\s\S]*?)(?=(?:^|\n)\s*(?:[A-Z][A-Z\s]{2,}|\d+\.?\s*[A-Z]))/i,
      discussion:
        /(?:^|\n)\s*(?:DISCUSSION|Discussion|\d+\.?\s*Discussion)\s*(?:\n|$)([\s\S]*?)(?=(?:^|\n)\s*(?:[A-Z][A-Z\s]{2,}|\d+\.?\s*[A-Z]))/i,
      conclusion:
        /(?:^|\n)\s*(?:CONCLUSION|Conclusion|CONCLUSIONS|Conclusions|\d+\.?\s*Conclusion)\s*(?:\n|$)([\s\S]*?)(?=(?:^|\n)\s*(?:[A-Z][A-Z\s]{2,}|\d+\.?\s*[A-Z]))/i,
      references:
        /(?:^|\n)\s*(?:REFERENCES|References|BIBLIOGRAPHY|Bibliography|\d+\.?\s*References)\s*(?:\n|$)([\s\S]*)$/i,
    }

    // Extract sections
    for (const [sectionName, pattern] of Object.entries(sectionPatterns)) {
      const match = text.match(pattern)
      if (match) {
        structure[sectionName] = match[1].trim()
        structure.sections.push({
          name: sectionName,
          content: match[1].trim(),
          startIndex: match.index,
        })
      }
    }

    // Extract headings
    const headingPattern = /(?:^|\n)\s*(?:\d+\.?\s*)?([A-Z][A-Z\s]{2,}|[A-Z][a-z\s]{3,})\s*(?:\n|$)/g
    let headingMatch
    while ((headingMatch = headingPattern.exec(text)) !== null) {
      structure.headings.push({
        text: headingMatch[1].trim(),
        position: headingMatch.index,
      })
    }

    return structure
  }

  // Extract metadata from paper content
  async extractMetadata(text, structure) {
    const metadata = {}

    try {
      // Extract title (usually first significant line)
      metadata.title = this.extractTitle(text)

      // Extract authors
      metadata.authors = this.extractAuthors(text)

      // Extract DOI
      metadata.doi = this.extractDOI(text)

      // Extract arXiv ID
      metadata.arxivId = this.extractArxivId(text)

      // Extract publication date
      metadata.publishedDate = this.extractPublicationDate(text)

      // Extract journal information
      metadata.journal = this.extractJournalInfo(text)

      // Extract abstract
      metadata.abstract = structure.abstract || this.extractAbstract(text)

      // Extract categories/subjects
      metadata.categories = this.extractCategories(text, metadata.abstract)

      return metadata
    } catch (error) {
      console.error("Error extracting metadata:", error)
      // Return basic metadata if extraction fails
      return {
        title: this.extractTitle(text) || "Untitled Paper",
        authors: [],
        abstract: structure.abstract || "",
        categories: ["General"],
        publishedDate: new Date(),
        journal: {},
        doi: null,
        arxivId: null
      }
    }
  }

  extractTitle(text) {
    // First, check if the text is readable
    const readableText = text.replace(/[^\x20-\x7E]/g, ' ').trim()
    if (readableText.length < 50) {
      return "Untitled Paper"
    }

    // Look for title patterns at the beginning of the document
    const titlePatterns = [
      /^(.{10,200}?)(?:\n\n|\n[A-Z])/,
      /^(.{10,200}?)(?:\nAbstract|\nABSTRACT)/i,
      /^(.{10,200}?)(?:\n.*@.*\n)/,
      /^([A-Z][A-Za-z\s]{10,100}?)(?:\n|$)/,
    ]

    for (const pattern of titlePatterns) {
      const match = text.match(pattern)
      if (match && match[1].trim().length > 10) {
        const title = match[1].trim().replace(/\n/g, " ")
        // Check if it looks like a title (contains letters and reasonable length)
        if (/[A-Za-z]/.test(title) && title.length < 200) {
          return title
        }
      }
    }

    // Fallback: first line if reasonable length
    const firstLine = text.split("\n")[0]
    if (firstLine && firstLine.length > 10 && firstLine.length < 200 && /[A-Za-z]/.test(firstLine)) {
      return firstLine.trim()
    }

    // Fallback: look for any text that could be a title
    const words = text.match(/[A-Za-z\s]{10,100}/g)
    if (words && words.length > 0) {
      const potentialTitle = words[0].trim()
      if (potentialTitle.length > 10 && potentialTitle.length < 200) {
        return potentialTitle
      }
    }

    return "Untitled Paper"
  }

  extractAuthors(text) {
    const authors = []
    const authorPatterns = [
      // Pattern: Name1, Name2, and Name3
      /([A-Z][a-z]+\s+[A-Z][a-z]+(?:,\s*[A-Z][a-z]+\s+[A-Z][a-z]+)*(?:,?\s*and\s+[A-Z][a-z]+\s+[A-Z][a-z]+)?)/,
      // Pattern: Name1*, Name2†, Name3‡
      /([A-Z][a-z]+\s+[A-Z][a-z]+[*†‡§¶]?(?:,\s*[A-Z][a-z]+\s+[A-Z][a-z]+[*†‡§¶]?)*)/,
      // Pattern: Email addresses (to find author sections)
      /([A-Z][a-z]+\s+[A-Z][a-z]+).*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
    ]

    for (const pattern of authorPatterns) {
      const match = text.match(pattern)
      if (match) {
        const authorText = match[1]
        const names = authorText.split(/,\s*(?:and\s+)?|and\s+/)

        names.forEach((name) => {
          const cleanName = name.trim().replace(/[*†‡§¶]/, "")
          if (cleanName.length > 3) {
            authors.push({
              name: cleanName,
              affiliation: "",
              email: "",
            })
          }
        })
        break
      }
    }

    return authors
  }

  extractDOI(text) {
    const doiPattern = /(?:doi:\s*|DOI:\s*|https?:\/\/doi\.org\/)(10\.\d+\/[^\s]+)/i
    const match = text.match(doiPattern)
    return match ? match[1] : undefined
  }

  extractArxivId(text) {
    const arxivPattern = /(?:arXiv:\s*|arxiv:\s*)(\d{4}\.\d{4,5})/i
    const match = text.match(arxivPattern)
    return match ? match[1] : undefined
  }

  extractPublicationDate(text) {
    const datePatterns = [
      /(?:Published|Received|Accepted).*?(\d{1,2}[/-]\d{1,2}[/-]\d{4})/i,
      /(?:Published|Received|Accepted).*?(\d{4}[/-]\d{1,2}[/-]\d{1,2})/i,
      /(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i,
      /(\d{4})/,
    ]

    for (const pattern of datePatterns) {
      const match = text.match(pattern)
      if (match) {
        const dateStr = match[1]
        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) {
          return date
        }
      }
    }

    return new Date()
  }

  extractJournalInfo(text) {
    const journal = {}

    // Look for journal name patterns
    const journalPatterns = [
      /(?:Published in|Appeared in|Journal of|Proceedings of)\s+([^,\n]{5,50})/i,
      /([A-Z][a-z\s]+Journal[^,\n]{0,30})/,
      /([A-Z][a-z\s]+Conference[^,\n]{0,30})/,
    ]

    for (const pattern of journalPatterns) {
      const match = text.match(pattern)
      if (match) {
        journal.name = match[1].trim()
        break
      }
    }

    // Look for volume/issue patterns
    const volumePattern = /(?:Vol\.?\s*|Volume\s*)(\d+)/i
    const volumeMatch = text.match(volumePattern)
    if (volumeMatch) {
      journal.volume = volumeMatch[1]
    }

    const issuePattern = /(?:No\.?\s*|Issue\s*|Number\s*)(\d+)/i
    const issueMatch = text.match(issuePattern)
    if (issueMatch) {
      journal.issue = issueMatch[1]
    }

    const pagesPattern = /(?:pp\.?\s*|pages?\s*)(\d+(?:-\d+)?)/i
    const pagesMatch = text.match(pagesPattern)
    if (pagesMatch) {
      journal.pages = pagesMatch[1]
    }

    return journal
  }

  extractAbstract(text) {
    // First, check if the text is readable (not just garbage characters)
    const readableText = text.replace(/[^\x20-\x7E]/g, ' ').trim()
    if (readableText.length < 100) {
      return "Abstract could not be extracted from this PDF."
    }

    const abstractPatterns = [
      /(?:^|\n)\s*(?:ABSTRACT|Abstract)\s*(?:\n|$)([\s\S]*?)(?=(?:^|\n)\s*(?:[A-Z][A-Z\s]{2,}|Introduction|INTRODUCTION|\d+\.?\s*[A-Z]))/i,
      /(?:^|\n)\s*(?:SUMMARY|Summary)\s*(?:\n|$)([\s\S]*?)(?=(?:^|\n)\s*(?:[A-Z][A-Z\s]{2,}|Introduction|INTRODUCTION|\d+\.?\s*[A-Z]))/i,
      /(?:^|\n)\s*(?:ABSTRACT|Abstract)\s*(?:\n|$)([\s\S]*?)(?=(?:^|\n)\s*(?:[A-Z][A-Z\s]{2,}|Introduction|INTRODUCTION|\d+\.?\s*[A-Z]))/i,
    ]

    for (const pattern of abstractPatterns) {
      const match = text.match(pattern)
      if (match && match[1].trim().length > 50) {
        return match[1].trim()
      }
    }

    // Fallback: first paragraph if it looks like an abstract
    const paragraphs = text.split("\n\n")
    for (const paragraph of paragraphs) {
      const cleanParagraph = paragraph.trim()
      if (cleanParagraph.length > 100 && cleanParagraph.length < 2000) {
        // Check if it looks like an abstract (contains common abstract words)
        const abstractKeywords = ['abstract', 'summary', 'introduction', 'background', 'objective', 'purpose', 'aim', 'goal']
        const hasAbstractKeywords = abstractKeywords.some(keyword => 
          cleanParagraph.toLowerCase().includes(keyword)
        )
        
        if (hasAbstractKeywords || cleanParagraph.length > 200) {
          return cleanParagraph
        }
      }
    }

    // Final fallback: take first 300 characters that look like text
    const cleanText = text.replace(/[^\x20-\x7E\s]/g, ' ').trim()
    if (cleanText.length > 100) {
      return cleanText.substring(0, 300) + "..."
    }

    return "Abstract could not be extracted from this PDF."
  }

  extractCategories(text, abstract) {
    const categories = []
    const categoryKeywords = {
      "Computer Science": ["algorithm", "machine learning", "artificial intelligence", "computer", "software"],
      Mathematics: ["theorem", "proof", "equation", "mathematical", "formula"],
      Physics: ["quantum", "particle", "energy", "physics", "electromagnetic"],
      Biology: ["cell", "gene", "protein", "biological", "organism"],
      Chemistry: ["molecule", "chemical", "reaction", "compound", "synthesis"],
      Medicine: ["patient", "clinical", "medical", "treatment", "diagnosis"],
      Engineering: ["system", "design", "optimization", "engineering", "technical"],
      Economics: ["economic", "market", "financial", "cost", "investment"],
      Psychology: ["behavior", "cognitive", "psychological", "mental", "brain"],
    }

    const searchText = `${abstract} ${text.substring(0, 1000)}`.toLowerCase()

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      const matchCount = keywords.filter((keyword) => searchText.includes(keyword)).length
      if (matchCount >= 2) {
        categories.push(category)
      }
    }

    return categories.length > 0 ? categories : ["General"]
  }

  // Process citations asynchronously
  async processCitationsAsync(paperId, citations, fullText) {
    try {
      console.log(`Processing ${citations.length} citations for paper ${paperId}`)
      
      for (const citation of citations) {
        console.log(`Processing citation: ${citation.text} (type: ${citation.type})`)
        
        // Try to match citation with existing papers
        const matchedPaper = await this.matchCitation(citation)

        if (matchedPaper) {
          console.log(`Citation matched with paper: ${matchedPaper.title}`)
          
          // Create citation relationship
          const citationDoc = new Citation({
            citingPaper: paperId,
            citedPaper: matchedPaper._id,
            context: citation.context,
            citationType: citation.type || "direct",
            section: this.determineCitationSection(citation.position, fullText),
            sentiment: "neutral", // Would be analyzed separately
            strength: 0.5,
          })

          await citationDoc.save()
          console.log(`Citation document saved successfully`)

          // Update citation count
          await Paper.findByIdAndUpdate(matchedPaper._id, {
            $inc: { citationCount: 1 },
            $addToSet: { citedBy: paperId },
          })

          await Paper.findByIdAndUpdate(paperId, {
            $addToSet: { references: matchedPaper._id },
          })
        } else {
          console.log(`Citation not matched, storing as unmatched: ${citation.text}`)
          
          // Store unmatched citation for future reference
          // This helps track papers that are being cited but not yet in our database
          const unmatchedCitationDoc = new Citation({
            citingPaper: paperId,
            citedPaper: null, // No match found
            context: citation.context,
            citationType: citation.type || "direct",
            section: this.determineCitationSection(citation.position, fullText),
            sentiment: "neutral",
            strength: 0.5,
            unmatchedCitation: {
              text: citation.text,
              authors: citation.authors || [],
              year: citation.year,
              journal: citation.journal,
              doi: citation.doi
            }
          })

          await unmatchedCitationDoc.save()
          console.log(`Unmatched citation document saved successfully`)
        }
      }

      console.log(`Finished processing citations for paper ${paperId}`)

      // Recalculate impact score
      const paper = await Paper.findById(paperId).populate("references citedBy")
      const impactScore = calculateImpactScore(paper)
      await Paper.findByIdAndUpdate(paperId, { impactScore })

    } catch (error) {
      console.error("Error processing citations:", error)
    }
  }

  // Update research trends asynchronously when new paper is added
  async updateResearchTrendsAsync(paperId, categories, keywords) {
    try {
      // Get the paper data
      const paper = await Paper.findById(paperId)
      if (!paper) return

      // Update trends for each category
      for (const category of categories) {
        await this.updateCategoryTrend(category, paper)
      }

      // Update trends for each keyword
      for (const keyword of keywords) {
        await this.updateKeywordTrend(keyword, paper)
      }

      // Update overall research trends
      await this.updateOverallTrends()

    } catch (error) {
      console.error("Error updating research trends:", error)
    }
  }

  // Update trend for a specific category
  async updateCategoryTrend(category, paper) {
    try {
      const currentYear = new Date().getFullYear()
      
      let trend = await ResearchTrend.findOne({ topic: category })
      
      if (!trend) {
        // Create new trend for this category
        trend = new ResearchTrend({
          topic: category,
          keywords: [category],
          categories: [category],
          paperCount: 0,
          citationCount: 0,
          averageImpact: 0,
          growthRate: 0,
          timeSeriesData: [],
          topPapers: [],
          emergingAuthors: [],
          relatedTrends: []
        })
      }

      // Update paper count
      trend.paperCount += 1
      
      // Update citation count
      trend.citationCount += paper.citationCount || 0
      
      // Update average impact
      const totalImpact = trend.averageImpact * (trend.paperCount - 1) + (paper.impactScore || 0)
      trend.averageImpact = totalImpact / trend.paperCount
      
      // Update time series data
      const yearData = trend.timeSeriesData.find(d => d.year === currentYear)
      if (yearData) {
        yearData.paperCount += 1
        yearData.citationCount += paper.citationCount || 0
        yearData.averageImpact = trend.averageImpact
      } else {
        trend.timeSeriesData.push({
          year: currentYear,
          paperCount: 1,
          citationCount: paper.citationCount || 0,
          averageImpact: paper.impactScore || 0
        })
      }
      
      // Calculate growth rate (papers per year)
      if (trend.timeSeriesData.length > 1) {
        const recentYears = trend.timeSeriesData.slice(-3) // Last 3 years
        const avgRecent = recentYears.reduce((sum, d) => sum + d.paperCount, 0) / recentYears.length
        const avgOlder = trend.timeSeriesData.length > 3 ? 
          (trend.paperCount - recentYears.reduce((sum, d) => sum + d.paperCount, 0)) / (trend.timeSeriesData.length - 3) : 0
        
        trend.growthRate = avgOlder > 0 ? (avgRecent - avgOlder) / avgOlder : 1
      }
      
      // Add paper to top papers if it has high impact
      if (paper.impactScore > trend.averageImpact) {
        trend.topPapers.unshift(paper._id)
        trend.topPapers = trend.topPapers.slice(0, 10) // Keep only top 10
      }
      
      // Update emerging authors
      for (const author of paper.authors) {
        const existingAuthor = trend.emergingAuthors.find(a => a.name === author.name)
        if (existingAuthor) {
          existingAuthor.paperCount += 1
          existingAuthor.citationCount += paper.citationCount || 0
        } else {
          trend.emergingAuthors.push({
            name: author.name,
            paperCount: 1,
            citationCount: paper.citationCount || 0,
            hIndex: 0 // Would need to calculate this separately
          })
        }
      }
      
      // Sort emerging authors by paper count
      trend.emergingAuthors.sort((a, b) => b.paperCount - a.paperCount)
      trend.emergingAuthors = trend.emergingAuthors.slice(0, 20) // Keep top 20
      
      trend.lastUpdated = new Date()
      await trend.save()
      
    } catch (error) {
      console.error(`Error updating category trend for ${category}:`, error)
    }
  }

  // Update trend for a specific keyword
  async updateKeywordTrend(keyword, paper) {
    try {
      const currentYear = new Date().getFullYear()
      
      let trend = await ResearchTrend.findOne({ topic: keyword })
      
      if (!trend) {
        // Create new trend for this keyword
        trend = new ResearchTrend({
          topic: keyword,
          keywords: [keyword],
          categories: paper.categories || [],
          paperCount: 0,
          citationCount: 0,
          averageImpact: 0,
          growthRate: 0,
          timeSeriesData: [],
          topPapers: [],
          emergingAuthors: [],
          relatedTrends: []
        })
      }

      // Update paper count
      trend.paperCount += 1
      
      // Update citation count
      trend.citationCount += paper.citationCount || 0
      
      // Update average impact
      const totalImpact = trend.averageImpact * (trend.paperCount - 1) + (paper.impactScore || 0)
      trend.averageImpact = totalImpact / trend.paperCount
      
      // Update time series data
      const yearData = trend.timeSeriesData.find(d => d.year === currentYear)
      if (yearData) {
        yearData.paperCount += 1
        yearData.citationCount += paper.citationCount || 0
        yearData.averageImpact = trend.averageImpact
      } else {
        trend.timeSeriesData.push({
          year: currentYear,
          paperCount: 1,
          citationCount: paper.citationCount || 0,
          averageImpact: paper.impactScore || 0
        })
      }
      
      // Calculate growth rate
      if (trend.timeSeriesData.length > 1) {
        const recentYears = trend.timeSeriesData.slice(-3)
        const avgRecent = recentYears.reduce((sum, d) => sum + d.paperCount, 0) / recentYears.length
        const avgOlder = trend.timeSeriesData.length > 3 ? 
          (trend.paperCount - recentYears.reduce((sum, d) => sum + d.paperCount, 0)) / (trend.timeSeriesData.length - 3) : 0
        
        trend.growthRate = avgOlder > 0 ? (avgRecent - avgOlder) / avgOlder : 1
      }
      
      // Add paper to top papers if it has high impact
      if (paper.impactScore > trend.averageImpact) {
        trend.topPapers.unshift(paper._id)
        trend.topPapers = trend.topPapers.slice(0, 10)
      }
      
      trend.lastUpdated = new Date()
      await trend.save()
      
    } catch (error) {
      console.error(`Error updating keyword trend for ${keyword}:`, error)
    }
  }

  // Update overall research trends
  async updateOverallTrends() {
    try {
      const currentYear = new Date().getFullYear()
      
      let overallTrend = await ResearchTrend.findOne({ topic: "Overall Research Trends" })
      
      if (!overallTrend) {
        overallTrend = new ResearchTrend({
          topic: "Overall Research Trends",
          keywords: ["research", "overall", "general"],
          categories: ["General"],
          paperCount: 0,
          citationCount: 0,
          averageImpact: 0,
          growthRate: 0,
          timeSeriesData: [],
          topPapers: [],
          emergingAuthors: [],
          relatedTrends: []
        })
      }
      
      // Get current stats
      const totalPapers = await Paper.countDocuments()
      const totalCitations = await Citation.countDocuments()
      const avgImpact = await Paper.aggregate([
        { $group: { _id: null, avgImpact: { $avg: "$impactScore" } } }
      ])
      
      // Update counts
      overallTrend.paperCount = totalPapers
      overallTrend.citationCount = totalCitations
      overallTrend.averageImpact = avgImpact[0]?.avgImpact || 0
      
      // Update time series
      const yearData = overallTrend.timeSeriesData.find(d => d.year === currentYear)
      if (yearData) {
        yearData.paperCount = totalPapers
        yearData.citationCount = totalCitations
        yearData.averageImpact = overallTrend.averageImpact
      } else {
        overallTrend.timeSeriesData.push({
          year: currentYear,
          paperCount: totalPapers,
          citationCount: totalCitations,
          averageImpact: overallTrend.averageImpact
        })
      }
      
      // Calculate growth rate
      if (overallTrend.timeSeriesData.length > 1) {
        const recentYears = overallTrend.timeSeriesData.slice(-3)
        const avgRecent = recentYears.reduce((sum, d) => sum + d.paperCount, 0) / recentYears.length
        const avgOlder = overallTrend.timeSeriesData.length > 3 ? 
          (overallTrend.paperCount - recentYears.reduce((sum, d) => sum + d.paperCount, 0)) / (overallTrend.timeSeriesData.length - 3) : 0
        
        overallTrend.growthRate = avgOlder > 0 ? (avgRecent - avgOlder) / avgOlder : 1
      }
      
      overallTrend.lastUpdated = new Date()
      await overallTrend.save()
      
    } catch (error) {
      console.error("Error updating overall research trends:", error)
    }
  }

  // Match citation text with existing papers
  async matchCitation(citation) {
    try {
      // Method 1: Try to match by DOI first (most reliable)
      if (citation.doi) {
        const matchedByDOI = await Paper.findOne({ doi: citation.doi })
        if (matchedByDOI) return matchedByDOI
      }

      // Method 2: Try to match by title similarity
      if (citation.text) {
        const searchTerms = citation.text
          .replace(/[^\w\s]/g, "")
          .split(/\s+/)
          .filter((term) => term.length > 3)
          .slice(0, 5)

        if (searchTerms.length > 0) {
          const searchRegex = new RegExp(searchTerms.join("|"), "i")
          
          const matchedByTitle = await Paper.findOne({
            $or: [
              { title: searchRegex },
              { abstract: searchRegex }
            ]
          })
          
          if (matchedByTitle) return matchedByTitle
        }
      }

      // Method 3: Try to match by authors and year
      if (citation.authors && citation.authors.length > 0 && citation.year) {
        const authorRegex = new RegExp(citation.authors[0].replace(/[^\w\s]/g, ""), "i")
        
        const matchedByAuthorYear = await Paper.findOne({
          $and: [
            { 
              authors: { 
                $elemMatch: { 
                  name: authorRegex 
                } 
              } 
            },
            { 
              publishedDate: { 
                $gte: new Date(citation.year, 0, 1),
                $lt: new Date(citation.year + 1, 0, 1)
              } 
            }
          ]
        })
        
        if (matchedByAuthorYear) return matchedByAuthorYear
      }

      // Method 4: Try to match by journal and year
      if (citation.journal && citation.year) {
        const journalRegex = new RegExp(citation.journal.replace(/[^\w\s]/g, ""), "i")
        
        const matchedByJournalYear = await Paper.findOne({
          $and: [
            { 
              "journal.name": journalRegex 
            },
            { 
              publishedDate: { 
                $gte: new Date(citation.year, 0, 1),
                $lt: new Date(citation.year + 1, 0, 1)
              } 
            }
          ]
        })
        
        if (matchedByJournalYear) return matchedByJournalYear
      }

      // No match found
      return null
    } catch (error) {
      console.error("Error in citation matching:", error)
      return null
    }
  }

  // Determine which section a citation appears in
  determineCitationSection(position, fullText) {
    const textBeforeCitation = fullText.substring(0, position).toLowerCase()

    const sectionMarkers = {
      introduction: /(?:introduction|background)/,
      methodology: /(?:method|approach|technique)/,
      results: /(?:result|finding|outcome)/,
      discussion: /(?:discussion|analysis)/,
      conclusion: /(?:conclusion|summary)/,
    }

    let lastSection = "introduction"
    let lastPosition = -1

    for (const [section, pattern] of Object.entries(sectionMarkers)) {
      const match = textBeforeCitation.match(pattern)
      if (match && match.index > lastPosition) {
        lastSection = section
        lastPosition = match.index
      }
    }

    return lastSection
  }

  // Batch process multiple papers
  async batchProcess(files, metadata = []) {
    const results = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fileMeta = metadata[i] || {}

      try {
        const result = await this.processPaper(file.buffer, file.originalname, fileMeta)
        results.push({ success: true, filename: file.originalname, ...result })
      } catch (error) {
        results.push({
          success: false,
          filename: file.originalname,
          error: error.message,
        })
      }
    }

    // Update overall research trends after batch processing
    try {
      await this.updateOverallTrends()
    } catch (error) {
      console.warn("Failed to update overall trends after batch processing:", error.message)
    }

    return results
  }

  // Manually update all research trends (useful for admin operations)
  async updateAllResearchTrends() {
    try {
      console.log("Starting comprehensive research trends update...")
      
      // Get all papers
      const papers = await Paper.find({})
      console.log(`Processing ${papers.length} papers for trends...`)
      
      // Clear existing trends (except overall)
      await ResearchTrend.deleteMany({ topic: { $ne: "Overall Research Trends" } })
      
      // Process each paper to rebuild trends
      for (const paper of papers) {
        try {
          await this.updateCategoryTrend(paper.categories[0] || "General", paper)
          
          for (const keyword of paper.keywords) {
            await this.updateKeywordTrend(keyword, paper)
          }
        } catch (error) {
          console.warn(`Failed to process paper ${paper._id} for trends:`, error.message)
        }
      }
      
      // Update overall trends
      await this.updateOverallTrends()
      
      console.log("Research trends update completed successfully")
      return { success: true, message: "All research trends updated successfully" }
      
    } catch (error) {
      console.error("Error updating all research trends:", error)
      throw error
    }
  }

  // Get citation statistics
  async getCitationStats() {
    try {
      const totalCitations = await Citation.countDocuments()
      const matchedCitations = await Citation.countDocuments({ citedPaper: { $ne: null } })
      const unmatchedCitations = await Citation.countDocuments({ citedPaper: null })
      
      return {
        totalCitations,
        matchedCitations,
        unmatchedCitations,
        matchRate: totalCitations > 0 ? (matchedCitations / totalCitations * 100).toFixed(2) : 0
      }
    } catch (error) {
      console.error("Error getting citation stats:", error)
      throw error
    }
  }
}

export default new PaperProcessor()
