# Academic RAG System

<h4>Here you go: <a href="https://academic-rag-system.onrender.com/" target="_blank" rel="noopener noreferrer">Visit site</a></h4>

An end‑to‑end academic research assistant that ingests research papers, extracts citations and metadata, builds a citation network, computes research trends, and provides an AI-powered RAG (Retrieval-Augmented Generation) interface to query your collection.

## Features
- Paper upload (single, batch, and by URL) with text extraction and metadata parsing
- Robust citation extraction (APA, IEEE, Harvard, Vancouver, DOI, arXiv, author-year, year-only)
- Citation linking to known papers and storage of unmatched citations
- Research trends: counts, growth, top papers, emerging authors (by category/keyword/global)
- Citation network graph and stats
- RAG API for AI answers grounded in uploaded papers
- Modern frontend (React + Vite + Tailwind) with dashboard, search, trends, network views

## Tech Stack
- Backend: Node.js, Express, MongoDB/Mongoose
- Frontend: React, Vite, Tailwind CSS, Recharts, react-force-graph-2d
- AI/RAG: Google Generative AI (Gemini)

## Monorepo Structure
```
Academic-RAG-System/
  backend/                   # Express API + Mongoose models + controllers
  frontend/                  # React UI (Vite)
```

## Prerequisites
- Node.js 18+ and npm
- MongoDB 5+ (local or Atlas)
- (Optional) Google Generative AI key for RAG: https://aistudio.google.com

## Backend Setup
1) Create environment file `backend/.env`:
```
MONGODB_URI=mongodb://localhost:27017/academic_rag
PORT=8008
# Optional for RAG
GEMINI_API_KEY=YOUR_API_KEY
NODE_ENV=development
```

2) Install and run the backend:
```
cd backend
npm install
npm run dev   # or: npm start
```
The API will start at `https://academic-rag-system.onrender.com`.

## Frontend Setup
1) Install and run the frontend:
```
cd frontend
npm install
npm run dev
```
The app will start via Vite (usually `http://localhost:5173`).

Frontend uses `frontend/src/services/api.js`:
- In development it points to `https://academic-rag-system.onrender.com/api`
- In production it uses `/api`

## Core API Endpoints
Base URL: `https://academic-rag-system.onrender.com/api`

- Papers
  - `GET /papers` – list papers
  - `GET /papers/:id` – get a paper
  - `GET /papers/stats` – basic counts
- Upload
  - `POST /upload` – single file (form field: `paper`)
  - `POST /upload/batch` – multiple files (form field: `papers[]` up to 10)
  - `POST /upload/url` – upload from a URL `{ url, metadata }`
- Search & RAG
  - `POST /search` – `{ query, type: "semantic" | "keyword" }`
  - `POST /rag/query` – `{ query }` (requires `GEMINI_API_KEY`)
- Citations
  - `GET /citations/:paperId` – citations for a paper
- Trends
  - `GET /trends/publication-timeline`
  - `GET /trends/research-topics`
  - `GET /trends/top-authors`
- Network
  - `GET /network/graph`
  - `GET /network/stats`

### Example: upload a PDF via cURL
```
curl -X POST https://academic-rag-system.onrender.com/api/upload \
  -F "paper=@/absolute/path/to/paper.pdf"
```

### Example: upload by URL
```
curl -X POST https://academic-rag-system.onrender.com/api/upload/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://arxiv.org/pdf/1234.56789.pdf", "metadata": {"categories": ["NLP"], "keywords": ["LLM"]}}'
```

## How It Works (high level)
1) Upload pipeline extracts text, metadata, keywords, chunks, and embeddings
2) Citations are parsed and matched to known papers when possible; unmatched citations are stored
3) Research trends are updated for categories, keywords, and overall stats
4) Network endpoints expose a citation graph; frontend renders an interactive view
5) RAG endpoint uses embeddings + Gemini to answer queries grounded in uploaded content

## Environment Variables
- `MONGODB_URI` (required): MongoDB connection string
- `PORT` (optional, default 8008): backend port
- `GEMINI_API_KEY` (optional): enables `/api/rag/query`
- `NODE_ENV` (optional): `development` or `production`

## Troubleshooting
- MongoDB connection errors: verify `MONGODB_URI` and that MongoDB is running/reachable
- CORS/Network: ensure frontend uses `https://academic-rag-system.onrender.com/api` in dev (default in `api.js`)
- Upload fails: PDF may be corrupted/password-protected; check server logs for details
- RAG errors: ensure `GEMINI_API_KEY` is set; requests may be rate-limited

## Scripts
Backend `package.json`:
- `npm run dev` – start with nodemon
- `npm start` – start server

Frontend `package.json`:
- `npm run dev` – Vite dev server
- `npm run build` – production build
- `npm run preview` – preview build

## License
Copyright (c) 2025 Nitesh Giri. All rights reserved.
