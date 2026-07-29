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
- [Getting Started & Installation](#-getting-started--installation)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Chatbot Services Setup](#chatbot-services-setup)
  - [Clustering API Setup](#clustering-api-setup)
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
| **ML Engine** | Python, FastAPI, Scikit-learn, Pandas, NumPy | Unsupervised heritage site similarity ranking & clustering using TF-IDF Cosine Similarity, K-Means, AGNES (Hierarchical), and GMM. |
| **3D Virtual Environments** | Unity 3D (URP), C#, WebGL | Interactive 1st-person virtual tours of reconstructed heritage sites (e.g., Petra, Winged Lions Temple, Blue Pillar Chapel, Nabataean Theatre). |

---

## 🔎 Module Breakdown

### 1. Web Application (`Application/`)
- **`Application/frontend/`**:
  - Built with React 19 & TailwindCSS.
  - Interactive world map powered by `Leaflet` / `react-leaflet` showing exact geospatial site markers.
  - Dedicated pages for **Continent Exploration**, **Themes & Filtered Categorization** (Era, Architecture, Material, Religion, Structure), and **Interactive 3D Virtual Tours**.
  - Embedded AI Chatbot interface drawer (`Chatbot.js`).
- **`Application/backend/server/`**:
  - Express.js backend handling API requests.
  - Contains database querying logic (`db.js`), theme mapping constants, multi-value column parsing, and custom mappings for featured lists (e.g., *Wonders of the World*, *Sacred Spaces*, *Lost Civilizations*).

### 2. Multi-Agent & LLM Chatbots (`Chatbot/`)
- **Agent-Based Architecture (`Chatbot/Agent-Based/`)**:
  - Modular multi-agent network orchestrated via an **Intent Classifier** and **Response Synthesizer**.
  - **Specialized Domain Agents**:
    - `architecture.agent.ts`: Analyzes architectural styles, construction materials, and structural types.
    - `civilization.agent.ts`: Handles inquiries regarding historical empires and cultural civilizations.
    - `geo.agent.ts`: Manages spatial, regional, continent, and country location queries.
    - `monument.agent.ts`: Provides historical significance, preservation status, and site facts.
    - `timeline.agent.ts`: Processes chronologies, historical eras, and construction timeframes.
  - Employs **Compromise NLP** for entity extraction, normalization, and confidence scoring.
- **API-Based Fallback Server (`Chatbot/Api-Based/`)**:
  - FastAPI service wrapping `gemini-2.5-flash-lite` and `llama-3.3-70b-versatile`.
  - Built-in prompt sanitization, rate-limit resilience, and automatic fallback switching to Groq upon Gemini quota exhaustion.

### 3. Unsupervised Clustering & Recommender Engine (`Clustering/`)
- **Multi-Algorithm Recommender**: Computes heritage site similarities using 4 distinct models:
  1. **TF-IDF Vector Space + Cosine Similarity**: Textual/feature matrix similarity.
  2. **K-Means Clustering**: Partition-based site grouping.
  3. **AGNES (Agglomerative Nesting)**: Hierarchical bottom-up clustering.
  4. **GMM (Gaussian Mixture Models)**: Soft probabilistic cluster assignments.
- **Database Synchronization**: Logs searched queries and model recommendation outputs directly into the PostgreSQL database (`INSERT_SIMILARITY`).

### 4. Unity 3D Environment & WebGL Builds (`Environment/` & `WebGLBuilds/`)
- **Unity Project (`Environment/My project/`)**:
  - Universal Render Pipeline (URP) customized setup for PC & Mobile rendering.
  - Standard FPS controls (`PlayerMovement.cs`, `MouseLook.cs`).
  - High-fidelity 3D models (`.fbx`), materials (`.mat`), and texture maps for key heritage sites.
- **WebGL Deployments (`WebGLBuilds/`)**:
  - Compiled WebGL distributions ready for browser embedding:
    - *Blue Pillar Chapel*
    - *Great Temple (Petra)*
    - *Temple of the Winged Lions*
    - *The Nabataean Theatre*

### 5. Datasets (`Dataset/`)
- `heritage_sites_v1.csv` & `heritage_sites_v2.csv`: Core datasets detailing site names, geographical coordinates (Latitude/Longitude), continent, country, civilization, era, architectural styles, construction materials, structural types, preservation status, and popularity ranks.

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
├── Environment/                        # Unity 3D Environment Source (Ignored)
│   └── My project/                     # Unity Assets, Scenes, Scripts & Render Settings
├── WebGLBuilds/                        # Compiled WebGL 3D Interactive Builds (Ignored)
└── TODO.md                             # Research & Development Plan
```

---

## ⚙️ Getting Started & Installation

### Prerequisites
- **Node.js** (v18.x or later)
- **Python** (v3.9 or later)
- **PostgreSQL** (v14.x or later)

---

### Backend Setup (`Application/backend`)

1. Install dependencies:
   ```bash
   cd Application/backend
   npm install
   ```
2. Configure `.env` in `Application/backend/server/.env`:
   ```env
   PORT=5000
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=heritage_db
   ```
3. Start the server:
   ```bash
   node server/index.js
   ```

---

### Frontend Setup (`Application/frontend`)

1. Install dependencies:
   ```bash
   cd Application/frontend
   npm install
   ```
2. Launch development application:
   ```bash
   npm start
   ```
   *Access application at `http://localhost:3000`.*

---

### Chatbot Services Setup (`Chatbot/`)

#### Running Multi-Agent TypeScript Server
```bash
cd Chatbot/Agent-Based
npm install
# Build & start server
npm run build
npm start
```
*Configure `Chatbot/Agent-Based/.env` with `GEMINI_API_KEY`, `GROQ_API_KEY`, and `DATABASE_URL`.*

#### Running FastAPI Fallback Server
```bash
cd Chatbot/Api-Based
pip install fastapi uvicorn google-genai groq python-dotenv pydantic
python app.py
```

---

### Clustering API Setup (`Clustering/`)

1. Install Python ML dependencies:
   ```bash
   cd Clustering
   pip install fastapi uvicorn scikit-learn pandas numpy psycopg2-binary
   ```
2. Launch FastAPI service:
   ```bash
   python app.py
   ```
   *Service accessible at `http://localhost:8000`.*

---

## 📊 Database Schema & Data Pipelines

The system utilizes PostgreSQL for site persistence and ML recommendation history:
- **`heritage_sites` Table**: Stores structured attributes (site name, coordinates, era, civilization, material, structure, preservation rank, popularity rank).
- **`similarity_logs` / `site_similarity` Table**: Records similarity outputs generated by `/get-similarity`:
  - `site_name` (Text)
  - `top_similar_cosine` (JSONB)
  - `top_similar_kmeans` (JSONB)
  - `top_similar_agnes` (JSONB)
  - `top_similar_gmm` (JSONB)

---

## 🔌 API Reference

### Express Backend (`Application/backend/server/index.js`)
- `GET /` - Health check endpoint.
- `GET /sites` - Retrieves all heritage sites with spatial & category metadata.
- `GET /sites/theme/:theme` - Filters sites by specific theme (e.g., architecture, era, civilization).

### Clustering API (`Clustering/app.py`)
- `POST /get-similarity`
  - **Payload**: `{ "site_name": "Colosseum" }`
  - **Returns**: Top 5 similar sites grouped across 4 clustering algorithms.

### Agent Chatbot API (`Chatbot/Agent-Based/`)
- `POST /api/chat`
  - **Payload**: `{ "message": "Tell me about the architecture of Petra" }`
  - **Returns**: Synthesized response from specialized sub-agents with confidence scores.

---

## 📌 Future Roadmap (`TODO.md`)

- [ ] Multi-signal unsupervised ranker combining semantic, geo, historical, and popularity vectors with dynamic weights.
- [ ] Maximal Marginal Relevance (MMR) diversity re-ranking to prevent duplicate recommendations.
- [ ] Direct WebGL dynamic loading for mobile browsers.
