"""Refresh site_similarity for all sites (upsert via INSERT_SIMILARITY)."""
import json
import sys

from db import conn, get_cursor
from query import INSERT_SIMILARITY
from utils import generate_similarity_response, site_names


def main():
    cursor = get_cursor()
    ok, fail = 0, 0
    for name in site_names:
        try:
            result = generate_similarity_response(name)
            # Primary fusion set (Scalar_Arch / All_Features) - more coherent for UI
            top = result.get("Top 5 Similar") or []
            cursor.execute(
                INSERT_SIMILARITY,
                (
                    result["site_name"],
                    json.dumps(top),
                    json.dumps(result.get("Top 5 Similar (KMeans)") or []),
                    json.dumps(result.get("Top 5 Similar (AGNES)") or []),
                    json.dumps(result.get("Top 5 Similar (GMM)") or []),
                ),
            )
            ok += 1
            print(f"ok  {name}: {[t.get('name') for t in top]}")
        except Exception as e:
            fail += 1
            print(f"fail {name}: {e}", file=sys.stderr)
    conn.commit()
    print(f"Done. updated={ok} failed={fail}")


if __name__ == "__main__":
    main()
