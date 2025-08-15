import mongoose from "mongoose"

const researchTrendSchema = new mongoose.Schema({
  topic: {
    type: String,
    required: true,
    unique: true,
  },
  keywords: [String],
  categories: [String],
  paperCount: {
    type: Number,
    default: 0,
  },
  citationCount: {
    type: Number,
    default: 0,
  },
  averageImpact: {
    type: Number,
    default: 0,
  },
  growthRate: {
    type: Number,
    default: 0,
  },
  timeSeriesData: [
    {
      year: Number,
      paperCount: Number,
      citationCount: Number,
      averageImpact: Number,
    },
  ],
  topPapers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Paper",
    },
  ],
  emergingAuthors: [
    {
      name: String,
      paperCount: Number,
      citationCount: Number,
      hIndex: Number,
    },
  ],
  relatedTrends: [
    {
      topic: String,
      similarity: Number,
    },
  ],
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
})

// topic field already has unique: true which creates an index
researchTrendSchema.index({ growthRate: -1 })
researchTrendSchema.index({ averageImpact: -1 })

export default mongoose.model("ResearchTrend", researchTrendSchema)
