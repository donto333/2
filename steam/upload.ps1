# 천하: 패왕의 시대 — Steam 업로드 (SteamPipe / steamcmd)
#
# 사용 예:
#   .\steam\upload.ps1 -AppId 1234560 -DepotId 1234561 -Username 내스팀계정 -Content C:\cheonha-steam-windows-x64
#
#   -Content  : GitHub Actions에서 받은 cheonha-steam-windows-x64 ZIP을 푼 폴더 (Cheonha.exe가 들어 있는 폴더)
#   -SetLive  : 업로드 후 바로 적용할 브랜치 이름 (예: beta). 비워 두면 업로드만 하고 적용은 Steamworks 사이트에서 직접 합니다.
#   -SteamCmd : steamcmd.exe 경로 (기본: PATH에서 찾음)
#
# 처음 로그인할 때 Steam Guard 코드를 물어봅니다. 비밀번호는 이 스크립트에 저장하지 않습니다.
param(
  [Parameter(Mandatory = $true)][string]$AppId,
  [Parameter(Mandatory = $true)][string]$DepotId,
  [Parameter(Mandatory = $true)][string]$Username,
  [Parameter(Mandatory = $true)][string]$Content,
  [string]$Desc = "Cheonha desktop build",
  [string]$SetLive = "",
  [string]$SteamCmd = "steamcmd.exe"
)

$ErrorActionPreference = 'Stop'
$content = (Resolve-Path $Content).Path
if (-not (Test-Path (Join-Path $content 'Cheonha.exe'))) { throw "Cheonha.exe가 없습니다: $content" }
if ($AppId -eq '480') { throw 'App ID 480(Spacewar)은 테스트 전용이라 업로드할 수 없습니다. Steamworks에서 받은 실제 App ID를 쓰세요.' }

$work = Join-Path $PSScriptRoot 'build-output'
New-Item -ItemType Directory -Force -Path $work | Out-Null

$template = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'app_build.template.vdf')
$vdf = $template.Replace('{{APP_ID}}', $AppId).Replace('{{DEPOT_ID}}', $DepotId).Replace('{{DESC}}', $Desc).
  Replace('{{CONTENT_ROOT}}', $content).Replace('{{BUILD_OUTPUT}}', $work).Replace('{{SET_LIVE}}', $SetLive)
$vdfPath = Join-Path $work "app_build_$AppId.vdf"
$utf8 = New-Object System.Text.UTF8Encoding($false)  # BOM 없는 UTF-8
[IO.File]::WriteAllText($vdfPath, $vdf, $utf8)

# 설치 폴더의 설정 파일에 실제 App ID를 기록한다.
$configPath = Join-Path $content 'cheonharo.config.json'
if (Test-Path $configPath) {
  $config = Get-Content -Raw -Encoding UTF8 $configPath | ConvertFrom-Json
  $config.steamAppId = [int]$AppId
  [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json), $utf8)
}

Write-Host "업로드 설정: $vdfPath"
& $SteamCmd +login $Username +run_app_build $vdfPath +quit
if ($LASTEXITCODE -ne 0) { throw "steamcmd 실패 (종료 코드 $LASTEXITCODE)" }
Write-Host '업로드 완료. Steamworks 파트너 사이트 → SteamPipe → 빌드에서 확인하세요.'
