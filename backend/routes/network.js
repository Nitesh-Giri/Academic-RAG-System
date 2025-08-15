import express from "express"
const router = express.Router()
import networkController from "../controllers/networkController.js"
import Paper from "../models/Paper.js"
import Citation from "../models/Citation.js"

// Get network graph data for visualization
router.get("/graph", async (req, res) => {
  try {
    const maxNodes = Number.parseInt(req.query.maxNodes) || 100
    
    // Get papers and citations for network visualization
    const papers = await Paper.find().limit(maxNodes).select('_id title authors categories citationCount impactScore')
    const citations = await Citation.find().populate('citingPaper citedPaper', '_id title')
    
    // Create nodes from papers
    const nodes = papers.map(paper => ({
      id: paper._id.toString(),
      name: paper.title,
      citations: paper.citationCount,
      influence: paper.impactScore / 100, // Normalize to 0-1 range
      group: paper.categories && paper.categories.length > 0 ? paper.categories[0].length % 3 : 0, // Simple grouping
      authors: paper.authors?.map(a => a.name).join(', ') || 'Unknown'
    }))
    
    // Create links from citations
    const links = citations
      .filter(citation => citation.citingPaper && citation.citedPaper)
      .map(citation => ({
        source: citation.citingPaper._id.toString(),
        target: citation.citedPaper._id.toString(),
        strength: 0.5 + Math.random() * 0.5 // Random strength for visualization
      }))
      .slice(0, maxNodes * 2) // Limit edges
    
    res.json({
      nodes,
      links
    })
  } catch (error) {
    console.error("Error in /graph endpoint:", error)
    res.status(500).json({ error: error.message })
  }
})

// Get network statistics
router.get("/stats", async (req, res) => {
  try {
    const [totalPapers, totalCitations] = await Promise.all([
      Paper.countDocuments(),
      Citation.countDocuments()
    ])
    
    // Calculate basic network metrics
    const totalNodes = totalPapers
    const totalEdges = totalCitations
    const avgClustering = totalPapers > 0 ? 0.65 : 0 // Default clustering value
    const networkDensity = totalPapers > 1 ? totalEdges / (totalPapers * (totalPapers - 1)) : 0
    
    res.json({
      totalNodes,
      totalEdges,
      avgClustering,
      networkDensity: Math.min(networkDensity, 1) // Cap at 1
    })
  } catch (error) {
    console.error("Error in /stats endpoint:", error)
    res.status(500).json({ error: error.message })
  }
})

// Build citation network
router.post("/build", async (req, res) => {
  try {
    const options = req.body || {}
    const network = await networkController.buildCitationNetwork(options)
    res.json(network)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get network metrics
router.get("/metrics", async (req, res) => {
  try {
    const metrics = await networkController.calculateNetworkMetrics()
    res.json(metrics)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Identify seminal papers
router.get("/seminal", async (req, res) => {
  try {
    const options = {
      minCitations: Number.parseInt(req.query.minCitations) || 50,
      minAge: Number.parseInt(req.query.minAge) || 2,
      topN: Number.parseInt(req.query.topN) || 50,
    }

    const seminalPapers = await networkController.identifySeminalPapers(options)
    res.json(seminalPapers)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Analyze citation patterns
router.get("/patterns", async (req, res) => {
  try {
    const patterns = await networkController.analyzeCitationPatterns()
    res.json(patterns)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Export network data
router.get("/export", async (req, res) => {
  try {
    const format = req.query.format || "json"
    const networkData = networkController.exportNetworkData(format)

    if (format === "json") {
      res.json(networkData)
    } else {
      res.set({
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="citation_network.${format}"`,
      })
      res.send(networkData)
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get network visualization data
router.get("/visualization", async (req, res) => {
  try {
    const maxNodes = Number.parseInt(req.query.maxNodes) || 100
    const networkData = networkController.exportNetworkData("json")

    // Limit nodes for visualization
    const limitedNodes = networkData.nodes.slice(0, maxNodes)
    const nodeIds = new Set(limitedNodes.map((n) => n.id))
    const limitedEdges = networkData.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

    res.json({
      nodes: limitedNodes,
      edges: limitedEdges,
      metadata: {
        ...networkData.metadata,
        limited: true,
        originalNodeCount: networkData.nodes.length,
        originalEdgeCount: networkData.edges.length,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get paper influence analysis
router.get("/influence/:paperId", async (req, res) => {
  try {
    const paperId = req.params.paperId
    const metrics = await networkController.calculateNetworkMetrics()

    const influence = {
      paperId: paperId,
      inDegree: metrics.centrality.inDegree[paperId] || 0,
      outDegree: metrics.centrality.outDegree[paperId] || 0,
      authority: metrics.centrality.authority[paperId] || 0,
      betweenness: metrics.centrality.betweenness[paperId] || 0,
      clustering: metrics.clustering.local[paperId] || 0,
    }

    res.json(influence)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get research communities
router.get("/communities", async (req, res) => {
  try {
    const metrics = await networkController.calculateNetworkMetrics()
    res.json(metrics.communities)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
