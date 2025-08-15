import mongoose from "mongoose"

const paperSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  authors: [
    {
      name: String,
      affiliation: String,
      email: String,
    },
  ],
  abstract: {
    type: String,
    required: false,
    default: "",
  },
  content: {
    type: String,
    required: true,
  },
  doi: {
    type: String,
    sparse: true,
  },
  arxivId: {
    type: String,
    sparse: true,
  },
  publishedDate: {
    type: Date,
    required: true,
  },
  journal: {
    name: String,
    volume: String,
    issue: String,
    pages: String,
  },
  keywords: [String],
  categories: [String],
  citationCount: {
    type: Number,
    default: 0,
  },
  references: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Paper",
    },
  ],
  citedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Paper",
    },
  ],
  embedding: {
    type: [Number],
    index: true,
  },
  chunks: [
    {
      text: String,
      type: {
        type: String,
        enum: ["title", "abstract", "content", "keywords"],
        default: "content",
      },
      section: String,
      chunkIndex: Number,
      embedding: [Number],
    },
  ],
  impactScore: {
    type: Number,
    default: 0,
  },
  hIndex: {
    type: Number,
    default: 0,
  },
  isSeminal: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

// Indexes for better query performance
paperSchema.index({ title: "text", abstract: "text", content: "text" })
paperSchema.index({ publishedDate: -1 })
paperSchema.index({ citationCount: -1 })
paperSchema.index({ impactScore: -1 })
paperSchema.index({ categories: 1 })
paperSchema.index({ keywords: 1 })

export default mongoose.model("Paper", paperSchema)
