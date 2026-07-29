INSERT_SIMILARITY = """
INSERT INTO site_similarity (
  site_name,
  top_5_similar,
  top_5_kmeans,
  top_5_agnes,
  top_5_gmm
)
VALUES (%s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb)
ON CONFLICT (site_name)
DO UPDATE SET
  top_5_similar = EXCLUDED.top_5_similar,
  top_5_kmeans  = EXCLUDED.top_5_kmeans,
  top_5_agnes   = EXCLUDED.top_5_agnes,
  top_5_gmm     = EXCLUDED.top_5_gmm,
  created_at    = CURRENT_TIMESTAMP;
"""
