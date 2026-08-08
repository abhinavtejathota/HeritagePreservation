# Heritage dataset

## Scale (current release)

| Item | Value |
|------|--------|
| Sites (n) | **49** |
| Primary file | `heritage_sites_v2.csv` |
| Prior release | `heritage_sites_v1.csv` (n=19) |
| Runtime store | PostgreSQL `heritage_sites` |
| Site images | `Application/frontend/public/sites/<slug>.jpg` |

Geography (from live corpus): **Asia**, **Europe**, **Africa** only — no Americas/Oceania in this release. About **20** distinct countries.

## Features

Name, Country, Continent, Era / year midpoint, Civilization, Religion, Architecture Style, Material, Structure, Area, Preservation, Popularity, plus lat/lon in the DB for map views.

## Sources & growth policy

- Rows are **curated project metadata** for verified heritage landmarks (public encyclopedic / UNESCO-style descriptions), not scraped social media.
- **Do not invent sites.** New sites go through `candidates/` + `scripts/validate_site_growth.py` (image + metadata + optional coords).
- API transparency: `GET /api/dataset/stats` returns n, continent/country counts, and feature distributions for the paper / demo.

## Paper figures

Regenerate high-DPI distribution + similarity figures:

```bash
python Clustering/export_paper_figures.py
```

Outputs land in `docs/paper_figures/` (commit-friendly; not under ignored `Review/`).
