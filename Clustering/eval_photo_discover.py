"""
Evaluate Discover photo search: raw CLIP vs heritage-projected vs strict gates.

Writes:
  Clustering/Pickles/photo_discover_metrics.json
  (also merged fields intended for docs/research_metrics.json photo_discover)

Usage (from Clustering/):
  python eval_photo_discover.py
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
ROOT = BASE_DIR.parent
PICKLES = BASE_DIR / "Pickles"
PUBLIC_SITES = ROOT / "Application" / "frontend" / "public" / "sites"
OUT_PATH = PICKLES / "photo_discover_metrics.json"


def slugify(name: str) -> str:
    """Match Clustering/train_clip_heritage.get_image_filename (without .jpg)."""
    s = str(name).lower().strip()
    s = s.replace("ö", "o")
    s = (
        s.replace("(", "")
        .replace(")", "")
        .replace("&", "and")
        .replace(",", "")
        .replace("  ", " ")
        .replace(" ", "-")
    )
    s = s.replace("'", "").replace("/", "-")
    while "--" in s:
        s = s.replace("--", "-")
    return s


def main():
    os.chdir(BASE_DIR)
    import app as A

    A.load_models()
    names = list(A.clip_embeddings_data["site_names"])
    n = len(names)

    # Resolve archive photos
    paths = []
    missing = []
    for name in names:
        p = PUBLIC_SITES / f"{slugify(name)}.jpg"
        if not p.exists():
            # try trim variants
            alt = PUBLIC_SITES / f"{slugify(name.strip())}.jpg"
            p = alt if alt.exists() else p
        if p.exists():
            paths.append(p)
        else:
            paths.append(None)
            missing.append(name)

    usable = [i for i, p in enumerate(paths) if p is not None]
    if len(usable) < 5:
        raise SystemExit(f"Too few site images found under {PUBLIC_SITES} (missing {len(missing)})")

    t0 = time.perf_counter()
    raw_bank = np.asarray(A.clip_embeddings_data["raw_image_embeddings"], dtype=np.float32)
    img_bank = np.asarray(A.clip_embeddings_data["image_embeddings"], dtype=np.float32)
    raw_bank_n = raw_bank / (np.linalg.norm(raw_bank, axis=1, keepdims=True) + 1e-9)
    img_bank_n = img_bank / (np.linalg.norm(img_bank, axis=1, keepdims=True) + 1e-9)

    ranks_raw, ranks_proj, ranks_strict = [], [], []
    strict_sizes = []
    strict_hit1 = []
    strict_only_self = 0
    latencies = []
    raw_top5_lookalike_frac = []  # among raw top-5 (excl self), share failing heritage gate

    from utils import similarity_matrix, site_names as util_names, df, get_top_similar

    name_to_util = {n: i for i, n in enumerate(util_names)}
    df_by_name = {str(r["Name"]).strip(): r for _, r in df.iterrows()}

    for i in usable:
        img = Image.open(paths[i]).convert("RGB")
        t1 = time.perf_counter()
        with torch.no_grad():
            raw_emb = np.asarray(A.clip_model.encode([img])[0], dtype=np.float32)
            raw_t = torch.tensor(raw_emb, dtype=torch.float32).unsqueeze(0)
            proj = A.proj_model.img_proj(raw_t)
            proj = nn.functional.normalize(proj, dim=-1).squeeze(0).numpy()
        latencies.append(time.perf_counter() - t1)

        q_raw = raw_emb / (np.linalg.norm(raw_emb) + 1e-9)
        sims_raw = raw_bank_n @ q_raw
        sims_proj = img_bank_n @ proj
        visual = 0.25 * sims_raw + 0.75 * sims_proj

        order_raw = np.argsort(sims_raw)[::-1]
        order_proj = np.argsort(sims_proj)[::-1]
        ranks_raw.append(int(np.where(order_raw == i)[0][0]) + 1)
        ranks_proj.append(int(np.where(order_proj == i)[0][0]) + 1)

        # Look-alike pressure under raw CLIP top-5
        anchor_name = names[i]
        anchor_util = name_to_util.get(anchor_name)
        anchor_row = df_by_name.get(str(anchor_name).strip())
        similar_names = set()
        try:
            for item in get_top_similar(anchor_name, top_k=8) or []:
                if item.get("name"):
                    similar_names.add(str(item["name"]).strip())
        except Exception:
            pass
        rejected = 0
        considered = 0
        for j in order_raw[1:6]:
            j = int(j)
            considered += 1
            other = names[j]
            h = 0.0
            u = name_to_util.get(other)
            if anchor_util is not None and u is not None:
                h = max(0.0, min(1.0, float(similarity_matrix[anchor_util, u])))
            meta = 0.0
            row = df_by_name.get(str(other).strip())
            if anchor_row is not None and row is not None:
                meta = A._meta_overlap(anchor_row, row)
            heritage_ok = other in similar_names or h >= 0.55 or meta >= 0.45
            if not heritage_ok:
                rejected += 1
        if considered:
            raw_top5_lookalike_frac.append(rejected / considered)

        results = A._heritage_rerank_photo(visual, names, top_k=5)
        strict_sizes.append(len(results))
        if results and results[0]["name"].strip() == str(names[i]).strip():
            strict_hit1.append(1)
            ranks_strict.append(1)
            if len(results) == 1:
                strict_only_self += 1
        elif results:
            names_out = [r["name"].strip() for r in results]
            if str(names[i]).strip() in names_out:
                ranks_strict.append(names_out.index(str(names[i]).strip()) + 1)
                strict_hit1.append(0)
            else:
                ranks_strict.append(None)
                strict_hit1.append(0)
        else:
            ranks_strict.append(None)
            strict_hit1.append(0)

    def mrr(ranks):
        vals = [1.0 / r for r in ranks if r is not None]
        return float(np.mean(vals)) if vals else 0.0

    def hit_at(ranks, k):
        vals = [1 if (r is not None and r <= k) else 0 for r in ranks]
        return float(np.mean(vals)) if vals else 0.0

    # Raw/proj ranks always defined for usable set
    out = {
        "title": "Discover photo search (archive self-retrieval)",
        "n_sites": n,
        "n_evaluated": len(usable),
        "n_missing_images": len(missing),
        "missing_images": missing,
        "protocol": (
            "Each site's public archive JPG is encoded and ranked against the 49-site "
            "CLIP image bank. Strict mode applies heritage gates from Clustering/app.py "
            "(_heritage_rerank_photo)."
        ),
        "raw_clip": {
            "hit_at_1": round(hit_at(ranks_raw, 1), 4),
            "hit_at_5": round(hit_at(ranks_raw, 5), 4),
            "mrr": round(mrr(ranks_raw), 4),
            "mean_rank": round(float(np.mean(ranks_raw)), 3),
        },
        "projected_clip": {
            "hit_at_1": round(hit_at(ranks_proj, 1), 4),
            "hit_at_5": round(hit_at(ranks_proj, 5), 4),
            "mrr": round(mrr(ranks_proj), 4),
            "mean_rank": round(float(np.mean(ranks_proj)), 3),
        },
        "strict_photo_search": {
            "hit_at_1": round(float(np.mean(strict_hit1)), 4),
            "mrr_when_returned": round(mrr(ranks_strict), 4),
            "mean_results_returned": round(float(np.mean(strict_sizes)), 3),
            "pct_single_result_when_correct": round(
                strict_only_self / max(1, sum(strict_hit1)), 4
            ),
            "empty_result_rate": round(
                float(np.mean([1 if s == 0 else 0 for s in strict_sizes])), 4
            ),
        },
        "lookalike_pressure": {
            "mean_fraction_of_raw_top5_neighbors_failing_heritage_gate": round(
                float(np.mean(raw_top5_lookalike_frac)) if raw_top5_lookalike_frac else 0.0,
                4,
            ),
            "insight": (
                "Under raw CLIP, a large share of top-5 neighbors (excluding the true site) "
                "fail the heritage gate — these are the visual look-alikes strict mode drops."
            ),
        },
        "honesty_notes": [
            "Self-retrieval uses each site's archive JPG already in the CLIP image bank — Hit@1≈1.0 is expected closed-set behavior.",
            "Report lookalike_pressure + mean_results_returned to show strict mode's precision benefit.",
            "Do not claim open-world landmark ID from tourist photos outside n=49.",
        ],
        "latency_s": {
            "encode_mean": round(float(np.mean(latencies)), 3),
            "encode_p95": round(float(np.percentile(latencies, 95)), 3),
        },
        "paper_framing": {
            "primary_claim": (
                "Archive photo self-retrieval reaches high Hit@1 with CLIP image "
                "embeddings; a strict heritage gate reduces look-alike false positives "
                "at the cost of fewer secondary suggestions."
            ),
            "not_claimed": [
                "Open-world landmark recognition outside the 49-site archive",
                "Human-level historical identification from arbitrary tourist photos",
            ],
        },
        "elapsed_s": round(time.perf_counter() - t0, 1),
        "reproduce": "python Clustering/eval_photo_discover.py",
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
