# TODO: Research-level unsupervised recommendation (heritage sites)

- [ ] Gather code context: inspect existing cosine similarity API + data artifacts (done partially; continue if needed).
- [ ] Implement multi-signal unsupervised ranker that combines multiple similarity components (semantic, geo, historical, architectural, popularity) with tunable weights.
- [ ] Add unsupervised calibration of component weights (e.g., per-component normalization + temperature/entropy scaling based on score distributions).
- [ ] Add diversity-aware re-ranking (MMR) to reduce near-duplicates and improve coverage.
- [ ] Compute similarity components using existing available fields in `df.pkl` (or add missing precomputed vectors into Pickles if required).
- [ ] Update `Clustering/utils.py` to expose new recommendation function (without breaking existing endpoints).
- [ ] Update `Clustering/app.py` to return both old cosine results and new research-level results.
- [ ] Keep DB insertion schema compatible (extend JSON stored if needed).
- [ ] Run a quick local sanity check by calling the API function from a python snippet.

