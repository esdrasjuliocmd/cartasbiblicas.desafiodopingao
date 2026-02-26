param(
  [switch]$Deploy,
  [switch]$DryRun,
  [switch]$FixEncoding,
  [string]$ApiBase = "https://quem-sou-eu-backend-v4.esdrasjulio.workers.dev",
  [string]$Arquivo = "cartas-biblicas.json"
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host $msg }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

function Repair-TextEncoding([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return $text }
  if ($text -match '[ÃÂâ]') {
    $latin1 = [System.Text.Encoding]::GetEncoding(28591)
    $bytes = $latin1.GetBytes($text)
    return [System.Text.Encoding]::UTF8.GetString($bytes)
  }
  return $text
}

if (-not (Test-Path -LiteralPath $Arquivo)) {
  Write-Err "Arquivo nao encontrado: $Arquivo"
  exit 1
}

$tmpPayload = [System.IO.Path]::GetTempFileName()

try {
  # Força UTF-8 sem BOM na leitura
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $jsonBytes = [System.IO.File]::ReadAllBytes($Arquivo)
  $jsonText = $utf8NoBom.GetString($jsonBytes)
  $obj = $jsonText | ConvertFrom-Json

  if (-not $obj.personagens -or -not $obj.personagens[0].value) {
    Write-Err "Estrutura invalida no JSON: esperado personagens[0].value"
    exit 1
  }

  $cartas = @($obj.personagens[0].value)

  if ($FixEncoding) {
    Write-Info "Corrigindo textos com encoding quebrado..."
    $cartas = @(
      foreach ($c in $cartas) {
        $dificuldade = 5
        if ($null -ne $c.dificuldade -and "$($c.dificuldade)" -match '^\d+$') {
          $dificuldade = [Math]::Max(0, [Math]::Min(10, [int]$c.dificuldade))
        }

        [ordered]@{
          resposta    = Repair-TextEncoding ([string]$c.resposta)
          dica1       = Repair-TextEncoding ([string]$c.dica1)
          dica2       = Repair-TextEncoding ([string]$c.dica2)
          dica3       = Repair-TextEncoding ([string]$c.dica3)
          genero      = if ($null -ne $c.genero) { ([string]$c.genero).ToLower() } else { $null }
          masculino   = ($c.masculino -eq $true -or $c.masculino -eq 1)
          feminino    = ($c.feminino -eq $true -or $c.feminino -eq 1)
          dificuldade = $dificuldade
        }
      }
    )
  }

  $totalLocal = $cartas.Count
  $payloadObj = [ordered]@{ cartas = $cartas }
  $payloadJson = $payloadObj | ConvertTo-Json -Depth 20 -Compress:$false
  # Garante UTF-8 sem BOM na escrita
  $utf8NoBomWrite = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($tmpPayload, $payloadJson, $utf8NoBomWrite)

  Write-Info "Cartas locais encontradas: $totalLocal"
  Write-Info "API alvo: $ApiBase"

  if ($DryRun) {
    Write-Info "Dry-run ativo: nao envia para producao."
    exit 0
  }

  if ($Deploy) {
    Write-Info "Executando deploy..."
    npm run deploy
  }

  $urlPopular = "$ApiBase/cartas/personagens/popular"

  try {
    $respPublicar = Invoke-WebRequest -Method Post -Uri $urlPopular -ContentType 'application/json; charset=utf-8' -InFile $tmpPayload -UseBasicParsing
  }
  catch {
    $erroWeb = $_.Exception.Response
    if ($erroWeb -and $erroWeb.GetResponseStream) {
      $reader = New-Object System.IO.StreamReader($erroWeb.GetResponseStream())
      $corpo = $reader.ReadToEnd()
      if ($corpo) {
        Write-Err "Falha ao publicar. Resposta do servidor: $corpo"
      }
    }
    throw
  }

  if ($respPublicar.StatusCode -lt 200 -or $respPublicar.StatusCode -ge 300) {
    Write-Err "Falha ao publicar. HTTP $($respPublicar.StatusCode)"
    if ($respPublicar.Content) { Write-Host $respPublicar.Content }
    exit 1
  }

  $urlGet = "$ApiBase/cartas/personagens"
  $respGet = Invoke-RestMethod -Method Get -Uri $urlGet
  $totalProd = @($respGet.cartas).Count

  Write-Info "Total em producao (personagens): $totalProd"

  if ($totalProd -ne $totalLocal) {
    Write-Err "Atencao: total em producao difere do local (local=$totalLocal, producao=$totalProd)."
    exit 1
  }

  Write-Info "Sucesso."
  exit 0
}
catch {
  Write-Err "Erro durante execucao: $($_.Exception.Message)"
  exit 1
}
finally {
  if (Test-Path -LiteralPath $tmpPayload) {
    Remove-Item -LiteralPath $tmpPayload -Force -ErrorAction SilentlyContinue
  }
}
