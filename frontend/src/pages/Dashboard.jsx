import { useState, useEffect } from "react"
import { SearchBar } from "../components/SearchBar"
import { StatsCard } from "../components/StatsCard"
import { RecentPapers } from "../components/RecentPapers"
import { TrendChart } from "../components/TrendChart"
import api from "../services/api"

export function Dashboard() {
  const [stats, setStats] = useState({
    totalPapers: 0,
    totalCitations: 0,
    researchAreas: 0,
    seminalWorks: 0,
  })
  const [recentPapers, setRecentPapers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsRes, papersRes] = await Promise.all([
          api.get("/papers/stats"),
          api.get("/papers?limit=5&sort=createdAt"),
        ])
        setStats(statsRes.data)
        setRecentPapers(papersRes.data.papers)
      } catch (error) {
        console.error("Error fetching dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-serif font-bold text-slate-900 bg-gradient-to-r from-blue-400 via-purple-400 to-rose-400 bg-clip-text text-transparent">Academic Research Intelligence</h1>
        <p className="text-lg text-white font-serif text-slate-600 max-w-2xl mx-auto">
          Discover connections, analyze trends, and explore the citation network of academic literature with AI-powered
          insights.
        </p>
      </div>

      {/* Search Bar */}
      <div className="max-w-2xl mx-auto">
        <SearchBar placeholder="Ask questions about research papers..." />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard title="Total Papers" value={stats.totalPapers.toLocaleString()} color="primary" />
        <StatsCard title="Citations" value={stats.totalCitations.toLocaleString()} color="accent" />
        <StatsCard title="Research Areas" value={stats.researchAreas} color="primary" />
        <StatsCard title="Seminal Works" value={stats.seminalWorks} color="accent" />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-serif font-semibold text-slate-900 mb-4">Recently Added Papers</h2>
          <RecentPapers papers={recentPapers} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-serif font-semibold text-slate-900 mb-4">Research Activity Trends</h2>
          <TrendChart />
        </div>
      </div>
    </div>
  )
}
