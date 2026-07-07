$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path ".venv-ocr")) {
  python -m venv .venv-ocr
}

$python = Join-Path ".venv-ocr" "Scripts/python.exe"
& $python -m pip install --upgrade pip
& $python -m pip install -r requirements-ocr.txt

Write-Host ""
Write-Host "OCR environment ready."
Write-Host "Set ORDERLEDGER_PADDLE_PYTHON=.venv-ocr\\Scripts\\python.exe in .env if needed."
