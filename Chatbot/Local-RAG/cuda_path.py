"""
Ensure NVIDIA / PyTorch CUDA DLLs are discoverable on Windows before loading llama-cpp.
Call this at process start (Local-RAG app / local_llm).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def add_cuda_dll_dirs() -> list[str]:
    added: list[str] = []
    candidates: list[Path] = []

    # PyTorch ships cudart etc. next to torch\lib
    try:
        import torch

        torch_lib = Path(torch.__file__).resolve().parent / "lib"
        candidates.append(torch_lib)
    except Exception:
        pass

    # Official toolkit (if installed)
    pf = Path(r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA")
    if pf.exists():
        for ver in sorted(pf.glob("v*"), reverse=True):
            candidates.append(ver / "bin")

    # CUDA_PATH env
    cuda_path = os.environ.get("CUDA_PATH")
    if cuda_path:
        candidates.append(Path(cuda_path) / "bin")

    for d in candidates:
        if not d.is_dir():
            continue
        try:
            if hasattr(os, "add_dll_directory"):
                os.add_dll_directory(str(d))
            # Also prepend PATH for child loads
            os.environ["PATH"] = str(d) + os.pathsep + os.environ.get("PATH", "")
            added.append(str(d))
        except Exception:
            continue
    return added


if __name__ == "__main__":
    print("DLL dirs:", add_cuda_dll_dirs())
