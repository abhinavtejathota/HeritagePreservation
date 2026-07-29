# TODO: State-of-the-Art & Novel Research Roadmap (Cultural Heritage Ecosystem)

## 📌 Phase 1: Completed Core Enhancements
- [x] Multi-signal unsupervised ranker combining feature vectors, embeddings, and popularity scores.
- [x] Unsupervised score calibration via per-component min-max and temperature normalization.
- [x] Diversity-aware Maximal Marginal Relevance (MMR) re-ranking ($\lambda=0.7$).
- [x] API & PostgreSQL schema backward compatibility across clustering endpoints.

---

## 🔬 Phase 2: Novel Research & Industry-Standard Upgrades

### 1. Multi-Modal Heritage Representation Learning (Novel Paradigm)
- [ ] **Cross-Modal Joint Embedding Space (CLIP-Heritage)**:
  - Fine-tune dense vision-language alignment (e.g., OpenCLIP / CLIP-ViT) combining site 3D textures, images, and domain text descriptions.
  - Enables natural text queries directly retrieving 3D WebGL assets & similar architectural clusters.
- [ ] **Graph Neural Network (GNN) Heritage Topology Knowledge Graph**:
  - Build a heterogenous knowledge graph (Nodes: Sites, Civilizations, Eras, Materials, Architectural Styles; Edges: Spatio-Temporal Relations & Influence).
  - Apply **GraphSAGE / HeteroGNN** node embeddings to discover non-obvious historical trade-route and cross-civilization architectural influences.

### 2. Industry-Standard Clustering & Vector Search
- [ ] **HDBSCAN & OPTICS Density Clustering**:
  - Upgrade beyond fixed K-Means/AGNES to hierarchical density-based clustering (HDBSCAN) to discover natural cluster shapes and filter out noise/isolated heritage sites.
- [ ] **HNSW / FAISS Vector Search Engine**:
  - Integrate FAISS (Facebook AI Similarity Search) or Qdrant/Milvus HNSW index for sub-millisecond approximate nearest neighbor (ANN) retrieval over large heritage vector spaces.

### 3. Agentic RAG & Multi-Turn Intelligent Assistant
- [ ] **Agentic Retrieval-Augmented Generation (Agentic RAG)**:
  - Upgrade agent orchestrator to use dynamic vector retrieval over site knowledge graphs, ensuring hallucination-free factual historical answers.
- [ ] **Multi-Turn Context & Dialogue Memory**:
  - Implement Redis-backed session memory and user profile context awareness (e.g., user interest in Roman vs. Gothic architecture).

### 4. Dynamic WebGL & Spatial Experience
- [ ] **Spatial Geo-Clustering on Interactive Maps**:
  - Render dynamic convex hull clusters directly onto the React-Leaflet spatial map based on GMM/HDBSCAN cluster IDs.
- [ ] **Adaptive WebGL Asset Streaming**:
  - Implement progressive LOD (Level of Detail) mesh loading for low-bandwidth mobile browsers exploring 3D site reconstructions.
