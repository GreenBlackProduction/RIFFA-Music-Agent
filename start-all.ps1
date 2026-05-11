# ============================================================
#  RIFFA Web -- single-window dev launcher
#
#  Run:  .\start-all.ps1
#  Stop: Ctrl+C
#
#  What it does:
#    1. Checks Docker / venv / node_modules
#    2. Starts Docker containers (db, redis, minio) if needed
#    3. Kills stale uvicorn/arq processes
#    4. Starts backend, worker, frontend as background Jobs
#    5. Streams all output with colored prefixes [BACK] [WORK] [FRONT]
#    6. Ctrl+C cleanly stops everything
# ============================================================

$ErrorActionPreference = "Continue"

$ROOT  = $PSScriptRoot
$BACK  = Join-Path $ROOT "backend"
$FRONT = Join-Path $ROOT "frontend"
$PY    = Join-Path $BACK ".venv\Scripts\python.exe"

function Write-Header($msg) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Magenta
    Write-Host "  $msg" -ForegroundColor Magenta
    Write-Host "============================================================" -ForegroundColor Magenta
}

function Write-Step($msg) { Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   !! $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

# ------ 1. Pre-flight ------
Write-Header "RIFFA Web -- dev stack"

Write-Step "Pre-flight checks"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Fail "Docker not installed" }
if (-not (Test-Path $PY))                                    { Write-Fail "venv not found: $PY  (run start-dev.ps1 first)" }
if (-not (Test-Path (Join-Path $FRONT "node_modules")))      { Write-Fail "node_modules missing in $FRONT  (run npm install)" }
Write-OK "venv OK"
Write-OK "node_modules OK"

# ------ 2. Docker containers ------
Write-Step "Docker containers"
Set-Location $ROOT
$dockerInfo = docker compose ps --format json 2>&1
$running = ($dockerInfo -join "") -split "}" | Where-Object { $_ -match '"State":"running"' } | Measure-Object | Select-Object -ExpandProperty Count
if ($running -lt 3) {
    Write-Warn "Starting db, redis, minio..."
    docker compose up -d 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up failed" }
} else {
    Write-OK "All 3 containers running"
}

Write-Host "   Waiting for PostgreSQL" -NoNewline
for ($i = 0; $i -lt 20; $i++) {
    $r = docker compose exec -T db pg_isready -U riffa 2>&1
    if ($r -match "accepting connections") { break }
    Start-Sleep 1
    Write-Host "." -NoNewline
}
Write-Host ""
Write-OK "PostgreSQL ready"

# ------ 3. Kill stale processes ------
Write-Step "Cleaning stale processes"
$killed = 0
Get-Process -Name "python" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cmd -and ($cmd -like "*uvicorn*" -or $cmd -like "*arq*")) {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        $killed++
    }
}
Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    $killed++
}
if ($killed -gt 0) { Write-OK "Killed $killed stale process(es)" } else { Write-OK "No stale processes" }
Start-Sleep 2

# ------ 4. Start services as Jobs ------
Write-Step "Starting backend / worker / frontend"

$Jobs = [ordered]@{}

$Jobs.BACK = Start-Job -Name "BACK" -ArgumentList $PY, $BACK -ScriptBlock {
    param($py, $back)
    Set-Location $back
    & $py -u -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 2>&1
}

$Jobs.WORK = Start-Job -Name "WORK" -ArgumentList $PY, $BACK -ScriptBlock {
    param($py, $back)
    Set-Location $back
    & $py -u -m arq app.tasks.WorkerSettings 2>&1
}

$Jobs.FRONT = Start-Job -Name "FRONT" -ArgumentList $FRONT -ScriptBlock {
    param($front)
    Set-Location $front
    & npm run dev 2>&1
}

Write-OK "BACK  (job $($Jobs.BACK.Id))  -> http://localhost:8000"
Write-OK "WORK  (job $($Jobs.WORK.Id))  -> arq worker"
Write-OK "FRONT (job $($Jobs.FRONT.Id)) -> http://localhost:5173"

Write-Header "Live logs  --  Ctrl+C to stop"
Write-Host ""

$colors = @{
    BACK  = 'Cyan'
    WORK  = 'Yellow'
    FRONT = 'Green'
}

# ------ 5. Stream output ------
$cleanup = {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Magenta
    Write-Host "  Stopping RIFFA dev stack..." -ForegroundColor Magenta
    Write-Host "============================================================" -ForegroundColor Magenta

    foreach ($n in $Jobs.Keys) {
        $j = $Jobs[$n]
        if ($j -and $j.State -eq 'Running') {
            Stop-Job -Job $j -ErrorAction SilentlyContinue
        }
    }
    Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue

    Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Get-Process -Name "python" -ErrorAction SilentlyContinue | ForEach-Object {
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
        if ($cmd -and ($cmd -like "*uvicorn*" -or $cmd -like "*arq*")) {
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "  Done. Docker containers still running (docker compose down to stop)." -ForegroundColor Green
}

[Console]::TreatControlCAsInput = $false

try {
    while ($true) {
        foreach ($name in $Jobs.Keys) {
            $j = $Jobs[$name]
            $lines = Receive-Job -Job $j -ErrorAction SilentlyContinue
            if ($lines) {
                $color = $colors[$name]
                foreach ($line in $lines) {
                    $text = if ($line -is [System.Management.Automation.ErrorRecord]) {
                        "ERR: $($line.Exception.Message)"
                    } else {
                        $line.ToString()
                    }
                    if ($text) {
                        Write-Host "[$name] " -NoNewline -ForegroundColor $color
                        Write-Host $text
                    }
                }
            }
        }

        $dead = $Jobs.Values | Where-Object { $_.State -eq 'Failed' -or $_.State -eq 'Completed' }
        if ($dead) {
            foreach ($d in $dead) {
                Write-Host "[$($d.Name)] *** job ended (state=$($d.State)) ***" -ForegroundColor Red
            }
            break
        }

        Start-Sleep -Milliseconds 300
    }
} finally {
    & $cleanup
}
