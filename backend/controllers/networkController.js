import { Graph } from "graph-data-structure"
import Paper from "../models/Paper.js"
import Citation from "../models/Citation.js"
import ResearchTrend from "../models/ResearchTrend.js"

class CitationNetworkAnalysis {
  constructor() {
    this.graph = Graph()
    this.paperNodes = new Map()
    this.citationEdges = new Map()
    this.analysisCache = new Map()
    this.cacheTimeout = 3600000 // 1 hour
  }

  // Build citation network graph
  async buildCitationNetwork(options = {}) {
    const { categories = [], dateRange = null, minCitations = 0, maxNodes = 10000 } = options

    try {
      // Clear existing graph
      this.graph = Graph()
      this.paperNodes.clear()
      this.citationEdges.clear()

      // Build query filter
      const paperFilter = {}
      if (categories.length > 0) {
        paperFilter.categories = { $in: categories }
      }
      if (dateRange) {
        paperFilter.publishedDate = {
          $gte: new Date(dateRange.start),
          $lte: new Date(dateRange.end),
        }
      }
      if (minCitations > 0) {
        paperFilter.citationCount = { $gte: minCitations }
      }

      // Get papers
      const papers = await Paper.find(paperFilter)
        .populate("authors", "name affiliation")
        .limit(maxNodes)
        .sort({ citationCount: -1 })

      // Add nodes to graph
      for (const paper of papers) {
        const nodeId = paper._id.toString()
        this.graph.addNode(nodeId)
        this.paperNodes.set(nodeId, {
          id: nodeId,
          title: paper.title,
          authors: paper.authors,
          publishedDate: paper.publishedDate,
          citationCount: paper.citationCount,
          impactScore: paper.impactScore,
          categories: paper.categories,
          keywords: paper.keywords,
        })
      }

      // Get citations between these papers
      const paperIds = papers.map((p) => p._id)
      const citations = await Citation.find({
        citingPaper: { $in: paperIds },
        citedPaper: { $in: paperIds },
      }).populate("citingPaper citedPaper", "title authors")

      // Add edges to graph
      for (const citation of citations) {
        const sourceId = citation.citingPaper._id.toString()
        const targetId = citation.citedPaper._id.toString()

        if (this.graph.hasNode(sourceId) && this.graph.hasNode(targetId)) {
          this.graph.addEdge(sourceId, targetId)
          this.citationEdges.set(`${sourceId}-${targetId}`, {
            source: sourceId,
            target: targetId,
            citationType: citation.citationType,
            sentiment: citation.sentiment,
            strength: citation.strength,
            context: citation.context,
          })
        }
      }

      return {
        nodes: this.graph.nodes().length,
        edges: this.graph.edges().length,
        papers: Array.from(this.paperNodes.values()),
        citations: Array.from(this.citationEdges.values()),
      }
    } catch (error) {
      console.error("Error building citation network:", error)
      throw error
    }
  }

  // Calculate network metrics
  async calculateNetworkMetrics() {
    if (this.graph.nodes().length === 0) {
      throw new Error("Citation network not built. Call buildCitationNetwork first.")
    }

    const metrics = {
      basic: this.calculateBasicMetrics(),
      centrality: this.calculateCentralityMetrics(),
      clustering: this.calculateClusteringMetrics(),
      components: this.findConnectedComponents(),
      communities: await this.detectCommunities(),
    }

    return metrics
  }

  // Calculate basic network metrics
  calculateBasicMetrics() {
    const nodes = this.graph.nodes()
    const edges = this.graph.edges()

    const inDegrees = nodes.map((node) => this.graph.indegree(node))
    const outDegrees = nodes.map((node) => this.graph.outdegree(node))

    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      density: edges.length / (nodes.length * (nodes.length - 1)),
      avgInDegree: inDegrees.reduce((a, b) => a + b, 0) / nodes.length,
      avgOutDegree: outDegrees.reduce((a, b) => a + b, 0) / nodes.length,
      maxInDegree: Math.max(...inDegrees),
      maxOutDegree: Math.max(...outDegrees),
      degreeDistribution: this.calculateDegreeDistribution(inDegrees, outDegrees),
    }
  }

  // Calculate centrality metrics
  calculateCentralityMetrics() {
    const nodes = this.graph.nodes()
    const centrality = {}

    // In-degree centrality (citation count)
    centrality.inDegree = {}
    nodes.forEach((node) => {
      centrality.inDegree[node] = this.graph.indegree(node)
    })

    // Out-degree centrality (reference count)
    centrality.outDegree = {}
    nodes.forEach((node) => {
      centrality.outDegree[node] = this.graph.outdegree(node)
    })

    // Betweenness centrality (simplified)
    centrality.betweenness = this.calculateBetweennessCentrality()

    // PageRank-like authority score
    centrality.authority = this.calculateAuthorityScore()

    return centrality
  }

  // Calculate clustering metrics
  calculateClusteringMetrics() {
    const nodes = this.graph.nodes()
    const clustering = {}

    nodes.forEach((node) => {
      const neighbors = this.graph.adjacent(node)
      if (neighbors.length < 2) {
        clustering[node] = 0
        return
      }

      let triangles = 0
      const possibleTriangles = (neighbors.length * (neighbors.length - 1)) / 2

      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          if (this.graph.hasEdge(neighbors[i], neighbors[j]) || this.graph.hasEdge(neighbors[j], neighbors[i])) {
            triangles++
          }
        }
      }

      clustering[node] = triangles / possibleTriangles
    })

    const avgClustering = Object.values(clustering).reduce((a, b) => a + b, 0) / nodes.length

    return {
      local: clustering,
      global: avgClustering,
    }
  }

  // Find connected components
  findConnectedComponents() {
    const nodes = this.graph.nodes()
    const visited = new Set()
    const components = []

    const dfs = (node, component) => {
      visited.add(node)
      component.push(node)

      const neighbors = [...this.graph.adjacent(node), ...this.graph.adjacentReverse(node)]
      neighbors.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          dfs(neighbor, component)
        }
      })
    }

    nodes.forEach((node) => {
      if (!visited.has(node)) {
        const component = []
        dfs(node, component)
        components.push(component)
      }
    })

    return {
      count: components.length,
      sizes: components.map((c) => c.length),
      largest: Math.max(...components.map((c) => c.length)),
      components: components.sort((a, b) => b.length - a.length),
    }
  }

  // Detect research communities using modularity-based clustering
  async detectCommunities() {
    const nodes = this.graph.nodes()
    const communities = new Map()
    let communityId = 0

    // Simple community detection based on shared categories and citations
    const visited = new Set()

    for (const node of nodes) {
      if (visited.has(node)) continue

      const community = new Set([node])
      const queue = [node]
      visited.add(node)

      while (queue.length > 0) {
        const current = queue.shift()
        const currentPaper = this.paperNodes.get(current)

        // Find similar papers (same categories or high citation overlap)
        const neighbors = this.graph.adjacent(current)
        for (const neighbor of neighbors) {
          if (visited.has(neighbor)) continue

          const neighborPaper = this.paperNodes.get(neighbor)
          const similarity = this.calculatePaperSimilarity(currentPaper, neighborPaper)

          if (similarity > 0.3) {
            // Threshold for community membership
            community.add(neighbor)
            queue.push(neighbor)
            visited.add(neighbor)
          }
        }
      }

      if (community.size >= 3) {
        // Minimum community size
        communities.set(communityId++, Array.from(community))
      }
    }

    // Analyze communities
    const communityAnalysis = []
    for (const [id, members] of communities) {
      const memberPapers = members.map((nodeId) => this.paperNodes.get(nodeId))

      const analysis = {
        id: id,
        size: members.length,
        members: members,
        topCategories: this.getTopCategories(memberPapers),
        topKeywords: this.getTopKeywords(memberPapers),
        avgCitationCount: memberPapers.reduce((sum, p) => sum + p.citationCount, 0) / members.length,
        avgImpactScore: memberPapers.reduce((sum, p) => sum + p.impactScore, 0) / members.length,
        timeSpan: this.getTimeSpan(memberPapers),
        topPapers: memberPapers.sort((a, b) => b.impactScore - a.impactScore).slice(0, 5),
      }

      communityAnalysis.push(analysis)
    }

    return {
      count: communities.size,
      communities: communityAnalysis.sort((a, b) => b.size - a.size),
    }
  }

  // Calculate simplified betweenness centrality
  calculateBetweennessCentrality() {
    const nodes = this.graph.nodes()
    const betweenness = {}

    nodes.forEach((node) => {
      betweenness[node] = 0
    })

    // Simplified calculation - count how many shortest paths pass through each node
    nodes.forEach((source) => {
      nodes.forEach((target) => {
        if (source !== target) {
          const paths = this.findShortestPaths(source, target)
          paths.forEach((path) => {
            // Skip source and target
            for (let i = 1; i < path.length - 1; i++) {
              betweenness[path[i]]++
            }
          })
        }
      })
    })

    // Normalize
    const maxBetweenness = Math.max(...Object.values(betweenness))
    if (maxBetweenness > 0) {
      Object.keys(betweenness).forEach((node) => {
        betweenness[node] = betweenness[node] / maxBetweenness
      })
    }

    return betweenness
  }

  // Calculate authority score (PageRank-like)
  calculateAuthorityScore(iterations = 10, dampingFactor = 0.85) {
    const nodes = this.graph.nodes()
    const scores = {}
    const newScores = {}

    // Initialize scores
    nodes.forEach((node) => {
      scores[node] = 1.0 / nodes.length
    })

    // Iterate
    for (let iter = 0; iter < iterations; iter++) {
      nodes.forEach((node) => {
        newScores[node] = (1 - dampingFactor) / nodes.length
      })

      nodes.forEach((node) => {
        const outDegree = this.graph.outdegree(node)
        if (outDegree > 0) {
          const contribution = (dampingFactor * scores[node]) / outDegree
          this.graph.adjacent(node).forEach((neighbor) => {
            newScores[neighbor] += contribution
          })
        }
      })

      // Update scores
      Object.assign(scores, newScores)
    }

    return scores
  }

  // Find shortest paths between two nodes
  findShortestPaths(source, target, maxPaths = 3) {
    const paths = []
    const queue = [[source]]
    const visited = new Set()

    while (queue.length > 0 && paths.length < maxPaths) {
      const path = queue.shift()
      const current = path[path.length - 1]

      if (current === target) {
        paths.push(path)
        continue
      }

      if (path.length > 5) continue // Limit path length

      const pathKey = path.join("-")
      if (visited.has(pathKey)) continue
      visited.add(pathKey)

      this.graph.adjacent(current).forEach((neighbor) => {
        if (!path.includes(neighbor)) {
          queue.push([...path, neighbor])
        }
      })
    }

    return paths
  }

  // Calculate paper similarity
  calculatePaperSimilarity(paper1, paper2) {
    let similarity = 0

    // Category overlap
    const categories1 = new Set(paper1.categories)
    const categories2 = new Set(paper2.categories)
    const categoryOverlap = new Set([...categories1].filter((x) => categories2.has(x)))
    similarity += (categoryOverlap.size / Math.max(categories1.size, categories2.size)) * 0.4

    // Keyword overlap
    const keywords1 = new Set(paper1.keywords)
    const keywords2 = new Set(paper2.keywords)
    const keywordOverlap = new Set([...keywords1].filter((x) => keywords2.has(x)))
    similarity += (keywordOverlap.size / Math.max(keywords1.size, keywords2.size)) * 0.3

    // Author overlap
    const authors1 = new Set(paper1.authors.map((a) => a.name))
    const authors2 = new Set(paper2.authors.map((a) => a.name))
    const authorOverlap = new Set([...authors1].filter((x) => authors2.has(x)))
    similarity += (authorOverlap.size / Math.max(authors1.size, authors2.size)) * 0.3

    return similarity
  }

  // Get top categories from papers
  getTopCategories(papers) {
    const categoryCount = {}
    papers.forEach((paper) => {
      paper.categories.forEach((category) => {
        categoryCount[category] = (categoryCount[category] || 0) + 1
      })
    })

    return Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }))
  }

  // Get top keywords from papers
  getTopKeywords(papers) {
    const keywordCount = {}
    papers.forEach((paper) => {
      paper.keywords.forEach((keyword) => {
        keywordCount[keyword] = (keywordCount[keyword] || 0) + 1
      })
    })

    return Object.entries(keywordCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }))
  }

  // Get time span of papers
  getTimeSpan(papers) {
    const years = papers.map((paper) => paper.publishedDate.getFullYear())
    return {
      start: Math.min(...years),
      end: Math.max(...years),
      span: Math.max(...years) - Math.min(...years),
    }
  }

  // Calculate degree distribution
  calculateDegreeDistribution(inDegrees, outDegrees) {
    const inDegreeCount = {}
    const outDegreeCount = {}

    inDegrees.forEach((degree) => {
      inDegreeCount[degree] = (inDegreeCount[degree] || 0) + 1
    })

    outDegrees.forEach((degree) => {
      outDegreeCount[degree] = (outDegreeCount[degree] || 0) + 1
    })

    return {
      inDegree: inDegreeCount,
      outDegree: outDegreeCount,
    }
  }

  // Identify seminal papers using network analysis
  async identifySeminalPapers(options = {}) {
    const { minCitations = 50, minAge = 2, topN = 50 } = options

    if (this.graph.nodes().length === 0) {
      await this.buildCitationNetwork()
    }

    const metrics = await this.calculateNetworkMetrics()
    const seminalCandidates = []

    this.graph.nodes().forEach((nodeId) => {
      const paper = this.paperNodes.get(nodeId)
      const age = new Date().getFullYear() - paper.publishedDate.getFullYear()

      if (paper.citationCount >= minCitations && age >= minAge) {
        const inDegree = metrics.centrality.inDegree[nodeId]
        const authority = metrics.centrality.authority[nodeId]
        const betweenness = metrics.centrality.betweenness[nodeId]

        // Calculate seminal score
        const seminalScore =
          paper.citationCount * 0.3 +
          paper.impactScore * 0.2 +
          inDegree * 0.2 +
          authority * 100 * 0.2 +
          betweenness * 100 * 0.1

        seminalCandidates.push({
          paper: paper,
          seminalScore: seminalScore,
          networkMetrics: {
            inDegree: inDegree,
            authority: authority,
            betweenness: betweenness,
          },
        })
      }
    })

    // Sort by seminal score and return top N
    const seminalPapers = seminalCandidates.sort((a, b) => b.seminalScore - a.seminalScore).slice(0, topN)

    // Update database
    const seminalPaperIds = seminalPapers.map((sp) => sp.paper.id)
    await Paper.updateMany({ _id: { $in: seminalPaperIds } }, { isSeminal: true })

    return seminalPapers
  }

  // Analyze citation patterns
  async analyzeCitationPatterns() {
    if (this.graph.nodes().length === 0) {
      await this.buildCitationNetwork()
    }

    const patterns = {
      temporal: this.analyzeTemporalPatterns(),
      categorical: this.analyzeCategoricalPatterns(),
      geographical: await this.analyzeGeographicalPatterns(),
      sentiment: this.analyzeSentimentPatterns(),
    }

    return patterns
  }

  // Analyze temporal citation patterns
  analyzeTemporalPatterns() {
    const yearlyData = {}
    const citationLags = []

    this.citationEdges.forEach((edge) => {
      const sourcePaper = this.paperNodes.get(edge.source)
      const targetPaper = this.paperNodes.get(edge.target)

      const sourceYear = sourcePaper.publishedDate.getFullYear()
      const targetYear = targetPaper.publishedDate.getFullYear()

      // Count citations by year
      if (!yearlyData[sourceYear]) {
        yearlyData[sourceYear] = { citing: 0, cited: 0 }
      }
      if (!yearlyData[targetYear]) {
        yearlyData[targetYear] = { citing: 0, cited: 0 }
      }

      yearlyData[sourceYear].citing++
      yearlyData[targetYear].cited++

      // Calculate citation lag
      const lag = sourceYear - targetYear
      if (lag >= 0) {
        citationLags.push(lag)
      }
    })

    const avgCitationLag = citationLags.reduce((a, b) => a + b, 0) / citationLags.length

    return {
      yearlyData: yearlyData,
      avgCitationLag: avgCitationLag,
      citationLagDistribution: this.calculateDistribution(citationLags),
    }
  }

  // Analyze categorical citation patterns
  analyzeCategoricalPatterns() {
    const categoryMatrix = {}
    const crossDisciplinary = []

    this.citationEdges.forEach((edge) => {
      const sourcePaper = this.paperNodes.get(edge.source)
      const targetPaper = this.paperNodes.get(edge.target)

      sourcePaper.categories.forEach((sourceCategory) => {
        if (!categoryMatrix[sourceCategory]) {
          categoryMatrix[sourceCategory] = {}
        }

        targetPaper.categories.forEach((targetCategory) => {
          categoryMatrix[sourceCategory][targetCategory] = (categoryMatrix[sourceCategory][targetCategory] || 0) + 1

          // Identify cross-disciplinary citations
          if (sourceCategory !== targetCategory) {
            crossDisciplinary.push({
              from: sourceCategory,
              to: targetCategory,
              sourcePaper: sourcePaper.id,
              targetPaper: targetPaper.id,
            })
          }
        })
      })
    })

    return {
      categoryMatrix: categoryMatrix,
      crossDisciplinary: crossDisciplinary,
      crossDisciplinaryCount: crossDisciplinary.length,
    }
  }

  // Analyze geographical citation patterns
  async analyzeGeographicalPatterns() {
    // This would require author affiliation data with geographical information
    // For now, return placeholder
    return {
      message: "Geographical analysis requires enhanced author affiliation data",
      countryCitations: {},
      internationalCollaborations: 0,
    }
  }

  // Analyze sentiment patterns in citations
  analyzeSentimentPatterns() {
    const sentimentCount = { positive: 0, negative: 0, neutral: 0 }
    const sentimentByCategory = {}

    this.citationEdges.forEach((edge) => {
      const sentiment = edge.sentiment || "neutral"
      sentimentCount[sentiment]++

      const sourcePaper = this.paperNodes.get(edge.source)
      sourcePaper.categories.forEach((category) => {
        if (!sentimentByCategory[category]) {
          sentimentByCategory[category] = { positive: 0, negative: 0, neutral: 0 }
        }
        sentimentByCategory[category][sentiment]++
      })
    })

    return {
      overall: sentimentCount,
      byCategory: sentimentByCategory,
    }
  }

  // Calculate distribution of values
  calculateDistribution(values) {
    const distribution = {}
    values.forEach((value) => {
      distribution[value] = (distribution[value] || 0) + 1
    })
    return distribution
  }

  // Export network data for visualization
  exportNetworkData(format = "json") {
    const nodes = this.graph.nodes().map((nodeId) => ({
      id: nodeId,
      ...this.paperNodes.get(nodeId),
    }))

    const edges = this.graph.edges().map((edge) => ({
      source: edge.source,
      target: edge.target,
      ...this.citationEdges.get(`${edge.source}-${edge.target}`),
    }))

    const networkData = {
      nodes: nodes,
      edges: edges,
      metadata: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        generatedAt: new Date().toISOString(),
      },
    }

    switch (format) {
      case "json":
        return networkData
      case "gexf":
        return this.convertToGEXF(networkData)
      case "graphml":
        return this.convertToGraphML(networkData)
      default:
        return networkData
    }
  }

  // Convert to GEXF format (for Gephi)
  convertToGEXF(networkData) {
    // Simplified GEXF export
    let gexf = '<?xml version="1.0" encoding="UTF-8"?>\n'
    gexf += '<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">\n'
    gexf += '<graph mode="static" defaultedgetype="directed">\n'

    // Nodes
    gexf += "<nodes>\n"
    networkData.nodes.forEach((node) => {
      gexf += `<node id="${node.id}" label="${node.title.replace(/"/g, "&quot;")}">\n`
      gexf += "<attvalues>\n"
      gexf += `<attvalue for="citationCount" value="${node.citationCount}"/>\n`
      gexf += `<attvalue for="impactScore" value="${node.impactScore}"/>\n`
      gexf += "</attvalues>\n"
      gexf += "</node>\n"
    })
    gexf += "</nodes>\n"

    // Edges
    gexf += "<edges>\n"
    networkData.edges.forEach((edge, index) => {
      gexf += `<edge id="${index}" source="${edge.source}" target="${edge.target}"/>\n`
    })
    gexf += "</edges>\n"

    gexf += "</graph>\n"
    gexf += "</gexf>"

    return gexf
  }

  // Convert to GraphML format
  convertToGraphML(networkData) {
    // Simplified GraphML export
    let graphml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    graphml += '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n'
    graphml += '<graph id="CitationNetwork" edgedefault="directed">\n'

    // Nodes
    networkData.nodes.forEach((node) => {
      graphml += `<node id="${node.id}"/>\n`
    })

    // Edges
    networkData.edges.forEach((edge, index) => {
      graphml += `<edge id="e${index}" source="${edge.source}" target="${edge.target}"/>\n`
    })

    graphml += "</graph>\n"
    graphml += "</graphml>"

    return graphml
  }
}

export default new CitationNetworkAnalysis()
