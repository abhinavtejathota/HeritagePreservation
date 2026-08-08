"""
Build training data for Heritage Mini-LM from the curated 49-site CSV
plus online Wikipedia extracts (names only from the CSV — no invented sites).

Outputs:
  data/online_training.csv  — per-row training texts (dossier + wiki + QA)
  data/corpus.txt           — concatenated LM corpus
  data/wiki_cache/          — cached API responses
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[3]  # …/Major
CSV = ROOT / "Dataset" / "heritage_sites_v2.csv"
OUT_DIR = Path(__file__).resolve().parent / "data"
CORPUS = OUT_DIR / "corpus.txt"
TRAIN_CSV = OUT_DIR / "online_training.csv"
META = OUT_DIR / "corpus_meta.json"
WIKI_CACHE = OUT_DIR / "wiki_cache"

UA = "HeritageMajorLM/1.1 (academic corpus; contact: local-project)"

# Map awkward CSV names → Wikipedia page titles (still the same 49 sites).
# Do NOT map distinct sub-sites onto a parent article (pollutes QA labels).
WIKI_TITLE_ALIASES: dict[str, list[str]] = {
    "Great Temple (Petra)": ["Great Temple (Petra)"],
    "Hampi Monuments": ["Group of Monuments at Hampi", "Hampi"],
    "Obelisk Tomb & Bab as-Siq": ["Bab as-Siq"],
    "Temple of the Winged Lions": ["Temple of the Winged Lions"],
    "Clonmacnoise Monastic Site": ["Clonmacnoise"],
    "Pompeii Archaeological Site": ["Pompeii"],
    "Great Zimbabwe Ruins": ["Great Zimbabwe"],
    "Pyramids of Giza": ["Giza pyramid complex", "Egyptian pyramids"],
    "Lalibela Rock-Hewn Churches": ["Rock-Hewn Churches of Lalibela", "Lalibela"],
    "Tigray Rock-Hewn Churches": ["Rock-hewn churches of Tigray"],
    "Medina of Fez": ["Fes el Bali", "Fez, Morocco"],
    "Ming Xiaoling Mausoleum": ["Ming Xiaoling"],
    "Ancient City of Pingyao": ["Pingyao"],
    "Acropolis of Athens": ["Acropolis of Athens"],
    "Schönbrunn Palace": ["Schönbrunn Palace"],
    "Al-Khazneh": ["Al-Khazneh"],
}


def _name_tokens(name: str) -> list[str]:
    stop = {"the", "of", "and", "at", "in", "a", "an", "group", "site", "monuments"}
    return [
        t
        for t in re.findall(r"[A-Za-z]{3,}", name.lower())
        if t not in stop
    ]


def wiki_relevant(site_name: str, text: str) -> bool:
    """Reject extracts that clearly describe a different place (bad alias/redirect)."""
    if not text:
        return False
    low = text.lower()
    tokens = _name_tokens(site_name)
    if not tokens:
        return True
    hits = sum(1 for t in tokens if t in low)
    # require at least one distinctive token, or half of them
    return hits >= max(1, (len(tokens) + 1) // 2)


def dossier_row(r: pd.Series) -> str:
    parts = [
        f"Site: {r.get('Name', '')}.",
        f"Country: {r.get('Country', '')}. Continent: {r.get('Continent', '')}.",
        f"Era: {r.get('Era', '')} (midpoint {r.get('Year(midpoint)', '')}).",
        f"Civilization: {r.get('Civilization', '')}. Religion: {r.get('Religion', '')}.",
        f"Architecture: {r.get('Architecture Style', '')}.",
        f"Material: {r.get('Material', '')}. Structure: {r.get('Structure', '')}.",
        f"Preservation: {r.get('Preservation', '')}. Popularity: {r.get('Popularity', '')}.",
    ]
    return " ".join(str(p).strip() for p in parts if str(p).strip())


def _cache_key(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")[:80]


def _http_json(url: str, timeout: float = 12.0, retries: int = 4) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    delay = 1.5
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < retries - 1:
                wait = delay * (attempt + 1) + 2.0
                print(f"[http] {e.code} — backoff {wait:.1f}s")
                time.sleep(wait)
                continue
            if e.code != 404:
                print(f"[http] {e}")
            return None
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(delay)
                continue
            print(f"[http] {e}")
            return None
    return None


def candidate_titles(name: str) -> list[str]:
    aliases = WIKI_TITLE_ALIASES.get(name, [name])
    out: list[str] = []
    for t in aliases:
        if t not in out:
            out.append(t)
    if name not in out:
        out.insert(0, name)
    return out


def fetch_wikipedia_extract(
    title: str,
    *,
    full: bool = True,
    max_chars: int = 2800,
    timeout: float = 12.0,
) -> str | None:
    """Plain Wikipedia extract; tries aliases. Cached. Attribution: CC BY-SA."""
    WIKI_CACHE.mkdir(parents=True, exist_ok=True)

    for cand in candidate_titles(title):
        key = _cache_key(cand)
        suffix = "full" if full else "intro"
        cache_path = WIKI_CACHE / f"{key}_{suffix}.json"
        if cache_path.exists():
            try:
                cached = json.loads(cache_path.read_text(encoding="utf-8")).get("extract")
                if cached:
                    return cached
            except Exception:
                pass

        params: dict[str, str] = {
            "action": "query",
            "prop": "extracts",
            "explaintext": "1",
            "redirects": "1",
            "titles": cand,
            "format": "json",
        }
        if not full:
            params["exintro"] = "1"
        else:
            params["exchars"] = str(min(max_chars, 1200))

        url = f"https://en.wikipedia.org/w/api.php?{urllib.parse.urlencode(params)}"
        data = _http_json(url, timeout=timeout)
        if not data:
            continue

        extract = None
        for page in data.get("query", {}).get("pages", {}).values():
            if page.get("missing") is not None:
                continue
            extract = (page.get("extract") or "").strip()
            if extract:
                break
        if not extract:
            continue

        extract = re.sub(r"\s+", " ", extract)[:max_chars]
        cache_path.write_text(
            json.dumps(
                {
                    "title": cand,
                    "requested": title,
                    "extract": extract,
                    "source": "Wikipedia (CC BY-SA)",
                    "mode": suffix,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return extract
    return None


def fetch_wikipedia_summary(title: str, timeout: float = 10.0) -> dict | None:
    """REST summary — tries aliases; cached."""
    WIKI_CACHE.mkdir(parents=True, exist_ok=True)

    for cand in candidate_titles(title):
        key = _cache_key(cand)
        cache_path = WIKI_CACHE / f"{key}_summary.json"
        if cache_path.exists():
            try:
                cached = json.loads(cache_path.read_text(encoding="utf-8"))
                if cached.get("extract") or cached.get("description"):
                    return cached
            except Exception:
                pass

        slug = urllib.parse.quote(cand.replace(" ", "_"))
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}"
        data = _http_json(url, timeout=timeout)
        if not data or data.get("type") == "disambiguation":
            continue
        out = {
            "title": data.get("title") or cand,
            "requested": title,
            "description": (data.get("description") or "").strip(),
            "extract": re.sub(r"\s+", " ", (data.get("extract") or "").strip())[:1600],
            "source": "Wikipedia REST summary (CC BY-SA)",
        }
        if not out["extract"] and not out["description"]:
            continue
        cache_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
        return out
    return None


def qa_pairs(name: str, r: pd.Series, dossier: str, wiki: str | None, summary: dict | None) -> list[tuple[str, str, str]]:
    """Return (text_type, text, source) rows for training CSV."""
    rows: list[tuple[str, str, str]] = []
    country = str(r.get("Country", "")).strip()
    continent = str(r.get("Continent", "")).strip()
    arch = str(r.get("Architecture Style", "")).strip()
    material = str(r.get("Material", "")).strip()
    era = str(r.get("Era", "")).strip()
    civ = str(r.get("Civilization", "")).strip()
    religion = str(r.get("Religion", "")).strip()
    structure = str(r.get("Structure", "")).strip()
    preserv = str(r.get("Preservation", "")).strip()

    rows.append(("dossier", dossier, "curated_csv"))
    rows.append(
        (
            "qa",
            f"Question: Where is {name}? Answer: {name} is in {country}, {continent}.",
            "curated_csv",
        )
    )
    rows.append(
        (
            "qa",
            f"Question: What is the architecture of {name}? Answer: {arch} using {material}.",
            "curated_csv",
        )
    )
    rows.append(
        (
            "qa",
            f"Question: What era is {name} from? Answer: {name} belongs to the {era} era, associated with {civ}.",
            "curated_csv",
        )
    )
    rows.append(
        (
            "qa",
            f"Question: What religion is linked to {name}? Answer: {religion}. Structure type: {structure}. Preservation: {preserv}.",
            "curated_csv",
        )
    )
    rows.append(
        (
            "qa",
            f"Question: Tell me about {name}. Answer: {dossier}",
            "curated_csv",
        )
    )

    if summary:
        desc = summary.get("description") or ""
        ext = summary.get("extract") or ""
        if desc and wiki_relevant(name, desc):
            rows.append(
                (
                    "wiki_description",
                    f"{name}: {desc}.",
                    "wikipedia_rest",
                )
            )
        if ext and wiki_relevant(name, ext):
            # ASCII-leaning short lead for LM QA (drop exotic scripts that explode BPE)
            clean = re.sub(r"[^\x09\x0A\x0D\x20-\x7E]", " ", ext)
            clean = re.sub(r"\s+", " ", clean).strip()[:500]
            if clean and wiki_relevant(name, clean):
                rows.append(
                    (
                        "wiki_summary",
                        f"Background ({name}): {clean}",
                        "wikipedia_rest",
                    )
                )
                rows.append(
                    (
                        "qa",
                        f"Question: Summarize {name}. Answer: {clean[:350]}",
                        "wikipedia_rest",
                    )
                )
                rows.append(
                    (
                        "qa",
                        f"Question: What is special about {name}? Answer: {clean[:300]}",
                        "wikipedia_rest",
                    )
                )

    if wiki and wiki_relevant(name, wiki):
        clean = re.sub(r"[^\x09\x0A\x0D\x20-\x7E]", " ", wiki)
        clean = re.sub(r"\s+", " ", clean).strip()[:900]
        if clean and wiki_relevant(name, clean):
            rows.append(
                (
                    "wiki_extract",
                    f"Background ({name}, Wikipedia extract): {clean}",
                    "wikipedia_api",
                )
            )
            rows.append(
                (
                    "chat",
                    (
                        f"User: Tell me about {name}. "
                        f"Assistant: {clean[:280]} "
                        f"User: Where is it? "
                        f"Assistant: {name} is in {country}, {continent}."
                    ),
                    "wikipedia_api+csv",
                )
            )
            rows.append(
                (
                    "qa",
                    f"Question: Give a detailed overview of {name}. Answer: {clean[:400]}",
                    "wikipedia_api",
                )
            )

    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--online",
        action="store_true",
        help="Fetch Wikipedia extracts/summaries for the 49 CSV site names.",
    )
    ap.add_argument("--sleep", type=float, default=1.2, help="Delay between online calls")
    ap.add_argument("--max-chars", type=int, default=2800)
    args = ap.parse_args()

    if not CSV.exists():
        raise SystemExit(f"Missing {CSV}")

    df = pd.read_csv(CSV)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    train_rows: list[dict] = []
    wiki_n = 0
    summary_n = 0

    for idx, r in df.iterrows():
        name = str(r.get("Name", "")).strip()
        if not name:
            continue
        dossier = dossier_row(r)
        wiki = None
        summary = None

        if args.online:
            time.sleep(max(0.0, args.sleep))
            summary = fetch_wikipedia_summary(name)
            if summary and summary.get("extract"):
                summary_n += 1
            time.sleep(max(0.0, args.sleep * 0.5))
            wiki = fetch_wikipedia_extract(name, full=True, max_chars=args.max_chars)
            if wiki:
                wiki_n += 1
            print(f"[{idx+1}/{len(df)}] {name}: wiki={'yes' if wiki else 'no'} summary={'yes' if summary else 'no'}")

        for text_type, text, source in qa_pairs(name, r, dossier, wiki, summary):
            train_rows.append(
                {
                    "site_name": name,
                    "country": str(r.get("Country", "")).strip(),
                    "text_type": text_type,
                    "source": source,
                    "text": text,
                    "chars": len(text),
                }
            )

    # Write dedicated training CSV
    fieldnames = ["site_name", "country", "text_type", "source", "text", "chars"]
    with TRAIN_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(train_rows)

    lines = [row["text"] for row in train_rows if row["text"].strip()]
    text = "\n\n".join(lines)
    CORPUS.write_text(text, encoding="utf-8")

    meta = {
        "n_sites": int(len(df)),
        "n_training_rows": len(train_rows),
        "chars": len(text),
        "online_wikipedia_extracts": wiki_n,
        "online_wikipedia_summaries": summary_n,
        "csv_sites": str(CSV.relative_to(ROOT)).replace("\\", "/"),
        "training_csv": str(TRAIN_CSV.relative_to(OUT_DIR.parent)).replace("\\", "/"),
        "note": "Curated CSV dossiers; Wikipedia texts attributed CC BY-SA and cached under wiki_cache/.",
    }
    META.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Wrote {TRAIN_CSV} ({len(train_rows)} rows)")
    print(f"Wrote {CORPUS} ({meta['chars']} chars)")
    if args.online:
        print(f"Wikipedia extracts: {wiki_n}/{meta['n_sites']}, summaries: {summary_n}/{meta['n_sites']}")


if __name__ == "__main__":
    main()
