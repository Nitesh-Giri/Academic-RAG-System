export function RecentPapers({ papers }) {
  if (!papers || papers.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No papers uploaded yet. Start by uploading your first research paper.</p>
      </div>
    )
  }

  const getPaperUrl = (paper) => {
    if (paper?.doi) {
      const doi = String(paper.doi).replace(/^doi:\s*/i, "").trim()
      return `https://doi.org/${doi}`
    }
    if (paper?.arxivId) {
      return `https://arxiv.org/abs/${paper.arxivId}`
    }
    const authorNames = (paper?.authors || []).map((a) => a?.name || a).filter(Boolean)
    const query = encodeURIComponent([paper?.title, ...authorNames].filter(Boolean).join(" "))
    return `https://scholar.google.com/scholar?q=${query}`
  }

  return (
    <div className="space-y-4">
      {papers.map((paper) => (
        <div key={paper._id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-medium text-slate-900 line-clamp-2">{paper.title}</h3>
              <p className="text-sm text-slate-600 mt-1">
                {paper.authors?.slice(0, 3).map((a) => a?.name || a).join(", ")}
                {paper.authors?.length > 3 && ` +${paper.authors.length - 3} more`}
              </p>
              <div className="flex items-center space-x-4 mt-2 text-xs text-slate-500">
                <div className="flex items-center space-x-1">
                  <span>{new Date(paper.publishedDate || paper.createdAt).getFullYear()}</span>
                </div>
                <span>{paper.citationCount || 0} citations</span>
              </div>
            </div>
            <a
              href={getPaperUrl(paper)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-slate-600 ml-4"
              title="Open paper"
            >
              →
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}
