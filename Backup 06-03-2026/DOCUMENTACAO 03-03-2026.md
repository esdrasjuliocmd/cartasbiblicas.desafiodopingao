# Documentação: Staging e Produção (Cartas Bíblicas / Desafio do Pingão) — Cloudflare Pages + Workers

Data de referência: 2026-03-03

Este projeto foi separado em dois ambientes independentes:

- **Staging** (testes/homologação)
- **Produção** (site oficial)

A separação acontece em **duas camadas**:
1) **Frontend (Cloudflare Pages)**: arquivos estáticos (HTML/JS/CSS) publicados por ambiente  
2) **Backend (Cloudflare Workers)**: API separada por ambiente

---

## 1) URLs por ambiente

### 1.1 Frontend (Cloudflare Pages)
- **Produção**
  - Projeto Pages: `jogo-prod`
  - URL Pages: `https://jogo-prod.pages.dev`
  - Domínio customizado: (o “Mais 1 outro domínio” configurado no Pages — ex.: `https://cartasbiblicas.desafiodopingao.com.br`)

- **Staging**
  - Pasta build local: `dist-staging/`
  - (Projeto Pages de staging pode existir com outro nome; quando existir, terá algo como `https://<nome>.pages.dev`)

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

Arquivos/pastas relevantes:
- `dist-prod/` → build estático do **frontend de produção**
- `dist-staging/` → build estático do **frontend de staging**
- `build-two-frontends.ps1` → script que gera as duas pastas `dist-*` com `config.js` correto
- `worker.js` → código do backend (Worker)
- `wrangler.toml` → configuração do Wrangler (deploy/infra)

---

## 3) Como o frontend “aponta” para o backend

O frontend usa o arquivo `config.js` para definir o endpoint da API:

### 3.1 Staging: `dist-staging/config.js`
Conteúdo esperado:
```js
window.APP_CONFIG = {
  API_BASE: "https://quem-sou-eu-backend-v4.esdrasjulio.workers.dev"
};
```

### 3.2 Produção: `dist-prod/config.js`
Conteúdo esperado:
```js
window.APP_CONFIG = {
  API_BASE: "https://quem-sou-eu-backend-v4-production.esdrasjulio.workers.dev"
};
```

---

## 4) Gerar (recriar) `dist-prod` e `dist-staging`

O script abaixo remove e recria as pastas de build, copiando os `.html` e gerando o `config.js` certo para cada ambiente:

Arquivo:
- `build-two-frontends.ps1`

Execução (PowerShell):
```powershell
cd "C:\Users\EJP\Desktop\cartasbiblicas\desafiodopingao-cartasbiblicas"
.\build-two-frontends.ps1
```

O script:
- apaga `dist-prod` e `dist-staging` se existirem
- copia `.\*.html` para cada `dist-*`
- copia pastas comuns se existirem: `assets/`, `styles/`, `scripts/`
- gera `config.js` com `API_BASE` correspondente (UTF-8)

---

## 5) Publicação no Cloudflare Pages (Frontend)

### 5.1 Produção (projeto `jogo-prod`)
Publicar a pasta `dist-prod/` no Pages:

```powershell
cd "C:\Users\EJP\Desktop\cartasbiblicas\desafiodopingao-cartasbiblicas"
npx wrangler@latest pages deploy .\dist-prod --project-name jogo-prod
```

Saída típica de sucesso:
- “Deployment complete!”
- URL de preview no formato: `https://<hash>.jogo-prod.pages.dev`

URL principal:
- `https://jogo-prod.pages.dev`

Observações:
- Se aparecer warning de `pages_build_output_dir` no `wrangler.toml`, o deploy ainda funciona (Wrangler ignora o toml e faz upload direto do diretório informado).
- O warning “git repo and has uncommitted changes” é apenas informativo; pode ser silenciado com `--commit-dirty=true` (opcional).

### 5.2 Staging (quando existir um projeto Pages de staging)
Se houver um projeto Pages de staging (ex.: `jogo-staging`), publique `dist-staging/` nele:

```powershell
cd "C:\Users\EJP\Desktop\cartasbiblicas\desafiodopingao-cartasbiblicas"
npx wrangler@latest pages deploy .\dist-staging --project-name jogo-staging
```

> Observação: o nome exato do projeto Pages de staging deve ser o que aparece no Cloudflare Dashboard (Workers & Pages → Pages).

---

## 6) Troubleshooting rápido (Pages fora do ar)

### Sintoma: aparece “Nothing is here yet”
Mensagem típica do Pages:
> “Nothing is here yet… Runs on Cloudflare Pages”

Causa:
- o projeto Pages existe, mas **não há deploy/arquivos publicados**.

Correção:
- publicar novamente com:
```powershell
npx wrangler@latest pages deploy .\dist-prod --project-name jogo-prod
```

---

## 7) Backend (Workers) — visão geral

Workers separados:
- staging: `quem-sou-eu-backend-v4`
- produção: `quem-sou-eu-backend-v4-production`

Endpoints usados pelo site/admin geralmente ficam sob essas bases.

Exemplo de teste de produção (PowerShell):
```powershell
$PROD = "https://quem-sou-eu-backend-v4-production.esdrasjulio.workers.dev"
Invoke-RestMethod "$PROD/adicionar" -Method POST -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes((@{ nome="Teste"; pontos=1 } | ConvertTo-Json -Compress)))
```

---

## 8) Checklist de consistência (antes de publicar)

1) Regerar builds:
- `.\build-two-frontends.ps1`

2) Verificar configs:
- `dist-staging\config.js` deve apontar para `quem-sou-eu-backend-v4...`
- `dist-prod\config.js` deve apontar para `quem-sou-eu-backend-v4-production...`

3) Publicar produção:
- `npx wrangler@latest pages deploy .\dist-prod --project-name jogo-prod`

4) Validar:
- `https://jogo-prod.pages.dev`
- domínio customizado (se aplicável)

---

## 9) Notas importantes
- Este projeto (frontend) é estático; não há `package.json` e não requer `npm install`/`npm run build`.
- O controle de ambiente acontece via **duas pastas de distribuição** (`dist-staging` e `dist-prod`) e o **`config.js`** gerado para cada uma.