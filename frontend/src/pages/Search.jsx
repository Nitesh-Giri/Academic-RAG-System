"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import api from "../services/api"

export function Search() {
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get("q") || "")
  const [results, setResults] = useState([])
  const [ragResponse, setRagResponse] = useState("")
  const [loading, setLoading] = useState(false)
  const [searchType, setSearchType] = useState("semantic")

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    try {
      const [searchRes, ragRes] = await Promise.all([
        api.post("/search", { query, type: searchType }),
        api.post("/rag/query", { query }),
      ])

      const searchResults = searchRes.data.results || []
      const ragResponse = ragRes.data.response || ""
      
      setResults(searchResults)
      
      // Only show RAG response if we have results, otherwise show the "no papers" message
      if (searchResults.length > 0) {
        setRagResponse(ragResponse)
      } else {
        setRagResponse("I couldn't find any relevant papers in the database for your query. This could be because: 1. No papers have been uploaded yet 2. The search terms don't match any available content 3. The papers don't have the information you're looking for Try: - Using different search terms - Uploading more research papers - Checking if the papers contain the information you need")
      }
    } catch (error) {
      console.error("Search error:", error)
      setResults([])
      setRagResponse("An error occurred while searching. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (searchParams.get("q")) {
      handleSearch({ preventDefault: () => {} })
    }
  }, [searchParams])

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Search Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-serif font-bold text-slate-900 bg-gradient-to-r from-blue-400 via-purple-400 to-rose-400 bg-clip-text text-transparent">Intelligent Research Search</h1>
        <p className="text-slate-600 text-white font-serif">Search through academic papers with AI-powered semantic understanding</p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask questions about research or search for specific papers..."
            className="w-full pl-6 pr-4 py-4 text-lg border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white shadow-sm"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                value="semantic"
                checked={searchType === "semantic"}
                onChange={(e) => setSearchType(e.target.value)}
                className="text-primary-600"
              />
              <span className="text-sm text-white font-serif text-slate-700">Semantic Search</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                value="keyword"
                checked={searchType === "keyword"}
                onChange={(e) => setSearchType(e.target.value)}
                className="text-primary-600"
              />
              <span className="text-sm text-white font-serif text-slate-700">Keyword Search</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg flex items-center space-x-2 transition-colors"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <span>Search</span>
            )}
          </button>
        </div>
      </form>

      {/* RAG Response */}
      {ragResponse && (
        <div className="bg-gradient-to-r from-primary-50 to-accent-50 rounded-xl p-6 border border-primary-200">
          <div className="flex items-start space-x-3">
            <div className="bg-primary-600 rounded-full p-2">
              {/* Removed Sparkles icon */}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900 mb-2">AI Research Assistant</h3>
              <p className="text-slate-700 leading-relaxed">{ragResponse}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search Results */}
      {results.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl text-white font-serif font-semibold text-slate-900">Found {results.length} relevant papers</h2>

          <div className="space-y-4">
            {results.map((paper, index) => (
              <div key={paper._id || index} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-900 leading-tight">{paper.title}</h3>

                  <div className="flex items-center space-x-4 text-sm text-slate-600">
                    <div className="flex items-center space-x-1">
                      {/* Removed Users icon */}
                      <span>
                        {paper.authors && Array.isArray(paper.authors) && paper.authors.length > 0
                          ? paper.authors.slice(0, 3).map(author => 
                              typeof author === 'object' ? author.name : author
                            ).join(", ")
                          : "Unknown Author"}
                      </span>
                      {paper.authors && Array.isArray(paper.authors) && paper.authors.length > 3 && (
                        <span>+{paper.authors.length - 3} more</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      {/* Removed Calendar icon */}
                      <span>{new Date(paper.publishedDate || paper.createdAt).getFullYear()}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      {/* Removed BookOpen icon */}
                      <span>{paper.citationCount || 0} citations</span>
                    </div>
                  </div>

                  {paper.abstract && (
                    <p className="text-slate-700 leading-relaxed line-clamp-3">
                      {paper.abstract.length > 200 
                        ? paper.abstract.substring(0, 200) + "..." 
                        : paper.abstract}
                    </p>
                  )}

                  {paper.keywords && paper.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {paper.keywords.slice(0, 5).map((keyword, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}

                  {paper.similarity && (
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-500">Relevance:</span>
                      <div className="bg-slate-200 rounded-full h-2 w-24">
                        <div
                          className="bg-primary-600 h-2 rounded-full"
                          style={{ width: `${paper.similarity * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-slate-500">{Math.round(paper.similarity * 100)}%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {!loading && query && results.length === 0 && (
        <div className="text-center py-12">
          {/* Removed BookOpen icon */}
          <h3 className="text-lg font-medium text-slate-900 mb-2">No papers found</h3>
          <p className="text-slate-600">
            Try adjusting your search terms or upload more papers to expand the database.
          </p>
        </div>
      )}
    </div>
  )
}
