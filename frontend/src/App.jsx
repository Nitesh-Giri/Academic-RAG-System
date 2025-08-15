import "./App.css"
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { Navigation } from "./components/Navigation"
import { Dashboard } from "./pages/Dashboard"
import { Upload } from "./pages/Upload"
import { Search } from "./pages/Search"
import { Network } from "./pages/Network"
import { Trends } from "./pages/Trends"

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-r from-black to-blue-950">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/search" element={<Search />} />
            <Route path="/network" element={<Network />} />
            <Route path="/trends" element={<Trends />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
