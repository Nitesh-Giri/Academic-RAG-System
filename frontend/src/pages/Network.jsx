"use client"

import { useState, useEffect } from "react"
import ForceGraph2D from "react-force-graph-2d"
import api from "../services/api"

export function Network() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [networkStats, setNetworkStats] = useState({})

  useEffect(() => {
    const fetchNetworkData = async () => {
      try {
        const [graphRes, statsRes] = await Promise.all([api.get("/network/graph"), api.get("/network/stats")])

        setGraphData(graphRes.data)
        setNetworkStats(statsRes.data)
      } catch (error) {
        console.error("Error fetching network data:", error)
        // Set empty data on error - let the UI handle empty states
        setGraphData({ nodes: [], links: [] })
        setNetworkStats({
          totalNodes: 0,
          totalEdges: 0,
          avgClustering: 0,
          networkDensity: 0,
        })
      } finally {
        setLoading(false)
      }
    }

    fetchNetworkData()
  }, [])

  const handleNodeClick = (node) => {
    setSelectedNode(node)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-serif font-bold text-slate-900 bg-gradient-to-r from-blue-400 via-purple-400 to-rose-400 bg-clip-text text-transparent">Citation Network Analysis</h1>
        <p className="text-slate-600 text-white font-serif">
          Explore the interconnected web of academic research and discover influential papers
        </p>
      </div>

      {/* Network Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-slate-600">Total Papers</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1">{networkStats.totalNodes || 0}</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-slate-600">Connections</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1">{networkStats.totalEdges || 0}</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-slate-600">Clustering</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {Math.round((networkStats.avgClustering || 0) * 100)}%
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-slate-600">Density</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {Math.round((networkStats.networkDensity || 0) * 100)}%
          </p>
        </div>
      </div>

      {/* Network Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Interactive Citation Network</h2>
            <div className="h-96 border border-slate-200 rounded-lg">
              {graphData.nodes.length > 0 ? (
                <ForceGraph2D
                  nodes={graphData.nodes}
                  links={graphData.links}
                  nodeLabel="name"
                  nodeColor={(node) => {
                    const colors = ["#0ea5e9", "#d97706", "#059669", "#dc2626", "#7c3aed"]
                    return colors[node.group % colors.length]
                  }}
                  nodeVal={(node) => node.citations / 10}
                  linkColor={() => "#94a3b8"}
                  linkWidth={(link) => link.strength * 3}
                  onNodeClick={handleNodeClick}
                  backgroundColor="#f8fafc"
                  width={600}
                  height={384}
                  enableNodeDrag={true}
                  enableZoomInteraction={true}
                  enablePanInteraction={true}
                  cooldownTicks={100}
                  nodeRelSize={6}
                  linkRelSize={2}
                  d3Force="charge"
                  d3ForceStrength={-400}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-slate-500">
                    <span className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                    <p className="text-lg font-medium">No network data available</p>
                    <p className="text-sm">Upload papers with citations to see the citation network</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {selectedNode ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Paper Details</h3>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-slate-900">{selectedNode.name}</h4>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Citations:</span>
                  <span className="font-medium">{selectedNode.citations}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Influence Score:</span>
                  <span className="font-medium">{Math.round(selectedNode.influence * 100)}%</span>
                </div>
                <div className="pt-2">
                  <div className="bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full"
                      style={{ width: `${selectedNode.influence * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Network Insights</h3>
              <p className="text-slate-600 text-sm">
                Click on any node in the network to explore paper details and citation relationships. The size of each
                node represents citation count, while colors indicate research clusters.
              </p>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Legend</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-primary-600"></div>
                <span className="text-slate-600">Natural Language Processing</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-accent-600"></div>
                <span className="text-slate-600">Computer Vision</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-green-600"></div>
                <span className="text-slate-600">Machine Learning</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
