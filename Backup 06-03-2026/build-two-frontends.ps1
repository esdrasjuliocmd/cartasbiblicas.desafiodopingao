$ErrorActionPreference = "Stop"

function New-Dist($distDir, $apiBase) {
  if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
  New-Item -ItemType Directory -Path $distDir | Out-Null

  # Copia arquivos HTML
  Copy-Item -Path ".\*.html" -Destination $distDir -Force

  # Copia pastas comuns (se existirem)
  foreach ($dir in @("assets","styles","scripts")) {
    if (Test-Path ".\$dir") { Copy-Item ".\$dir" "$distDir\$dir" -Recurse -Force }
  }

  # Sempre gera/ sobrescreve config.js do ambiente
  @"
window.APP_CONFIG = {
  API_BASE: "$apiBase"
};
"@ | Set-Content -Path "$distDir\config.js" -Encoding UTF8

  Write-Host "OK: $distDir criado com API_BASE=$apiBase"
}

$API_PROD    = "https://quem-sou-eu-backend-v4-production.esdrasjulio.workers.dev"
$API_STAGING = "https://quem-sou-eu-backend-v4.esdrasjulio.workers.dev"

New-Dist ".\dist-prod"    $API_PROD
New-Dist ".\dist-staging" $API_STAGING
