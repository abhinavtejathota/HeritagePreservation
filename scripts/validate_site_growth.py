#!/usr/bin/env python3
"""
Validate candidate heritage sites before promoting into the main corpus.

Checks:
  - required CSV columns present
  - Name not already in heritage_sites_v2.csv
  - Image exists at Application/frontend/public/sites/<slug>.jpg (or ImageSlug)
  - SourceURL / VerifiedBy non-empty
  - optional lat/lon parseable

Does NOT invent or auto-merge sites. Exit code 0 if all rows valid (or file empty).

Usage:
  python scripts/validate_site_growth.py
  python scripts/validate_site_growth.py --promote-dry-run
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "Dataset" / "heritage_sites_v2.csv"
CAND = ROOT / "Dataset" / "candidates" / "candidates.csv"
IMG_DIR = ROOT / "Application" / "frontend" / "public" / "sites"

REQUIRED = [
    "Name",
    "Country",
    "Civilization",
    "Architecture Style",
    "Material",
    "SourceURL",
    "VerifiedBy",
]


def slugify(name: str) -> str:
    import unicodedata

    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--promote-dry-run",
        action="store_true",
        help="Print how many rows would merge if valid",
    )
    args = parser.parse_args()

    if not CAND.exists():
        print(f"Missing {CAND}")
        return 1

    cand = pd.read_csv(CAND)
    # drop fully empty rows
    cand = cand.dropna(how="all")
    if len(cand) == 0 or cand["Name"].isna().all():
        print("No candidate rows — corpus stays at n=49. OK.")
        return 0

    main_df = pd.read_csv(MAIN)
    existing = set(main_df["Name"].astype(str).str.strip())
    errors = []
    ok = 0

    for i, row in cand.iterrows():
        name = str(row.get("Name", "")).strip()
        if not name or name == "nan":
            continue
        missing = [c for c in REQUIRED if c not in cand.columns or pd.isna(row.get(c)) or str(row.get(c)).strip() == ""]
        if missing:
            errors.append(f"{name}: missing {missing}")
            continue
        if name in existing:
            errors.append(f"{name}: already in main CSV")
            continue
        slug = str(row.get("ImageSlug") or "").strip() or slugify(name)
        img = IMG_DIR / f"{slug}.jpg"
        if not img.exists():
            # also try png
            img2 = IMG_DIR / f"{slug}.png"
            if not img2.exists():
                errors.append(f"{name}: image not found ({img.name})")
                continue
        for col in ("Latitude", "Longitude"):
            if col in cand.columns and not pd.isna(row.get(col)):
                try:
                    float(row[col])
                except Exception:
                    errors.append(f"{name}: bad {col}")
        ok += 1

    print(f"Valid candidates: {ok}")
    for e in errors:
        print(f"  ERROR: {e}")

    if args.promote_dry_run and ok and not errors:
        print(f"Dry-run: would merge {ok} rows → new n={len(existing)+ok}")
        print("Manual merge still required (edit heritage_sites_v2.csv).")

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
