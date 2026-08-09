# Paper figure captions

Generated from `Dataset\heritage_sites_v2.csv` (n=49).


## fig_continent_distribution.png

Continent distribution of the curated corpus (n=49). Asia dominates (29 sites); Europe and Africa are represented (10 / 10). Americas and Oceania are absent in this release â€” a stated limitation.


## fig_preservation_popularity.png

Horizontal bar charts of Preservation and Popularity categorical fields. Most sites are labeled Good/Excellent preservation and High/Very high popularity, reflecting a well-known-landmark bias in the curated set.


## fig_era_distribution.png

Top-10 civilization labels by frequency. Use alongside continent charts to discuss cultural coverage â€” not as a balanced world sample.


## fig_similarity_heatmap.png

Representative subset (**10 sites**) of tabular cosine similarity for print readability. Full-corpus evaluation still uses n=49; this figure is for visual clarity in Word/PDF.

## fig_fusion_similarity_heatmap.png

Same 10-site subset for the primary fused feature similarity matrix.

## fig_graphsage_similarity_heatmap.png

Same 10-site subset for GraphSAGE embedding cosine similarity.

## fig_clip_joint_similarity_heatmap.png

Same 10-site subset for CLIP-Heritage joint embedding cosine similarity.

## fig_chatbot_pipeline.png

Agent-Based conversational pipeline: React → chatbot service → hybrid dense/sparse retrieval over the curated heritage archive → extractive grounding; Mini-LM and local GGUF RAG used only when context is insufficient.

