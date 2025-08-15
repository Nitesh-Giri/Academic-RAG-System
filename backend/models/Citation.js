import mongoose from "mongoose"

const citationSchema = new mongoose.Schema({
  citingPaper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Paper",
    required: true,
  },
  citedPaper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Paper",
    required: false, // Can be null for unmatched citations
  },
  context: {
    type: String,
    required: true,
  },
  citationType: {
    type: String,
    enum: ["direct", "indirect", "supportive", "contradictory", "methodological"],
    default: "direct",
  },
  section: {
    type: String,
    enum: ["introduction", "methodology", "results", "discussion", "conclusion", "references"],
  },
  sentiment: {
    type: String,
    enum: ["positive", "negative", "neutral"],
    default: "neutral",
  },
  strength: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5,
  },
  extractedAt: {
    type: Date,
    default: Date.now,
  },
  // For unmatched citations
  unmatchedCitation: {
    text: String,
    authors: [String],
    year: Number,
    journal: String,
    doi: String
  }
})

// Simple indexes without complex constraints
// We'll handle uniqueness at the application level
citationSchema.index({ citingPaper: 1 })
citationSchema.index({ citedPaper: 1 })
citationSchema.index({ citationType: 1 })
citationSchema.index({ sentiment: 1 })
citationSchema.index({ "unmatchedCitation.text": 1 })

export default mongoose.model("Citation", citationSchema)
