# Email Scheduler Process Cleanup Script
# Use this to clean up stray Node.js processes

Write-Host "Email Scheduler - Process Cleanup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Get all Node.js processes
$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue

if (-not $nodeProcesses) {
    Write-Host "No Node.js processes found." -ForegroundColor Green
    exit 0
}

Write-Host "Found $($nodeProcesses.Count) Node.js process(es):" -ForegroundColor Yellow
Write-Host ""

$nodeProcesses | Format-Table Id, ProcessName, StartTime, @{Name="Memory(MB)";Expression={[math]::Round($_.WorkingSet64/1MB,2)}} -AutoSize

Write-Host ""
$confirmation = Read-Host "Do you want to stop ALL Node.js processes? (y/N)"

if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
    Write-Host ""
    Write-Host "Stopping Node.js processes..." -ForegroundColor Red
    
    try {
        Stop-Process -Name node -Force -ErrorAction Stop
        Write-Host "All Node.js processes stopped successfully." -ForegroundColor Green
    }
    catch {
        Write-Host "Error stopping processes: $_" -ForegroundColor Red
    }
}
else {
    Write-Host "Operation cancelled." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done." -ForegroundColor Cyan
