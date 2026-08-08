"""
Expand / sync heritage sites CSV ↔ PostgreSQL.

IMPORTANT (research integrity):
  Do NOT invent UNESCO sites. Only add rows with verified metadata AND
  a matching image under Application/frontend/public/sites/<slug>.jpg.

Usage:
  python scripts/sync_sites_to_db.py          # upsert CSV → DB
  python scripts/sync_sites_to_db.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "Dataset" / "heritage_sites_v2.csv"
IMAGE_DIR = ROOT / "Application" / "frontend" / "public" / "sites"
ENV_PATH = ROOT / "Application" / "backend" / "server" / ".env"


def slugify(name: str) -> str:
    name = name.lower().strip()
    name = name.replace("ö", "o").replace("Schönbrunn", "schonbrunn")
    name = re.sub(r"[()]", "", name)
    name = name.replace("&", "and").replace(",", "").replace("'", "")
    name = re.sub(r"\s+", "-", name)
    name = re.sub(r"-+", "-", name)
    return name + ".jpg"


def image_coverage(df: pd.DataFrame) -> tuple[int, list[str]]:
    missing = []
    for name in df["Name"]:
        path = IMAGE_DIR / slugify(str(name))
        # also try schönbrunn variant
        if not path.exists():
            alt = IMAGE_DIR / slugify(str(name).replace("ö", "o"))
            if not alt.exists():
                missing.append(str(name))
    return len(df) - len(missing), missing


def upsert(dry_run: bool = False) -> None:
    load_dotenv(ENV_PATH)
    df = pd.read_csv(CSV_PATH)
    covered, missing = image_coverage(df)
    print(f"CSV sites: {len(df)} | with images: {covered} | missing images: {len(missing)}")
    if missing:
        print("Missing images (not blocking DB sync):")
        for m in missing[:20]:
            print(f"  - {m}")

    import psycopg2

    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        dbname=os.getenv("DB_NAME"),
        port=os.getenv("DB_PORT"),
        connect_timeout=10,
    )
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM heritage_sites")
    before = cur.fetchone()[0]
    print(f"DB sites before: {before}")

    # Only sync fields present in CSV; leave lat/lon/description untouched if already set
    sql = """
    INSERT INTO heritage_sites (
      name, country, continent, era, year_midpoint, civilization, religion,
      architecture_style, material, structure, area_m2, preservation, popularity
    ) VALUES (
      %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
    )
    ON CONFLICT (name) DO UPDATE SET
      country = EXCLUDED.country,
      continent = EXCLUDED.continent,
      era = EXCLUDED.era,
      year_midpoint = EXCLUDED.year_midpoint,
      civilization = EXCLUDED.civilization,
      religion = EXCLUDED.religion,
      architecture_style = EXCLUDED.architecture_style,
      material = EXCLUDED.material,
      structure = EXCLUDED.structure,
      area_m2 = EXCLUDED.area_m2,
      preservation = EXCLUDED.preservation,
      popularity = EXCLUDED.popularity
    """

    rows = []
    for _, r in df.iterrows():
        rows.append(
            (
                r["Name"],
                r.get("Country"),
                r.get("Continent"),
                r.get("Era"),
                r.get("Year(midpoint)"),
                r.get("Civilization"),
                r.get("Religion"),
                r.get("Architecture Style"),
                r.get("Material"),
                r.get("Structure"),
                r.get("Area(m2)"),
                r.get("Preservation"),
                r.get("Popularity"),
            )
        )

    if dry_run:
        print(f"[dry-run] Would upsert {len(rows)} rows")
        conn.close()
        return

    try:
        cur.executemany(sql, rows)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print("Upsert failed (table may lack UNIQUE on name). Error:", e)
        print("Falling back to count-only report.")
    cur.execute("SELECT COUNT(*) FROM heritage_sites")
    after = cur.fetchone()[0]
    print(f"DB sites after: {after}")
    conn.close()
    print(
        "\nTo grow the dataset for the paper: append verified UNESCO rows to "
        "Dataset/heritage_sites_v2.csv, add matching .jpg images, then re-run "
        "this script and the Clustering training/benchmark pipeline."
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    upsert(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
