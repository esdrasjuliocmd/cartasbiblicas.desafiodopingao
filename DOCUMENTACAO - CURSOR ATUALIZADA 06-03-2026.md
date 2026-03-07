# Documentação do Ambiente de Desenvolvimento
## Desafio do Pingão / Cartas Bíblicas
**Data:** 06/03/2026 | **Autor:** Esdras Julio

---

## 1. Visão Geral da Arquitetura

O projeto possui dois ambientes completamente independentes: **Staging** (testes/criação) e **Produção** (site oficial com jogadores reais). A separação ocorre em duas camadas: frontend (Cloudflare Pages) e backend (Cloudflare Workers).

```
Cursor IDE (local)
      │
      ├── npm run deploy:staging ──► jogo-staging.pages.dev
      │                               + quem-sou-eu-backend-v4
      │
      └── npm run deploy:prod ─────► jogo-prod.pages.dev
                                      + quem-sou-eu-backend-v4-production
```

---

## 2. Inventário de Serviços no Cloudflare

### 2.1 Frontend — Cloudflare Pages

| Ambiente | Projeto | URL |
|----------|---------|-----|
| Produção | `jogo-prod` | https://jogo-prod.pages.dev |
| Staging | `jogo-staging` | https://jogo-staging.pages.dev |

Ambos os projetos usam deploy via CLI (sem conexão Git). Isso é intencional e funciona corretamente.

### 2.2 Backend — Cloudflare Workers

| Ambiente | Worker | URL |
|----------|--------|-----|
| Produção | `quem-sou-eu-backend-v4-production` | https://quem-sou-eu-backend-v4-production.esdrasjulio.workers.dev |
| Staging | `quem-sou-eu-backend-v4` | https://quem-sou-eu-backend-v4.esdrasjulio.workers.dev |

### 2.3 Bancos de Dados — Cloudflare D1

Os bancos D1 armazenam as **perguntas e conteúdo do jogo** (não as pontuações). São compartilhados entre staging e produção pois o conteúdo é o mesmo.

| Binding | Nome do Banco | ID |
|---------|--------------|-----|
| `pingao_personagens` | pingao-personagens | `ccd79364-9c1f-42c9-9062-9c1f476fce89` |
| `pingao_profecias` | pingao-profecias | `22063ff3-dc59-42f4-b00d-c0401d0bf65b` |
| `pingao_mimica` | pingao-mimica | `5ec25aff-571b-4d65-bd0f-525795d2ea12` |
| `pingao_pregacao` | pingao-pregacao | `3d154848-adb3-4799-94f8-1dd82fdeb7cf` |

### 2.4 Durable Objects

Os Durable Objects armazenam **estado em tempo real** das partidas e o **ranking/pontuação dos jogadores**. São automaticamente isolados por Worker — staging e produção têm dados completamente separados.

| Classe | Função |
|--------|--------|
| `SalaDO` | Salas de partida multiplayer |
| `SalaCompetitivaDO` | Salas do modo competitivo |
| `BancoDadosDO` | Banco de dados em memória |
| `PontosGlobaisDO` | **Ranking e pontuação dos jogadores** |
| `BancoDadosPersonagensDO` | Dados de personagens em jogo |
| `BancoDadosProfeciasDO` | Dados de profecias em jogo |
| `BancoDadosMimicaDO` | Dados do modo mímica |
| `BancoDadosPregacaoDO` | Dados do modo pregação |
| `BancoDadosVerdadeiroFalsoDO` | Dados do modo verdadeiro/falso |

> **Importante:** As pontuações dos jogadores ficam no `PontosGlobaisDO`, não no D1. Por isso, deploys do Worker não apagam o ranking — apenas atualizam o código.

---

## 3. Estrutura Local do Projeto

**Caminho:** `C:\Users\EJP\Desktop\cartasbiblicas\desafiodopingao-cartasbiblicas\`

```
desafiodopingao-cartasbiblicas/
├── *.html                      ← páginas do frontend (editar aqui)
├── assets/                     ← imagens e recursos estáticos
├── styles/                     ← arquivos CSS
├── scripts/                    ← arquivos JavaScript
├── dist-staging/               ← gerado automaticamente (NÃO editar)
├── dist-prod/                  ← gerado automaticamente (NÃO editar)
├── worker.js                   ← código do backend (Workers)
├── wrangler.toml               ← configuração do Wrangler
├── build-two-frontends.ps1     ← script de build dos dois ambientes
├── package.json                ← scripts de deploy unificados
├── .cursorrules                ← contexto do projeto para o Claude Code
└── .gitignore
```

> **Regra fundamental:** nunca editar `dist-staging/` ou `dist-prod/` diretamente. Essas pastas são geradas pelo script de build e sobrescritas a cada deploy.

---

## 4. Como o Frontend se Conecta ao Backend

O frontend usa o arquivo `config.js` para saber qual Worker chamar. Esse arquivo é gerado automaticamente pelo script `build-two-frontends.ps1` para cada ambiente.

**Staging — `dist-staging/config.js`:**
```js
window.APP_CONFIG = {
  API_BASE: "https://quem-sou-eu-backend-v4.esdrasjulio.workers.dev"
};
```

**Produção — `dist-prod/config.js`:**
```js
window.APP_CONFIG = {
  API_BASE: "https://quem-sou-eu-backend-v4-production.esdrasjulio.workers.dev"
};
```

No código JavaScript do frontend, a URL da API é sempre lida via `window.APP_CONFIG.API_BASE`. Nunca deve ser escrita diretamente no código.

---

## 5. Comandos de Deploy

### 5.1 Scripts disponíveis no `package.json`

| Comando | O que faz |
|---------|-----------|
| `npm run build` | Gera `dist-staging` e `dist-prod` com `config.js` correto |
| `npm run deploy:front:staging` | Publica frontend no projeto `jogo-staging` |
| `npm run deploy:front:prod` | Publica frontend no projeto `jogo-prod` |
| `npm run deploy:back:staging` | Publica Worker de staging |
| `npm run deploy:back:prod` | Publica Worker de produção |
| `npm run deploy:staging` | **Tudo para staging** (build + front + back) |
| `npm run deploy:prod` | **Tudo para produção** (build + front + back) |

### 5.2 Comandos avançados (terminal direto)

```powershell
# Validar configuração sem fazer deploy
npx wrangler@latest deploy --dry-run --env=""
npx wrangler@latest deploy --dry-run --env production

# Ver projetos Pages
npx wrangler@latest pages project list

# Ver deploys recentes
npx wrangler@latest pages deployment list --project-name jogo-prod
```

---

## 6. Fluxo de Trabalho Diário

```
1. Abrir pasta no Cursor
         ↓
2. Editar arquivos HTML/JS/CSS com ajuda do Claude Code (Ctrl+L)
         ↓
3. Testar localmente (opcional): npx serve dist-staging -l 3000
         ↓
4. Publicar no staging para testar online:
   npm run deploy:staging
   → https://jogo-staging.pages.dev
         ↓
5. Validar no staging (jogo, ranking, mobile)
         ↓
6. Se aprovado, publicar em produção:
   npm run deploy:prod
   → https://jogo-prod.pages.dev
```

---

## 7. Separação dos Dados por Ambiente

| Dado | Onde fica | Staging | Produção | Compartilhado? |
|------|-----------|---------|----------|----------------|
| Pontuação/Ranking | Durable Objects (`PontosGlobaisDO`) | Dados de teste | Dados reais | ❌ Separados |
| Partidas em jogo | Durable Objects (`SalaDO` etc.) | Isolado | Isolado | ❌ Separados |
| Perguntas/Cartas | D1 (`pingao_personagens` etc.) | Mesmo banco | Mesmo banco | ✅ Compartilhado |

A separação dos Durable Objects é automática — ocorre porque os dois Workers têm nomes diferentes no Cloudflare.

---

## 8. Backup

### Script de backup local (PowerShell)
```powershell
$SRC = "C:\Users\EJP\Desktop\cartasbiblicas\desafiodopingao-cartasbiblicas"
$STAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$DEST = "C:\Users\EJP\Desktop\BACKUP-cartasbiblicas\desafiodopingao-cartasbiblicas_$STAMP"

New-Item -ItemType Directory -Force -Path $DEST | Out-Null
Copy-Item -Path $SRC -Destination $DEST -Recurse -Force
Write-Host "✅ Backup criado em: $DEST"
```

Executar sempre antes de publicar em produção.

---

## 9. Configuração do Cursor IDE

### Claude Code (`Ctrl+L`)
O arquivo `.cursorrules` na raiz do projeto instrui o Claude Code sobre toda a estrutura do projeto. Com ele configurado, a IA já conhece os dois ambientes, os Durable Objects, o sistema de `config.js` e as regras de código — sem precisar explicar a cada conversa.

### Ferramentas instaladas (Windows)

| Ferramenta | Versão | Finalidade |
|-----------|--------|------------|
| Node.js / npm | LTS | Rodar scripts e wrangler |
| Git | — | Controle de versão |
| Wrangler CLI | 4.71.0 | Deploy no Cloudflare |
| Cursor IDE | — | Editor com Claude Code integrado |

---

## 10. Troubleshooting

### "Nothing is here yet" no Pages
O projeto existe mas não tem deploy publicado. Solução: rodar `npm run deploy:staging` ou `npm run deploy:prod`.

### Warning "Multiple environments" no Wrangler
Aparece ao rodar `wrangler deploy` sem especificar ambiente. É inofensivo — os scripts `npm run deploy:*` já passam o ambiente correto automaticamente.

### Pontuações de teste aparecendo em produção
Não deve ocorrer — os Durable Objects são isolados por Worker. Se acontecer, verificar se o `config.js` de produção está apontando para o Worker correto (`-production`).

### Verificar qual Worker o frontend está usando
```powershell
Get-Content .\dist-prod\config.js
Get-Content .\dist-staging\config.js
```
