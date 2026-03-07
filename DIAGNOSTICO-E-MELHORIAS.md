# 🔍 Diagnóstico e Melhorias — Ambiente Atual
### Desafio do Pingão / Cartas Bíblicas

---

## ✅ O que já está funcionando bem

| Item | Status | Detalhe |
|---|---|---|
| Dois ambientes (staging/prod) | ✅ | `jogo-staging` e `jogo-prod` |
| Separação de frontend | ✅ | `dist-staging/` e `dist-prod/` |
| Backend separado | ✅ | Workers staging e production |
| Script de build | ✅ | `build-two-frontends.ps1` |
| Config por ambiente | ✅ | `config.js` com `API_BASE` |
| Durable Objects | ✅ | 9 classes declaradas |
| D1 Databases | ✅ | 4 bancos (personagens, profecias, mímica, pregação) |
| Backup local | ✅ | Script documentado |

---

## ⚠️ Problemas Identificados

### Problema 1 — `wrangler.toml` mistura Worker e Pages
O `wrangler.toml` tem `pages_build_output_dir = "dist-prod"` junto com
configurações de Worker (`main = "worker.js"`, Durable Objects, D1).
Isso gera o warning que você vê e pode causar conflito.

**Solução:** separar em dois arquivos.

### Problema 2 — Worker de produção não está no `wrangler.toml`
Só existe o ambiente default (staging). Produção é um Worker separado
mas não tem `[env.production]` configurado — você precisa fazer deploy
manual com outro nome.

**Solução:** adicionar `[env.production]` ao `wrangler.toml` do worker.

### Problema 3 — D1 só mapeado para staging
Os bindings de D1 no `wrangler.toml` atual não têm equivalente de produção
com `database_id` separado.

---

## 🛠️ Correções Recomendadas

### Solução A — Separar em dois arquivos `wrangler.toml`

**Estrutura de pastas recomendada:**
```
desafiodopingao-cartasbiblicas/
├── frontend/               ← (ou manter na raiz)
│   ├── *.html
│   ├── assets/
│   ├── dist-staging/
│   ├── dist-prod/
│   ├── build-two-frontends.ps1
│   └── wrangler-pages.toml   ← NOVO (só pages)
│
└── backend/
    ├── worker.js
    └── wrangler.toml         ← SÓ worker (sem pages_build_output_dir)
```

---

### `wrangler.toml` do BACKEND (corrigido)

Remover `pages_build_output_dir` e adicionar ambiente de produção:

```toml
name = "quem-sou-eu-backend-v4"
main = "worker.js"
compatibility_date = "2024-01-01"

# ─── Durable Objects (staging/default) ───────────────────────────
[[durable_objects.bindings]]
name = "SALA_DO"
class_name = "SalaDO"

[[durable_objects.bindings]]
name = "SALA_COMPETITIVA_DO"
class_name = "SalaCompetitivaDO"

[[durable_objects.bindings]]
name = "BancoDadosDO"
class_name = "BancoDadosDO"

[[durable_objects.bindings]]
name = "PontosGlobaisDO"
class_name = "PontosGlobaisDO"

[[durable_objects.bindings]]
name = "BancoDadosPersonagensDO"
class_name = "BancoDadosPersonagensDO"

[[durable_objects.bindings]]
name = "BancoDadosProfeciasDO"
class_name = "BancoDadosProfeciasDO"

[[durable_objects.bindings]]
name = "BancoDadosMimicaDO"
class_name = "BancoDadosMimicaDO"

[[durable_objects.bindings]]
name = "BancoDadosPregacaoDO"
class_name = "BancoDadosPregacaoDO"

[[durable_objects.bindings]]
name = "BancoDadosVerdadeiroFalsoDO"
class_name = "BancoDadosVerdadeiroFalsoDO"

# ─── D1 Databases (staging/default) ─────────────────────────────
[[d1_databases]]
binding = "pingao_personagens"
database_name = "pingao-personagens"
database_id = "ccd79364-9c1f-42c9-9062-9c1f476fce89"

[[d1_databases]]
binding = "pingao_profecias"
database_name = "pingao-profecias"
database_id = "22063ff3-dc59-42f4-b00d-c0401d0bf65b"

[[d1_databases]]
binding = "pingao_mimica"
database_name = "pingao-mimica"
database_id = "5ec25aff-571b-4d65-bd0f-525795d2ea12"

[[d1_databases]]
binding = "pingao_pregacao"
database_name = "pingao-pregacao"
database_id = "3d154848-adb3-4799-94f8-1dd82fdeb7cf"

# ─── Migrations ──────────────────────────────────────────────────
[[migrations]]
tag = "v1"
new_sqlite_classes = ["SalaDO","SalaCompetitivaDO","BancoDadosDO","PontosGlobaisDO"]

[[migrations]]
tag = "v2"
new_sqlite_classes = ["BancoDadosPersonagensDO","BancoDadosProfeciasDO","BancoDadosMimicaDO","BancoDadosPregacaoDO"]

[[migrations]]
tag = "v3"
new_sqlite_classes = ["BancoDadosVerdadeiroFalsoDO"]


# ═══════════════════════════════════════════════════════════════════
# AMBIENTE DE PRODUÇÃO
# ═══════════════════════════════════════════════════════════════════
[env.production]
name = "quem-sou-eu-backend-v4-production"

[[env.production.durable_objects.bindings]]
name = "SALA_DO"
class_name = "SalaDO"

[[env.production.durable_objects.bindings]]
name = "SALA_COMPETITIVA_DO"
class_name = "SalaCompetitivaDO"

[[env.production.durable_objects.bindings]]
name = "BancoDadosDO"
class_name = "BancoDadosDO"

[[env.production.durable_objects.bindings]]
name = "PontosGlobaisDO"
class_name = "PontosGlobaisDO"

[[env.production.durable_objects.bindings]]
name = "BancoDadosPersonagensDO"
class_name = "BancoDadosPersonagensDO"

[[env.production.durable_objects.bindings]]
name = "BancoDadosProfeciasDO"
class_name = "BancoDadosProfeciasDO"

[[env.production.durable_objects.bindings]]
name = "BancoDadosMimicaDO"
class_name = "BancoDadosMimicaDO"

[[env.production.durable_objects.bindings]]
name = "BancoDadosPregacaoDO"
class_name = "BancoDadosPregacaoDO"

[[env.production.durable_objects.bindings]]
name = "BancoDadosVerdadeiroFalsoDO"
class_name = "BancoDadosVerdadeiroFalsoDO"

# ⚠️ ATENÇÃO: criar D1 databases separados para produção no painel Cloudflare
# e substituir os database_id abaixo pelos IDs de produção
[[env.production.d1_databases]]
binding = "pingao_personagens"
database_name = "pingao-personagens-prod"
database_id = "SUBSTITUIR-PELO-ID-PROD"

[[env.production.d1_databases]]
binding = "pingao_profecias"
database_name = "pingao-profecias-prod"
database_id = "SUBSTITUIR-PELO-ID-PROD"

[[env.production.d1_databases]]
binding = "pingao_mimica"
database_name = "pingao-mimica-prod"
database_id = "SUBSTITUIR-PELO-ID-PROD"

[[env.production.d1_databases]]
binding = "pingao_pregacao"
database_name = "pingao-pregacao-prod"
database_id = "SUBSTITUIR-PELO-ID-PROD"
```

---

### `package.json` — Scripts unificados de deploy

Crie na raiz do projeto:

```json
{
  "name": "desafiodopingao-cartasbiblicas",
  "version": "1.0.0",
  "scripts": {
    "build":              ".\\build-two-frontends.ps1",

    "deploy:front:staging": "npx wrangler@latest pages deploy .\\dist-staging --project-name jogo-staging",
    "deploy:front:prod":    "npx wrangler@latest pages deploy .\\dist-prod --project-name jogo-prod",

    "deploy:back:staging":  "npx wrangler@latest deploy",
    "deploy:back:prod":     "npx wrangler@latest deploy --env production",

    "deploy:staging": "npm run build && npm run deploy:front:staging && npm run deploy:back:staging",
    "deploy:prod":    "npm run build && npm run deploy:front:prod    && npm run deploy:back:prod"
  }
}
```

**Com isso, para publicar tudo de uma vez:**
```powershell
# Tudo para staging:
npm run deploy:staging

# Tudo para produção:
npm run deploy:prod
```

---

### `.cursorrules` — Contexto do projeto para o Claude Code no Cursor

Crie na raiz do projeto:

```
Você é especialista neste projeto específico:

PROJETO: Desafio do Pingão / Cartas Bíblicas
STACK: HTML/CSS/JS estático (sem framework) + Cloudflare Workers (backend)
CAMINHO LOCAL: C:\Users\EJP\Desktop\cartasbiblicas\desafiodopingao-cartasbiblicas\

ESTRUTURA:
- *.html → páginas do frontend (raiz)
- assets/, styles/, scripts/ → recursos estáticos
- dist-staging/ → build para staging (gerado pelo script)
- dist-prod/ → build para produção (gerado pelo script)
- worker.js → backend Cloudflare Workers
- wrangler.toml → config do Worker (staging + env.production)
- build-two-frontends.ps1 → gera dist-staging e dist-prod com config.js correto

AMBIENTES:
- Staging frontend: https://jogo-staging.pages.dev
- Produção frontend: https://jogo-prod.pages.dev
- Staging backend: https://quem-sou-eu-backend-v4.esdrasjulio.workers.dev
- Produção backend: https://quem-sou-eu-backend-v4-production.esdrasjulio.workers.dev

REGRAS:
- Nunca modificar dist-staging/ ou dist-prod/ diretamente (são gerados pelo build)
- Sempre editar os arquivos fonte na raiz
- config.js é gerado automaticamente pelo build-two-frontends.ps1
- O frontend lê API_BASE de window.APP_CONFIG (definido no config.js)
- Código sempre comentado em português
- Sem frameworks externos (React, Vue etc.)
- Backend usa Durable Objects e D1 do Cloudflare
```

---

## 📋 Checklist para aplicar as melhorias

- [ ] Remover `pages_build_output_dir` do `wrangler.toml` atual
- [ ] Adicionar `[env.production]` ao `wrangler.toml` do worker
- [ ] Criar D1 databases de produção no painel Cloudflare e preencher os IDs
- [ ] Criar `package.json` com os scripts unificados
- [ ] Criar `.cursorrules` na raiz do projeto
- [ ] Testar: `npm run deploy:staging`
- [ ] Testar: `npm run deploy:prod`
