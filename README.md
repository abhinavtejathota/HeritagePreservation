# Global Heritage Preservation & Virtual Exploration Ecosystem

An end-to-end, multi-tiered AI and 3D Web Application suite dedicated to **World Cultural Heritage Preservation**, **Unsupervised Site Clustering & Recommender Systems**, **Multi-Agent Conversational AI Assistants**, and **Interactive WebGL 3D Virtual Exploration**.

---

## 📑 Table of Contents
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Module Breakdown](#-module-breakdown)
  - [1. Web Application (`Application/`)](#1-web-application-application)
  - [2. Multi-Agent & LLM Chatbots (`Chatbot/`)](#2-multi-agent--llm-chatbots-chatbot)
  - [3. Unsupervised Clustering & Recommender Engine (`Clustering/`)](#3-unsupervised-clustering--recommender-engine-clustering)
  - [4. Unity 3D Environment & WebGL Builds (`Environment/` & `WebGLBuilds/`)](#4-unity-3d-environment--webgl-builds-environment--webglbuilds)
  - [5. Datasets (`Dataset/`)](#5-datasets-dataset)
- [Project Directory Structure](#-project-directory-structure)
- [System Environment Variables & Port Map](#-system-environment-variables--port-map)
- [Getting Started & Running the Services](#-getting-started--running-the-services)
  - [1. Backend Service (`Application/backend`)](#1-backend-service-applicationbackend)
  - [2. Agent-Based Chatbot Service (`Chatbot/Agent-Based`)](#2-agent-based-chatbot-service-chatbotagent-based)
  - [3. Fallback Chatbot Service (`Chatbot/Api-Based`)](#3-fallback-chatbot-service-chatbotapi-based)
  - [4. Clustering API (`Clustering`)](#4-clustering-api-clustering)
  - [5. WebGL 3D Simulation Server (`WebGLBuilds`)](#5-webgl-3d-simulation-server-webglbuilds)
  - [6. Frontend Web App (`Application/frontend`)](#6-frontend-web-app-applicationfrontend)
- [Database Schema & Data Pipelines](#-database-schema--data-pipelines)
- [API Reference](#-api-reference)
- [Future Roadmap (`TODO.md`)](#-future-roadmap-todomd)

---

## 🏛 Architecture & Tech Stack

| Module | Core Technology Stack | Description |
| :--- | :--- | :--- |
| **Frontend** | React 19, TailwindCSS, React-Leaflet, Framer Motion | Dynamic dashboard, interactive spatial map visualization, themed exploration, and embedded 3D WebGL viewers. |
| **Backend** | Express 5, Node.js, PostgreSQL (`pg`) | RESTful API service managing heritage site metadata, spatial filtering, multi-value querying, user favorites, and cluster result logging. |
| **Agent Chatbot** | TypeScript, Node.js, Gemini API, Groq SDK, Compromise NLP | Domain-specialized multi-agent orchestrator (Architecture, Geo, Timeline, Monument, Civilization) with intent classification & scoring synthesis. |
| **Fallback Chatbot** | Python, FastAPI, Google GenAI SDK, Groq | Lightweight REST endpoint featuring prompt safety guardrails and automatic model fallback switching. |
| **ML Engine** | Python, FastAPI, Scikit-learn, Pandas, NumPy | Unsupervised heritage site similarity ranking & clustering using TF-IDF Cosine Similarity, K-Means, AGNES (Hierarchical), GMM, and MMR Multi-Signal Re-Ranking. |
| **3D Virtual Environments** | Unity 3D (URP), C#, WebGL | Interactive 1st-person virtual tours of reconstructed heritage sites (*Petra*, *Temple of the Winged Lions*, *Blue Pillar Chapel*, *The Nabataean Theatre*). |

---

## 🌐 System Environment Variables & Port Map

All services are configured to run locally across dedicated ports:

| Service Module | Location | Default Port | Environment File | Key Environment Variables |
| :--- | :--- | :--- | :--- | :--- |
| **Backend API** | `Application/backend/server/` | `5000` | `.env` | `PORT=5000`, `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_PORT` |
| **Agent Chatbot** | `Chatbot/Agent-Based/` | `5001` | `.env` | `PORT=5001`, `GROQ_API_KEY`, `GOOGLE_API_KEY`, `DB_*` |
| **Fallback Chatbot** | `Chatbot/Api-Based/` | `8001` | `.env` | `PORT=8001`, `GROQ_API_KEY`, `GOOGLE_API_KEY` |
| **Clustering Engine**| `Clustering/` | `8000` | `.env` | `PORT=8000`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` |
| **WebGL Server** | `WebGLBuilds/` | `8002` | N/A | Served via `http-server` or `npx serve -p 8002 --cors` |
| **Frontend UI** | `Application/frontend/` | `3000` | `.env` | `REACT_APP_API_URL=http://localhost:5000`<br>`REACT_APP_CHA_URL=http://localhost:5001/api`<br>`REACT_APP_GOG_URL=http://localhost:8001`<br>`REACT_APP_SIM_URL=http://localhost:8002` |

---

## 🎮 WebGL 3D Simulation Web Server

The application renders interactive 1st-person WebGL simulations for 4 major heritage sites:
- **Great Temple (Petra)** (`WebGLBuilds/Great_Temple_(Petra)/Buildv3/index.html`)
- **Temple of the Winged Lions** (`WebGLBuilds/Temple_of_the_Winged_Lions/Buildv3/index.html`)
- **Blue Pillar Chapel** (`WebGLBuilds/Blue_Pillar_Chapel/Buildv3/index.html`)
- **The Nabataean Theatre** (`WebGLBuilds/The_Nabataean_Theatre/Buildv3/index.html`)

To serve the WebGL builds so the React frontend can load them inside iframes, launch a static web server on port `8002`:

```bash
cd WebGLBuilds
npx serve -p 8002 --cors
# OR using http-server:
# npx http-server -p 8002 --cors
```

---

## ⚙️ Getting Started & Running the Services

### Prerequisites
- **Node.js** (v18.x or later)
- **Python** (v3.9 or later)
- **PostgreSQL / Supabase instance**

---

### 1. Backend Service (`Application/backend`)
```bash
cd Application/backend
npm install
node server/index.js
```

### 2. Agent-Based Chatbot Service (`Chatbot/Agent-Based`)
```bash
cd Chatbot/Agent-Based
npm install
npm run build
npm start
```

### 3. Fallback Chatbot Service (`Chatbot/Api-Based`)
```bash
cd Chatbot/Api-Based
pip install fastapi uvicorn google-genai groq python-dotenv pydantic
python app.py
```

### 4. Clustering API (`Clustering`)
```bash
cd Clustering
pip install fastapi uvicorn scikit-learn pandas numpy psycopg2-binary python-dotenv
python app.py
```

### 5. WebGL 3D Simulation Server (`WebGLBuilds`)
```bash
cd WebGLBuilds

# Option A: Using Python http.server
python -m http.server 8002

# Option B: Using Node serve
npx serve -p 8002 --cors
```

### 6. Frontend Web App (`Application/frontend`)
```bash
cd Application/frontend
npm install
npm start
```
*Access the web app in your browser at `http://localhost:3000`.*

---

## 📁 Project Directory Structure

```
├── Application/                        # Full-Stack Web Platform
│   ├── backend/                        # Express API & Postgres Integration
│   │   └── server/                     # index.js API routes & db.js connection
│   └── frontend/                       # React 19 SPA Frontend
│       ├── public/sites/               # Heritage site images
│       └── src/                        # React Components, Dashboard, Map, Pages
├── Chatbot/                            # AI Conversational Services
│   ├── Agent-Based/                    # Multi-Agent TypeScript System
│   │   └── src/                        # Agents, NLP Extractor, Orchestrator, Repository
│   └── Api-Based/                      # Lightweight FastAPI LLM Fallback Service
├── Clustering/                         # Unsupervised Machine Learning Engine
│   ├── app.py                          # FastAPI endpoint for site recommendation
│   ├── utils.py                        # Clustering & similarity computations
│   ├── db.py / query.py                # PostgreSQL persistence for recommendations
│   └── Grouping.ipynb                  # ML Analysis & Model Training Notebook
├── Dataset/                            # Heritage Sites CSV Datasets
│   ├── heritage_sites_v1.csv
│   └── heritage_sites_v2.csv
├── Environment/                        # Unity 3D Environment Source
│   └── My project/                     # Unity Assets, Scenes, Scripts & Render Settings
├── WebGLBuilds/                        # Compiled WebGL 3D Interactive Builds
└── TODO.md                             # Research & Development Plan
```

---

## 📊 Database Schema & Data Pipelines

The system utilizes PostgreSQL / Supabase for site persistence and ML recommendation history:
- **`heritage_sites` Table**: Stores structured attributes (site name, coordinates, era, civilization, material, structure, preservation rank, popularity rank).
- **`site_similarity` Table**: Records similarity outputs generated by `/get-similarity`:
  - `site_name` (Text)
  - `top_5_kmeans` (JSONB)
  - `top_5_agnes` (JSONB)
  - `top_5_gmm` (JSONB)
  - `top_5_similar` (JSONB)

---

## 🔌 API Reference

### Express Backend (`Application/backend/server/index.js` - Port 5000)
- `GET /` - Health check endpoint.
- `GET /api/sites` - Retrieves all heritage sites with spatial & category metadata.
- `GET /api/sites/:name/similar` - Fetches similarity recommendations logged in database.

### Clustering API (`Clustering/app.py` - Port 8000)
- `POST /get-similarity`
  - **Payload**: `{ "site_name": "Great Temple (Petra)" }`
  - **Returns**: Top 5 similar sites grouped across 4 clustering algorithms + MMR Multi-Signal Re-Ranker.

### Agent Chatbot API (`Chatbot/Agent-Based/` - Port 5001)
- `POST /api/chat`
  - **Payload**: `{ "query": "Tell me about the architecture of Petra" }`
  - **Returns**: Synthesized response from specialized sub-agents with confidence scores.
