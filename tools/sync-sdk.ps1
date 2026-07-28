# sync-sdk.ps1
# 一键从 GAOS 官方仓库同步最新 SDK 到 sdk/ 子目录（subtree 模式）

$ErrorActionPreference = "Stop"

Write-Host "[sync-sdk] Fetching from GAOS-Official..." -ForegroundColor Cyan
git fetch GAOS-Official main

Write-Host "[sync-sdk] Pulling subtree updates..." -ForegroundColor Cyan
git subtree pull --prefix=sdk GAOS-Official main --squash -m "Merge GAOS SDK updates"

Write-Host "[sync-sdk] Done. SDK is now in sync with GAOS-Official/main." -ForegroundColor Green
