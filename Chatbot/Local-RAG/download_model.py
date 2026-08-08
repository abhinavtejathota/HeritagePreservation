"""
Download a small GGUF instruct model suitable for ~4GB VRAM.

Default: Qwen2.5-1.5B-Instruct Q4_K_M (~1.1 GB) from Hugging Face.
"""

from __future__ import annotations

import os
import sys
import urllib.request

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

# Reliable small instruct GGUF
REPO_FILE = (
    "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/"
    "qwen2.5-1.5b-instruct-q4_k_m.gguf"
)
# Alternate naming if upstream uses different casing
OUT_NAME = "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf"
OUT_PATH = os.path.join(MODEL_DIR, OUT_NAME)

# Fallback mirrors (tried in order)
URLS = [
    REPO_FILE,
    "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/"
    "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
]


def download(url: str, dest: str) -> None:
    print(f"Downloading:\n  {url}\n-> {dest}")

    def hook(count, block, total):
        if total <= 0:
            return
        done = count * block
        pct = min(100, done * 100 // total)
        mb = done / (1024 * 1024)
        sys.stdout.write(f"\r  {pct:3d}%  ({mb:.1f} MB)")
        sys.stdout.flush()

    urllib.request.urlretrieve(url, dest, reporthook=hook)
    print("\nDone.")


def main():
    if os.path.exists(OUT_PATH) and os.path.getsize(OUT_PATH) > 50_000_000:
        print(f"Already present: {OUT_PATH}")
        return
    last_err = None
    for url in URLS:
        try:
            download(url, OUT_PATH)
            print(f"Saved {OUT_PATH} ({os.path.getsize(OUT_PATH) / 1e6:.1f} MB)")
            return
        except Exception as e:
            last_err = e
            print(f"\nFailed: {e}")
            if os.path.exists(OUT_PATH):
                os.remove(OUT_PATH)
    raise SystemExit(f"Could not download model. Last error: {last_err}")


if __name__ == "__main__":
    main()
