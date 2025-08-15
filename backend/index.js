import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import connectDB from "./config/config.js"
import paperRoutes from "./routes/papers.js"
import citationRoutes from "./routes/citations.js"
import searchRoutes from "./routes/search.js"
import trendsRoutes from "./routes/trends.js"
import uploadRoutes from "./routes/upload.js"
import ragRoutes from "./routes/rag.js"
import networkRoutes from "./routes/network.js"
import path from "path"

// Load environment variables
dotenv.config()

const app = express()
const port = process.env.PORT || 8008

// Middleware
app.use(cors())
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Connect to database
connectDB()

const _dirname = path.resolve()


// Routes
app.use("/api/papers", paperRoutes)
app.use("/api/citations", citationRoutes)
app.use("/api/search", searchRoutes)
app.use("/api/trends", trendsRoutes)
app.use("/api/upload", uploadRoutes)
app.use("/api/rag", ragRoutes)
app.use("/api/network", networkRoutes)

app.use(express.static(path.join(_dirname, "/frontend/dist")));
app.get("*", (_, res) => {
  res.sendFile(path.resolve(_dirname, "frontend", "dist", "index.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: "Something went wrong!" })
})

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
