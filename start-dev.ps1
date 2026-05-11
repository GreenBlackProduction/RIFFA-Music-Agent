# ============================================================
#  RIFFA Web — local dev runner
#  Run: right-click -> "Run with PowerShell"
#  or from terminal: .\start-dev.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$ROOT   = $PSScriptRoot
$BACK   = Join-Path $ROOT "backend"
$FRONT  = Join-Path $ROOT "frontend"
$VENV   = Join-Path $BACK ".venv"
$PY     = Join-Path $VENV "Scripts\python.exe"
$PIP    = Join-Path $VENV "Scripts\pip.exe"

function Write-Step($msg)  { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "   !! $msg" -ForegroundColor Yellow }
function Write-Fail($msg)  { Write-Host "`n[ERROR] $msg" -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }

Clear-Host
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  RIFFA Web - Dev Launcher" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta

Write-Step "Checking dependencies..."

if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Fail "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop"
}
Write-OK "Docker found"

if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    Write-Fail "Python not found. Install Python 3.12+: https://www.python.org"
}
$pyVer = python --version 2>&1
Write-OK "Python: $pyVer"

if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Fail "Node.js not found. Install Node 20+: https://nodejs.org"
}
$nodeVer = node --version 2>&1
Write-OK "Node.js: $nodeVer"

Write-Step "Starting Docker containers (PostgreSQL, Redis, MinIO)..."

Set-Location $ROOT
$dockerStatus = docker compose ps --format json 2>&1
$alreadyUp = $dockerStatus -match '"State":"running"'

if ($alreadyUp) {
    Write-OK "Containers already running"
} else {
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up failed" }
    Write-OK "Containers started"
}

Write-Host "   Waiting for PostgreSQL" -NoNewline
$maxWait = 30
$waited = 0
while ($waited -lt $maxWait) {
    $check = docker compose exec -T db pg_isready -U riffa 2>&1
    if ($check -match "accepting connections") { break }
    Write-Host "." -NoNewline
    Start-Sleep 1
    $waited++
}
Write-Host ""
if ($waited -ge $maxWait) { Write-Fail "PostgreSQL did not start within $maxWait seconds" }
Write-OK "PostgreSQL ready"

Write-Step "Python virtual environment..."

Set-Location $BACK

if (-not (Test-Path $VENV)) {
    Write-Host "   Creating venv..."
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to create venv" }
}
Write-OK "venv: $VENV"

Write-Host "   Installing dependencies (pip install -e .[dev])..."
& $PIP install -e ".[dev]" --quiet
if ($LASTEXITCODE -ne 0) { Write-Fail "pip install failed" }
Write-OK "Dependencies installed"

Write-Step "Applying database migrations..."

$env:RIFFA_BACKEND_ENV_FILE = Join-Path $BACK ".env.dev"
$alembicResult = & $PY -m alembic upgrade head 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Warn "alembic upgrade head finished with warning:"
    Write-Host $alembicResult -ForegroundColor Yellow
} else {
    Write-OK "Migrations applied"
}

Write-Step "Node.js dependencies..."

Set-Location $FRONT

if (-not (Test-Path (Join-Path $FRONT "node_modules"))) {
    Write-Host "   npm install..."
    npm install --silent
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed" }
} else {
    Write-OK "node_modules already present"
}

Write-Step "Starting services..."

function Start-Service($title, $workDir, $command) {
    Start-Process "powershell.exe" -ArgumentList `
        "-NoExit", `
        "-Command", `
        "cd '$workDir'; `$host.ui.RawUI.WindowTitle = '$title'; $command" `
        -WindowStyle Normal
    Start-Sleep 1
}

Start-Service `
    "RIFFA Backend (FastAPI)" `
    $BACK `
    "& '$PY' -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --env-file .env.dev"

Write-OK "Backend -> http://localhost:8000"
Write-OK "API docs -> http://localhost:8000/docs"

Start-Service `
    "RIFFA Worker (Arq)" `
    $BACK `
    "& '$PY' -m arq app.tasks.WorkerSettings --env-file .env.dev"

Write-OK "Arq worker started"

Start-Service `
    "RIFFA Frontend (Vite)" `
    $FRONT `
    "npm run dev"

Write-OK "Frontend -> http://localhost:5173"
Write-OK "MinIO Console -> http://localhost:9001  (admin/admin: minioadmin/minioadmin)"

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  All services started!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Site:      http://localhost:5173" -ForegroundColor Cyan
Write-Host "  API docs:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  MinIO:     http://localhost:9001" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To stop:" -ForegroundColor Yellow
Write-Host "  docker compose down" -ForegroundColor Yellow
Write-Host "  + close Backend, Worker, Frontend windows" -ForegroundColor Yellow
Write-Host ""

Read-Host "Press Enter to close"
