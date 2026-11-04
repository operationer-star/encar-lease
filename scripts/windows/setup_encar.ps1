# 엔카 HEV 승계 수집 — PC 자동 실행 1회 설치 스크립트 (PowerShell)
# 실행: 마우스 오른쪽 → "PowerShell로 실행", 또는 PowerShell에서  powershell -ExecutionPolicy Bypass -File .\setup_encar.ps1
$ErrorActionPreference = 'Stop'
$repoUrl = 'https://github.com/operationer-star/encar-lease.git'
$repo = Join-Path $env:USERPROFILE 'encar-lease'

function Need($cmd, $hint) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Host "[필요] $cmd 가 없습니다. 설치: $hint" -ForegroundColor Yellow; return $false }; return $true }
$ok = $true
$ok = (Need 'git'  'winget install --id Git.Git -e') -and $ok
$ok = (Need 'node' 'winget install --id OpenJS.NodeJS.LTS -e') -and $ok
if (-not $ok) { Write-Host '위 프로그램을 설치한 뒤 이 스크립트를 다시 실행하세요.'; Read-Host '엔터를 누르면 닫힙니다'; exit 1 }
Write-Host "git $(git --version) / node $(node -v)"

if (-not (Test-Path (Join-Path $repo '.git'))) {
  Write-Host "저장소를 $repo 에 복제합니다…"
  git clone $repoUrl $repo
} else {
  Write-Host "저장소가 이미 있습니다: $repo"; git -C $repo pull --rebase origin main
}

# 작업 스케줄러 등록: 매주 월요일 08:00, 놓치면 다음 켜질 때 실행
$taskName = 'Encar HEV 승계 수집'
$cmd = Join-Path $repo 'scripts\windows\run_encar.cmd'
$action  = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$cmd`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 08:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description '엔카 그랜저·카니발 HEV 리스/렌트 승계 매물 주간 수집 → GitHub Pages' -Force | Out-Null
Write-Host "작업 스케줄러 등록 완료: '$taskName' (매주 월 08:00, 놓치면 다음 켜질 때)" -ForegroundColor Green

Write-Host ''
Write-Host '지금 1회 실행해서 확인할까요? (GitHub 로그인 창이 뜨면 브라우저에서 로그인 — 최초 1회)'
$r = Read-Host 'Y 입력 후 엔터 = 지금 실행 / 그냥 엔터 = 나중에'
if ($r -eq 'Y' -or $r -eq 'y') {
  & cmd.exe /c "`"$cmd`""
  $log = Get-ChildItem (Join-Path $repo 'logs') | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  Write-Host "----- 로그: $($log.FullName)"; Get-Content $log.FullName -Tail 40
}
Read-Host '엔터를 누르면 닫힙니다'
