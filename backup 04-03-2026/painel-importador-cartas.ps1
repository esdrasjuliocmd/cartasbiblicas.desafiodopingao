param(
  [string]$ApiBase = "https://quem-sou-eu-backend-v4.esdrasjulio.workers.dev",
  [ValidateSet("personagens","profecias","pregacao","desenho","mimica")]
  [string]$Categoria = "personagens",
  [ValidateSet("gerar-exemplo","validar","publicar")]
  [string]$Acao = "publicar",
  [string]$Arquivo = "",
  [string]$BackupDir = ".\backups"
)

$ErrorActionPreference = "Stop"
$ApiBase = $ApiBase.TrimEnd("/")
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path | Out-Null }
}

function Write-Utf8File([string]$path, [string]$content) {
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

function Load-CartasFromFile([string]$path) {
  $obj = (Get-Content -Raw -Encoding utf8 $path) | ConvertFrom-Json

  # { cartas: [...] }
  if ($obj -and ($obj.PSObject.Properties.Name -contains "cartas")) { return @($obj.cartas) }

  # { personagens: [ { value: [...] } ] } ou { personagens: [...] }
  if ($obj -and ($obj.PSObject.Properties.Name -contains "personagens")) {
    $p = $obj.personagens
    if ($p -is [System.Array] -and $p.Count -gt 0 -and ($p[0].PSObject.Properties.Name -contains "value")) {
      return @($p[0].value)
    }
    return @($p)
  }

  # array direto
  if ($obj -is [System.Array]) { return @($obj) }

  throw "Formato não reconhecido em $path (esperado {cartas:[...]}, array [...], ou {personagens:[{value:[...]}]})."
}

function Clamp-Dificuldade($v) {
  $n = $null
  try { $n = [int]$v } catch { $n = 5 }
  if ($n -lt 0) { return 0 }
  if ($n -gt 10) { return 10 }
  return $n
}

function Normalize-Carta($c) {
  $resposta =
    if ($null -ne $c.resposta -and ([string]$c.resposta).Trim().Length -gt 0) { [string]$c.resposta }
    elseif ($null -ne $c.palavra -and ([string]$c.palavra).Trim().Length -gt 0) { [string]$c.palavra }
    else { "" }

  [pscustomobject]@{
    resposta    = $resposta.Trim()
    dica1       = (if ($null -ne $c.dica1) { [string]$c.dica1 } else { "" }).Trim()
    dica2       = (if ($null -ne $c.dica2) { [string]$c.dica2 } else { "" }).Trim()
    dica3       = (if ($null -ne $c.dica3) { [string]$c.dica3 } else { "" }).Trim()
    genero      = if ($null -ne $c.genero -and ([string]$c.genero).Trim().Length -gt 0) { [string]$c.genero } else { $null }
    masculino   = if ($c.masculino -eq $true -or $c.masculino -eq 1) { 1 } else { 0 }
    feminino    = if ($c.feminino -eq $true -or $c.feminino -eq 1) { 1 } else { 0 }
    dificuldade = Clamp-Dificuldade ($c.dificuldade)
  }
}

function Validate-Cartas([object[]]$raw) {
  $validas = New-Object System.Collections.Generic.List[object]
  $invalidas = New-Object System.Collections.Generic.List[object]

  for ($i=0; $i -lt $raw.Count; $i++) {
    $n = Normalize-Carta $raw[$i]
    if ($n.resposta -and $n.dica1 -and $n.dica2 -and $n.dica3) {
      $validas.Add($n) | Out-Null
    } else {
      $invalidas.Add([pscustomobject]@{ index=$i; carta=$n }) | Out-Null
    }
  }

  # IMPORTANTE: converter List -> Array (evita erro "Os tipos de argumento não correspondem")
  return [pscustomobject]@{
    validas   = $validas.ToArray()
    invalidas = $invalidas.ToArray()
  }
}

function Backup-Categoria([string]$categoria) {
  Ensure-Dir $BackupDir
  $url = "$ApiBase/cartas/$categoria"
  $data = Invoke-RestMethod -Uri $url -Method Get -Headers @{Accept="application/json"}

  $stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
  $file = Join-Path $BackupDir "backup-$categoria-$stamp.json"
  ([ordered]@{ cartas = @($data.cartas) }) | ConvertTo-Json -Depth 50 | Out-File -Encoding utf8 $file

  Write-Host "Backup OK: $file (total=$(@($data.cartas).Count))"
  return $file
}

function Publicar([string]$categoria, [object[]]$cartas) {
  $payload = ([ordered]@{ cartas = @($cartas) }) | ConvertTo-Json -Depth 50

  $tmp = New-TemporaryFile
  Write-Utf8File $tmp.FullName $payload

  $url = "$ApiBase/cartas/$categoria/popular"
  $resp = Invoke-WebRequest -Method Post -Uri $url -ContentType "application/json; charset=utf-8" -InFile $tmp.FullName -UseBasicParsing

  Remove-Item $tmp.FullName -Force -ErrorAction SilentlyContinue

  Write-Host "Publicado. HTTP: $($resp.StatusCode)"
  if ($resp.Content) { Write-Host $resp.Content }
}

function Gerar-Exemplo([string]$categoria) {
  $ex = [ordered]@{
    cartas = @(
      [ordered]@{
        resposta    = ""
        dica1       = ""
        dica2       = ""
        dica3       = ""
        genero      = $null
        masculino   = 0
        feminino    = 0
        dificuldade = 5
      }
    )
  } | ConvertTo-Json -Depth 10

  $file = ".\exemplo-$categoria.json"
  $ex | Out-File -Encoding utf8 $file
  Write-Host "Gerado: $file"
}

# ---------------- MAIN ----------------
Write-Host "API: $ApiBase"
Write-Host "Categoria: $Categoria"
Write-Host "Ação: $Acao"
if ($Arquivo) { Write-Host "Arquivo: $Arquivo" }
Write-Host ""

switch ($Acao) {
  "gerar-exemplo" {
    Gerar-Exemplo $Categoria
    exit 0
  }

  "validar" {
    if (-not $Arquivo) { throw "Informe -Arquivo" }
    $raw = Load-CartasFromFile $Arquivo
    $r = Validate-Cartas $raw
    Write-Host "Válidas: $(@($r.validas).Count)"
    Write-Host "Inválidas: $(@($r.invalidas).Count)"
    if (@($r.validas).Count -gt 0) {
      Write-Host ""
      Write-Host "Amostra (1ª carta válida):"
      $r.validas[0] | ConvertTo-Json -Depth 10 | Write-Host
    }
    exit 0
  }

  "publicar" {
    if (-not $Arquivo) { throw "Informe -Arquivo" }

    $raw = Load-CartasFromFile $Arquivo
    $r = Validate-Cartas $raw

    Write-Host "Válidas: $(@($r.validas).Count) | Inválidas (serão ignoradas): $(@($r.invalidas).Count)"
    if (@($r.validas).Count -eq 0) { throw "Nenhuma carta válida para publicar." }

    $confirm = Read-Host "CONFIRME: digite SIM para publicar e SUBSTITUIR a categoria '$Categoria'"
    if ($confirm -ne "SIM") { throw "Cancelado." }

    Backup-Categoria $Categoria | Out-Null
    Publicar $Categoria $r.validas
    exit 0
  }
}