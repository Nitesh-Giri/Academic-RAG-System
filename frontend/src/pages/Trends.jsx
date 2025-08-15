"use client"

import { useState, useEffect } from "react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Pie,
} from "recharts"
import api from "../services/api"

export function Trends() {
  const [timelineData, setTimelineData] = useState([])
  const [topicsData, setTopicsData] = useState([])
  const [authorsData, setAuthorsData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTrendsData = async () => {
      try {
        const [timelineRes, topicsRes, authorsRes] = await Promise.all([
          api.get("/trends/publication-timeline"),
          api.get("/trends/research-topics"),
          api.get("/trends/top-authors"),
        ])

        setTimelineData(timelineRes.data)
        setTopicsData(topicsRes.data)
        setAuthorsData(authorsRes.data)
      } catch (error) {
        console.error("Error fetching trends data:", error)
        // Set empty data on error - let the UI handle empty states
        setTimelineData([])
        setTopicsData([])
        setAuthorsData([])
      } finally {
        setLoading(false)
      }
    }

    fetchTrendsData()
  }, [])

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
        <h1 className="text-3xl font-serif font-bold text-slate-900 bg-gradient-to-r from-blue-400 via-purple-400 to-rose-400 bg-clip-text text-transparent">Research Trends & Analytics</h1>
        <p className="text-slate-600 text-white font-serif">
          Discover emerging patterns, influential authors, and evolving research landscapes
        </p>
      </div>

      {/* Publication Timeline */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center space-x-2 mb-6">
          <h2 className="text-xl font-serif font-semibold text-slate-900">Publication Timeline</h2>
        </div>
        <div className="h-80">
          {timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="papers"
                  stroke="#0ea5e9"
                  strokeWidth={3}
                  dot={{ fill: "#0ea5e9", r: 5 }}
                  name="Papers Published"
                />
                <Line
                  type="monotone"
                  dataKey="citations"
                  stroke="#d97706"
                  strokeWidth={3}
                  dot={{ fill: "#d97706", r: 5 }}
                  name="Total Citations"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-slate-500">
                <p className="text-lg font-medium">No publication data available</p>
                <p className="text-sm">Upload some research papers to see publication trends</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Research Topics and Top Authors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Research Topics */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center space-x-2 mb-6">
            <h2 className="text-xl font-serif font-semibold text-slate-900">Research Topics</h2>
          </div>
          <div className="h-80">
            {topicsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={topicsData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="papers"
                    label={({ topic, papers }) => `${topic}: ${papers}`}
                  >
                    {topicsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-slate-500">
                  <p className="text-lg font-medium">No research topics available</p>
                  <p className="text-sm">Upload papers with categories to see topic distribution</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Authors */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center space-x-2 mb-6">
            <h2 className="text-xl font-serif font-semibold text-slate-900">Most Influential Authors</h2>
          </div>
          <div className="space-y-4">
            {authorsData.length > 0 ? (
              authorsData.map((author, index) => (
                <div key={index} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="bg-primary-100 text-primary-600 rounded-full w-8 h-8 flex items-center justify-center font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-medium text-slate-900">{author.name}</h3>
                      <p className="text-sm text-slate-600">
                        {author.papers} papers • {author.citations} citations • h-index: {author.hIndex}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="bg-slate-200 rounded-full h-2 w-20">
                      <div
                        className="bg-primary-600 h-2 rounded-full"
                        style={{ width: `${(author.citations / 400) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-slate-500 py-8">
                <p className="text-lg font-medium">No author data available</p>
                <p className="text-sm">Upload papers with author information to see rankings</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Research Topics Bar Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center space-x-2 mb-6">
          <h2 className="text-xl font-serif font-semibold text-slate-900">Papers by Research Area</h2>
        </div>
        <div className="h-80">
          {topicsData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topicsData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="topic" stroke="#64748b" fontSize={12} angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Bar dataKey="papers" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-slate-500">
                <p className="text-lg font-medium">No research area data available</p>
                <p className="text-sm">Upload papers with categories to see area distribution</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
