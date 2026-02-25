param(
  [switch]$Deploy,
  [switch]$DryRun,
  [string]$ApiBase = "https://quem-sou-eu-backend-v4.esdrasjulio.workers.dev",
  [string]$Arquivo = "cartas-biblicas.json"
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host $msg }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

if (-not (Test-Path -LiteralPath $Arquivo)) {
  Write-Err "Arquivo não encontrado: $Arquivo"
  exit 1
}

$tmpPayload = [System.IO.Path]::GetTempFileName()

try {
  $jsonText = Get-Content -LiteralPath $Arquivo -Encoding Unicode -Raw
  $obj = $jsonText | ConvertFrom-Json

  if (-not $obj.personagens -or -not $obj.personagens[0].value) {
    Write-Err "Estrutura inválida no JSON: esperado personagens[0].value"
    exit 1
  }

  $cartas = @($obj.personagens[0].value)
  $totalLocal = $cartas.Count

  $payloadObj = [ordered]@{ cartas = $cartas }
  $payloadJson = $payloadObj | ConvertTo-Json -Depth 20
  Set-Content -LiteralPath $tmpPayload -Value $payloadJson -Encoding UTF8

  Write-Info "📦 Cartas locais de personagens encontradas: $totalLocal"
  Write-Info "🌐 API alvo: $ApiBase"

  if ($DryRun) {
    Write-Info "⚠️ Dry-run ativo: não será feito deploy nem envio para produção."
    exit 0
  }

  if ($Deploy) {
    Write-Info "🚀 Executando deploy do Worker..."
    npm run deploy
  }

  Write-Info "📤 Enviando payload para /cartas/personagens/popular ..."

  $urlPopular = "$ApiBase/cartas/personagens/popular"
  $respPublicar = Invoke-WebRequest -Method Post -Uri $urlPopular -ContentType 'application/json; charset=utf-8' -InFile $tmpPayload -UseBasicParsing

  if ($respPublicar.StatusCode -lt 200 -or $respPublicar.StatusCode -ge 300) {
    Write-Err "❌ Falha ao publicar. HTTP $($respPublicar.StatusCode)"
    if ($respPublicar.Content) { Write-Host $respPublicar.Content }
    exit 1
  }

  Write-Info "✅ Publicação concluída. Validando contagem em produção..."

  $urlGet = "$ApiBase/cartas/personagens"
  $respGet = Invoke-RestMethod -Method Get -Uri $urlGet

  $totalProd = @($respGet.cartas).Count
  Write-Info "📊 Total em produção (personagens): $totalProd"

  if ($totalProd -ne $totalLocal) {
    Write-Err "⚠️ Atenção: total em produção difere do local (local=$totalLocal, produção=$totalProd)."
    exit 1
  }

  Write-Info "🎉 Sucesso! Produção está com $totalProd cartas em personagens."
  exit 0
}
catch {
  Write-Err "❌ Erro durante a execução: $($_.Exception.Message)"
  exit 1
}
finally {
  if (Test-Path -LiteralPath $tmpPayload) {
    Remove-Item -LiteralPath $tmpPayload -Force -ErrorAction SilentlyContinue
  }
}
