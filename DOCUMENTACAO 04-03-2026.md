# Documentação (Atualizada): Staging e Produção — Cartas Bíblicas / Desafio do Pingão  
Cloudflare Pages (Frontend) + Cloudflare Workers (Backend)

**Data de referência:** 2026-03-05  
**Objetivo:** padronizar deploy (staging/produção), explicar estrutura local e registrar as correções/melhorias aplicadas no jogo solo.

---

## 0) Visão geral (o que existe)

Este projeto possui **dois ambientes independentes**:

- **Staging (homologação/testes)**
- **Produção (site oficial)**

A separação ocorre em **duas camadas**:

1) **Frontend (Cloudflare Pages)**  
   - site estático (HTML/CSS/JS)
   - publicado por ambiente

2) **Backend (Cloudflare Workers)**  
   - API separada por ambiente

---

## 1) URLs por ambiente

### 1.1 Frontend (Cloudflare Pages)

- **Produção**
  - Projeto Pages: `jogo-prod`
  - URL Pages: `https://jogo-prod.pages.dev`
  - Domínio customizado: (conforme configurado no Cloudflare Pages)

- **Staging**
  - Projeto Pages: `jogo-staging`
  - URL Pages: `https://jogo-staging.pages.dev`
  - Observação: aparece “Sem conexão Git” (deploy via CLI/upload)

### 1.2 Backend (Cloudflare Workers)

- **Produção**
  - Worker: `quem-sou-eu-backend-v4-production`
  - Base URL: `https://quem-sou-eu-backend-v4-production.esdrasjulio.workers.dev`

- **Staging**
  - Worker: `quem-sou-eu-backend-v4`
  - Base URL: `https://quem-sou-eu-backend-v4.esdrasjulio.workers.dev`

---

## 2) Estrutura local do projeto (pasta de trabalho)

Caminho (Windows):
- `C:\Users\EJP\Desktop\cartasbiblicas\desafiodopingao-cartasbiblicas\`

Arquivos/pastas principais:
- `dist-prod/` → build estático do **frontend de produção**
- `dist-staging/` → build estático do **frontend de staging**
- `build-two-frontends.ps1` → script que gera `dist-prod` e `dist-staging` com `config.js` correto
- `worker.js` → código do backend (Worker)
- `wrangler.toml` → configuração do Wrangler (infra/deploy, se usado)

**Importante:** o frontend é estático e **não precisa** de `npm install` nem `npm run build`.  
O “build” é só cópia de arquivos + geração do `config.js`.

---

## 3) Como o frontend aponta para o backend

O frontend usa o arquivo `config.js` para definir a base da API.

### 3.1 Staging — `dist-staging/config.js` (esperado)
```js
window.APP_CONFIG = {
  API_BASE: "https://quem-sou-eu-backend-v4.esdrasjulio.workers.dev"
};
```

### 3.2 Produção — `dist-prod/config.js` (esperado)
```js
window.APP_CONFIG = {
  API_BASE: "https://quem-sou-eu-backend-v4-production.esdrasjulio.workers.dev"
};
```

---

## 4) Regerar `dist-prod` e `dist-staging`

### 4.1 Rodar o script de build dos 2 frontends
No PowerShell:

```powershell
cd "C:\Users\EJP\Desktop\cartasbiblicas\desafiodopingao-cartasbiblicas"
.\build-two-frontends.ps1
```

O script:
- apaga `dist-prod` e `dist-staging` se existirem
- copia `.\*.html` para cada `dist-*`
- copia pastas comuns (se existirem): `assets/`, `styles/`, `scripts/`
- gera `config.js` com `API_BASE` correspondente (UTF-8)

### 4.2 Conferir rapidamente o `config.js`
```powershell
Get-Content .\dist-staging\config.js
Get-Content .\dist-prod\config.js
```

---

## 5) Deploy no Cloudflare Pages (Frontend)

### 5.1 Deploy STAGING (projeto `jogo-staging`)
Publica a pasta `dist-staging/` no Pages:

```powershell
cd "C:\Users\EJP\Desktop\cartasbiblicas\desafiodopingao-cartasbiblicas"
npx wrangler@latest pages deploy .\dist-staging --project-name jogo-staging
```

### 5.2 Deploy PRODUÇÃO (projeto `jogo-prod`)
Publica a pasta `dist-prod/` no Pages:

```powershell
cd "C:\Users\EJP\Desktop\cartasbiblicas\desafiodopingao-cartasbiblicas"
npx wrangler@latest pages deploy .\dist-prod --project-name jogo-prod
```

**Observações úteis:**
- Warning `pages_build_output_dir` no `wrangler.toml`: não impede deploy (deploy direto do diretório indicado).
- Warning `git repo and has uncommitted changes`: é informativo; pode silenciar com `--commit-dirty=true` (opcional).

---

## 6) Backup completo antes de publicar (recomendado)

### 6.1 Backup local (cópia da pasta inteira)
```powershell
$SRC = "C:\Users\EJP\Desktop\cartasbiblicas\desafiodopingao-cartasbiblicas"
$STAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$DEST_ROOT = "C:\Users\EJP\Desktop\BACKUP-cartasbiblicas"
$DEST = Join-Path $DEST_ROOT "desafiodopingao-cartasbiblicas_$STAMP"

New-Item -ItemType Directory -Force -Path $DEST | Out-Null
Copy-Item -Path $SRC -Destination $DEST -Recurse -Force

Write-Host "✅ Backup criado em: $DEST"
```

### 6.2 (Opcional) Zipar o backup
```powershell
$STAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$DEST_ROOT = "C:\Users\EJP\Desktop\BACKUP-cartasbiblicas"
$FOLDER = Get-ChildItem $DEST_ROOT -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$ZIP = Join-Path $DEST_ROOT ($FOLDER.Name + ".zip")

Compress-Archive -Path $FOLDER.FullName -DestinationPath $ZIP -Force
Write-Host "✅ ZIP criado em: $ZIP"
```

---

## 7) Troubleshooting rápido (Pages fora do ar)

### Sintoma: “Nothing is here yet”
Mensagem típica:
> “Nothing is here yet… Runs on Cloudflare Pages”

Causa:
- o projeto Pages existe, mas **não há deploy publicado**.

Correção:
- rodar o deploy novamente (staging ou produção conforme o caso).

---

## 8) Correções e melhorias aplicadas (2026-03-05)

### 8.1 Banner do jogador no jogo solo: “PONTOS (TOTAL)” e “RANKING”
**Problema observado:**  
No staging, durante o jogo solo, o banner mostrava:
- “PONTOS (TOTAL)” como pontos da partida (ou zerado), mas o esperado era o total do ranking
- “RANKING” ficava como `—`

**Correção aplicada (Modo A):**
- “PONTOS (TOTAL)” agora mostra **o total do ranking no backend** (endpoint `/ranking`)
- “RANKING” agora mostra **a posição global do jogador**
- comparação de nomes passou a ser “tolerante”:
  - remove acentos
  - normaliza espaços
  - ignora diferença de maiúsculas/minúsculas

**Como funciona:**
- lê `nomeJogador`
- faz `GET ${API_BASE}/ranking`
- procura o jogador pelo nome normalizado
- se encontrar:
  - mostra `pontos` do ranking no campo `PONTOS (TOTAL)`
  - mostra `posição` como `index + 1`
- se não encontrar:
  - mostra `0` e `—`

**Performance/estabilidade:**
- cache simples de ranking por ~15s, evitando chamar `/ranking` em toda pergunta
- refresh “leve” a cada 15s durante a pergunta (com cache)

---

### 8.2 Ajuste de layout no celular: botões de categoria menores (tela inicial)
**Problema observado:**  
Em telas mobile, os botões de categoria estavam altos e “empurravam” o botão **🚀 Iniciar Jogo** para baixo, exigindo rolagem.

**Correção aplicada:**
- redução de espaçamento e tamanho dos botões de categoria via `@media (max-width: 420px)`
- ajustes no tamanho do título e caixa amarela para caber melhor

Resultado: a tela inicial fica mais “compacta” e o usuário acessa mais fácil o botão **Iniciar Jogo**.

---

## 9) Checklist (antes de publicar em produção)

1) Fazer backup local (pasta inteira)
2) Rodar:
   - `.\build-two-frontends.ps1`
3) Confirmar:
   - `dist-staging/config.js` aponta para Worker staging
   - `dist-prod/config.js` aponta para Worker produção
4) Deploy staging (se quiser testar primeiro):
   - `npx wrangler@latest pages deploy .\dist-staging --project-name jogo-staging`
5) Deploy produção:
   - `npx wrangler@latest pages deploy .\dist-prod --project-name jogo-prod`
6) Validar:
   - Produção: `https://jogo-prod.pages.dev`
   - Domínio customizado (se aplicável)

---

## 10) Notas importantes
- O projeto é **estático**: não há build de bundler.
- O “controle de ambiente” é feito por:
  - duas pastas (`dist-staging` e `dist-prod`)
  - `config.js` específico de cada ambiente
- O ranking é fornecido pelo backend em `/ranking`.