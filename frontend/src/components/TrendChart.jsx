"use client"

import { useState, useEffect } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import api from "../services/api"

export function TrendChart() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTrendData = async () => {
      try {
        const response = await api.get("/trends/publication-timeline")
        setData(response.data)
      } catch (error) {
        console.error("Error fetching trend data:", error)
        // Set empty data on error - let the UI handle empty states
        setData([])
      } finally {
        setLoading(false)
      }
    }

    fetchTrendData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="h-64">
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
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
            <Line type="monotone" dataKey="papers" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: "#0ea5e9", r: 4 }} />
            <Line type="monotone" dataKey="citations" stroke="#d97706" strokeWidth={2} dot={{ fill: "#d97706", r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-slate-500">
            <div className="w-12 h-12 mx-auto mb-4 bg-slate-200 rounded-lg flex items-center justify-center">
              <div className="w-8 h-8 bg-slate-300 rounded"></div>
            </div>
            <p className="text-sm font-medium">No trend data available</p>
            <p className="text-xs">Upload papers to see publication trends</p>
          </div>
        </div>
      )}
    </div>
  )
}
