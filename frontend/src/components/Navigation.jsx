import { Link, useLocation } from "react-router-dom"

export function Navigation() {
  const location = useLocation()

  const navItems = [
    { path: "/", label: "Dashboard" },
    { path: "/upload", label: "Upload Papers" },
    { path: "/search", label: "Search & RAG" },
    { path: "/network", label: "Citation Network" },
    { path: "/trends", label: "Research Trends" },
  ]

  return (
    <nav className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 text-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-2">
            <h1 className="text-4xl font-serif font-extrabold text-slate-900">Academic RAG</h1>
          </div>

          <div className="flex space-x-1">
            {navItems.map(({ path, label, }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === path
                    ? "bg-primary-100 text-primary-700"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <span className="text-black">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}
