# Documentação Técnica --- Arquitetura do Desafio do Pingão

## 1. Visão geral da arquitetura

O sistema é dividido em três camadas:

Frontend (Cloudflare Pages) - index.html - solo.html - admin.html

Backend - worker.js (Cloudflare Worker)

Banco de dados - SQLite dentro de Durable Objects

Fluxo do sistema:

Jogador → solo.html → Worker API → Durable Objects → SQLite
