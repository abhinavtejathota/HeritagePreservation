# Paper figure captions

Generated from `Dataset\heritage_sites_v2.csv` (n=49).


## fig_continent_distribution.png

Continent distribution of the curated corpus (n=49). Asia dominates (29 sites); Europe and Africa are represented (10 / 10). Americas and Oceania are absent in this release — a stated limitation.


## fig_preservation_popularity.png

Horizontal bar charts of Preservation and Popularity categorical fields. Most sites are labeled Good/Excellent preservation and High/Very high popularity, reflecting a well-known-landmark bias in the curated set.


## fig_era_distribution.png

Top-10 civilization labels by frequency. Use alongside continent charts to discuss cultural coverage — not as a balanced world sample.


## fig_similarity_heatmap.png

Cosine similarity among sites using scaled tabular features (preservation, popularity, log area, year midpoint, continent one-hots). Bright blocks indicate groups that share coarse metadata; this figure is for interpretability in the paper — learned CLIP/GraphSAGE matrices should be cited from Clustering Pickles when available.
