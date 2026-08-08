# Install GPU stack for Local RAG (RTX 3050 / Windows)
#
# Order matters: install torch CUDA first (provides cudart DLLs),
# then the CUDA llama-cpp-python wheel.
#
# Usage:
#   .\scripts\install_gpu_llm.ps1

$ErrorActionPreference = "Continue"

Write-Host "1) Installing PyTorch CUDA 12.4 ..." -ForegroundColor Cyan
pip install --upgrade torch --index-url https://download.pytorch.org/whl/cu124

Write-Host "2) Installing llama-cpp-python CUDA 12.4 wheel ..." -ForegroundColor Cyan
pip uninstall llama-cpp-python -y
pip install llama-cpp-python==0.3.34 --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124 --force-reinstall --no-cache-dir
if ($LASTEXITCODE -ne 0) {
  Write-Host "cu124 failed, trying cu122 ..." -ForegroundColor Yellow
  pip install llama-cpp-python==0.3.34 --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu122 --force-reinstall --no-cache-dir
}

$env:LOCAL_LLM_N_GPU_LAYERS = "33"
Write-Host "3) Verifying GPU ..." -ForegroundColor Cyan
python -c @"
import torch
print('torch', torch.__version__, 'cuda', torch.cuda.is_available())
from Chatbot.Local-RAG import cuda_path
"@

# Run verifier from Local-RAG dir
Push-Location "$PSScriptRoot\..\Chatbot\Local-RAG"
python -c "from cuda_path import add_cuda_dll_dirs; print(add_cuda_dll_dirs()); from local_llm import ensure_llm, backend_name, gpu_layers_used; ensure_llm(); print(backend_name(), gpu_layers_used())"
Pop-Location

Write-Host "Done. Start with:" -ForegroundColor Green
Write-Host '  $env:LOCAL_LLM_N_GPU_LAYERS = "33"'
Write-Host "  cd Chatbot\Local-RAG; python app.py"
