# Heritage site growth — candidates only (do not invent)

Adding sites to the live corpus requires **all** of:

1. A row in `candidates.csv` with verified metadata (UNESCO / museum / academic source)
2. An image at `Application/frontend/public/sites/<slug>.jpg`
3. Lat/lon (for map) when promoting to Postgres
4. Passing `python scripts/validate_site_growth.py`
5. Then merge into `Dataset/heritage_sites_v2.csv` + `scripts/sync_sites_to_db.py`
6. Re-run Clustering train/benchmark/rag_index scripts

Until then, **n stays 49**. Scale experiments that expand feature matrices synthetically are labeled as such in metrics JSON — not real sites.

## candidates.csv columns

Same as `heritage_sites_v2.csv`, plus optional:

`SourceURL`, `ImageSlug`, `Latitude`, `Longitude`, `VerifiedBy`
