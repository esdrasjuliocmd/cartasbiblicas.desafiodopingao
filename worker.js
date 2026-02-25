﻿// ============================================
// QUEM SOU EU? - Backend Cloudflare Workers
// Sistema Completo: Solo + Multiplayer + Competitivo
// COM MEMÓRIA GLOBAL DE CARTAS
// (PATCH) Histórico global padronizado para KEYS (h:/id:)
// + (PATCH) BancoDadosDO garante retorno de id (migração + fallback rowid)
// + (PATCH) Admin: índice de salas + endpoints /admin/salas e /admin/jogadores-completos
// + (PATCH) Admin: snapshot de sala (/admin/sala => DO /__admin_snapshot)
// + (PATCH) Solo: salvar data/hora da última partida em jogadores.ultimaPartidaEm
// ============================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // =========================================================
    // Helpers (escopo do worker principal)
    // =========================================================
    function normalizarTexto(texto) {
      return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    }

    function normalizarParaKey(valor) {
      const s = String(valor || '').trim();
      if (!s) return '';
      if (s.startsWith('h:') || s.startsWith('id:')) return s;

      const base = normalizarTexto(s);
      let hash = 0;
      for (let i = 0; i < base.length; i++) {
        hash = ((hash << 5) - hash) + base.charCodeAt(i);
        hash |= 0;
      }
      return `h:${Math.abs(hash)}`;
    }

    function migrarHistoricoParaKeys(historico, agora) {
      const umaHoraAtras = agora - (60 * 60 * 1000);

      const normalizados = (historico?.cartas || [])
        .filter(item => item && (item.timestamp || 0) > umaHoraAtras)
        .map(item => {
          const raw = item.key ?? item.resposta ?? '';
          const key = normalizarParaKey(raw);
          return { key, timestamp: item.timestamp || agora };
        })
        .filter(item => item.key);

      const seen = new Set();
      const dedup = [];
      for (const it of normalizados) {
        if (seen.has(it.key)) continue;
        seen.add(it.key);
        dedup.push(it);
      }

      return dedup.slice(-100);
    }

    // =========================================================
    // ADMIN: índice simples de salas em KV
    // =========================================================
    const SALAS_INDEX_KEY = 'salas_index_v1';

    async function getSalasIndex() {
      try {
        const raw = await env.SALAS_INDEX_KV.get(SALAS_INDEX_KEY, { type: 'json' });
        if (raw && Array.isArray(raw.salas)) return raw;
      } catch (_) {}
      return { salas: [] };
    }

    async function putSalasIndex(obj) {
      await env.SALAS_INDEX_KV.put(SALAS_INDEX_KEY, JSON.stringify(obj));
    }

    async function registerSalaSeen({ codigo, tipo }) {
      if (!codigo) return;
      const now = Date.now();
      const data = await getSalasIndex();

      const codigoUp = String(codigo).trim().toUpperCase();
      const t = (tipo || 'casual').toLowerCase();

      const idx = data.salas.findIndex(s => s.codigo === codigoUp && s.tipo === t);
      if (idx >= 0) {
        data.salas[idx].ultimaVez = now;
      } else {
        data.salas.unshift({
          codigo: codigoUp,
          tipo: t,
          criadaEm: now,
          ultimaVez: now
        });
      }

      data.salas = data.salas.slice(0, 500);
      await putSalasIndex(data);
    }

    function json(data, status = 200) {
      return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
      });
    }

    // ============================================
    // ADMIN: listar salas
    // ============================================
    if (path === '/admin/salas' && request.method === 'GET') {
      if (!env.SALAS_INDEX_KV) {
        return json({ error: 'KV SALAS_INDEX_KV não configurado no wrangler.toml' }, 500);
      }
      const data = await getSalasIndex();
      return json({ salas: data.salas });
    }

    // ============================================
    // ADMIN: snapshot de sala
    // GET /admin/sala?sala=ABC123&tipo=casual|competitivo
    // ============================================
    if (path === '/admin/sala' && request.method === 'GET') {
      const sala = (url.searchParams.get('sala') || '').trim().toUpperCase();
      const tipo = (url.searchParams.get('tipo') || 'casual').trim().toLowerCase();

      if (!sala) return json({ error: 'Parâmetro "sala" é obrigatório' }, 400);
      if (tipo !== 'casual' && tipo !== 'competitivo') return json({ error: 'Parâmetro "tipo" deve ser "casual" ou "competitivo"' }, 400);

      try {
        const stub = (tipo === 'competitivo')
          ? env.SALA_COMPETITIVA_DO.get(env.SALA_COMPETITIVA_DO.idFromName(sala))
          : env.SALA_DO.get(env.SALA_DO.idFromName(sala));

        const res = await stub.fetch(new Request(`http://internal/__admin_snapshot?sala=${encodeURIComponent(sala)}&tipo=${encodeURIComponent(tipo)}`));
        const text = await res.text().catch(() => '');
        if (!res.ok) return json({ error: `Snapshot falhou (HTTP ${res.status})`, detail: text }, 502);

        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        return json({ sala, tipo, snapshot: data });
      } catch (e) {
        return json({ error: e.message || 'Erro ao obter snapshot' }, 500);
      }
    }

    // ============================================
    // ADMIN: jogadores com 1+ partida (SOLO)
    // Baseado no /ranking (que já representa quem ganhou pontos no solo)
    // ============================================
    if (path === '/admin/jogadores-completos' && request.method === 'GET') {
      try {
        const id = env.PontosGlobaisDO.idFromName('pontos-globais');
        const res = await env.PontosGlobaisDO.get(id).fetch(new Request('http://internal/ranking'));
        if (!res.ok) return json({ error: `Falha ao obter ranking (HTTP ${res.status})` }, 502);

        const data = await res.json();
        const ranking = Array.isArray(data?.ranking) ? data.ranking : [];
        return json({
          total: ranking.length,
          jogadores: ranking.map(j => ({
            nome: j.nome,
            pontos: j.pontos,
            nivel: j.nivel,
            ultimaPartidaEm: j.ultimaPartidaEm || null
          }))
        });
      } catch (e) {
        return json({ error: e.message || 'Erro' }, 500);
      }
    }

    // ============================================
    // ROTA: OBTER CARTAS USADAS RECENTEMENTE (GLOBAL)
    // ============================================
    if (path === '/cartas-recentes' && request.method === 'GET') {
      try {
        const historico = await env.CARTAS_STORAGE.get('historico_global', { type: 'json' });
        const agora = Date.now();

        if (!historico || !historico.cartas) {
          return new Response(JSON.stringify({ cartas: [], total: 0, timestamp: agora }), {
            headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
          });
        }

        const finalList = migrarHistoricoParaKeys(historico, agora);

        await env.CARTAS_STORAGE.put('historico_global', JSON.stringify({
          cartas: finalList,
          atualizado: agora
        }));

        return new Response(JSON.stringify({
          cartas: finalList.map(item => item.key),
          total: finalList.length,
          timestamp: agora
        }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      } catch (erro) {
        console.error('Erro ao buscar cartas recentes:', erro);
        return new Response(JSON.stringify({ cartas: [], erro: erro.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      }
    }

    // ============================================
    // ROTA: REGISTRAR CARTAS USADAS (GLOBAL)
    // ============================================
    if (path === '/registrar-cartas' && request.method === 'POST') {
      try {
        const body = await request.json();

        const input = Array.isArray(body.cartas) ? body.cartas
          : Array.isArray(body.respostas) ? body.respostas
            : null;

        if (!input || !Array.isArray(input)) {
          return new Response(JSON.stringify({ success: false, erro: 'Formato inválido' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
          });
        }

        const agora = Date.now();
        const keys = input.map(x => normalizarParaKey(x)).filter(Boolean);

        if (keys.length === 0) {
          return new Response(JSON.stringify({ success: false, erro: 'Nenhuma carta válida para registrar' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
          });
        }

        const historico = await env.CARTAS_STORAGE.get('historico_global', { type: 'json' }) || { cartas: [] };
        const historicoMigrado = migrarHistoricoParaKeys(historico, agora);

        const novasCartas = keys.map(key => ({ key, timestamp: agora }));
        const combinado = [...historicoMigrado, ...novasCartas];

        const seen = new Set();
        const dedup = [];
        for (const it of combinado) {
          if (!it?.key) continue;
          if (seen.has(it.key)) continue;
          seen.add(it.key);
          dedup.push(it);
        }
        const finalList = dedup.slice(-100);

        await env.CARTAS_STORAGE.put('historico_global', JSON.stringify({
          cartas: finalList,
          atualizado: agora
        }));

        console.log(`✅ Registradas ${keys.length} cartas (keys) no histórico global`);

        return new Response(JSON.stringify({
          success: true,
          total_historico: finalList.length,
          registradas: keys.length
        }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      } catch (erro) {
        console.error('Erro ao registrar cartas:', erro);
        return new Response(JSON.stringify({ success: false, erro: erro.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      }
    }

    // ============================================
    // ROTA: LIMPAR HISTÓRICO GLOBAL (ADMIN)
    // ============================================
    if (path === '/limpar-historico' && request.method === 'POST') {
      try {
        await env.CARTAS_STORAGE.put('historico_global', JSON.stringify({ cartas: [], atualizado: Date.now() }));
        return new Response(JSON.stringify({ success: true, mensagem: 'Histórico global limpo com sucesso' }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      } catch (erro) {
        return new Response(JSON.stringify({ success: false, erro: erro.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      }
    }

    // ============================================
    // WEBSOCKET - MULTIPLAYER CASUAL
    // ============================================
    if (path === '/ws') {
      const sala = url.searchParams.get('sala');
      if (!sala) return new Response('Sala não especificada', { status: 400 });

      if (env.SALAS_INDEX_KV) {
        await registerSalaSeen({ codigo: sala, tipo: 'casual' });
      }

      const id = env.SALA_DO.idFromName(sala);
      return env.SALA_DO.get(id).fetch(request);
    }

    // ============================================
    // WEBSOCKET - MULTIPLAYER COMPETITIVO
    // ============================================
    if (path === '/ws-competitivo') {
      const sala = url.searchParams.get('sala');
      if (!sala) return new Response('Sala não especificada', { status: 400 });

      if (env.SALAS_INDEX_KV) {
        await registerSalaSeen({ codigo: sala, tipo: 'competitivo' });
      }

      const id = env.SALA_COMPETITIVA_DO.idFromName(sala);
      return env.SALA_COMPETITIVA_DO.get(id).fetch(request);
    }

    // ============================================
    // API REST - PONTOS
    // ============================================
    if (path.startsWith('/pontos/')) {
      const nome = decodeURIComponent(path.split('/')[2]);
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      return env.PontosGlobaisDO.get(id).fetch(new Request(`http://internal/pontos/${nome}`));
    }

    if (path === '/adicionar' && request.method === 'POST') {
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      return env.PontosGlobaisDO.get(id).fetch(request);
    }

    if (path === '/ranking') {
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      return env.PontosGlobaisDO.get(id).fetch(new Request('http://internal/ranking'));
    }

    // ============================================
    // API REST - CARTAS
    // ============================================
    if (path.endsWith('/popular') && request.method === 'POST' && path.startsWith('/cartas/')) {
      const id = env.BancoDadosDO.idFromName('banco-principal');
      return env.BancoDadosDO.get(id).fetch(request);
    }

    if (path.startsWith('/cartas/') && !path.endsWith('/popular')) {
      const id = env.BancoDadosDO.idFromName('banco-principal');
      return env.BancoDadosDO.get(id).fetch(request);
    }

    // ============================================
    // API REST - RECOMPENSAS
    // ============================================
    if (path.startsWith('/perfil/')) {
      const nome = decodeURIComponent(path.split('/')[2]);
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      return env.PontosGlobaisDO.get(id).fetch(new Request(`http://internal/perfil/${nome}`));
    }

    if (path === '/loja') {
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      return env.PontosGlobaisDO.get(id).fetch(new Request('http://internal/loja'));
    }

    if (path === '/resgatar' && request.method === 'POST') {
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      return env.PontosGlobaisDO.get(id).fetch(request);
    }

    if (path.startsWith('/conquistas/')) {
      const nome = decodeURIComponent(path.split('/')[2]);
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      return env.PontosGlobaisDO.get(id).fetch(new Request(`http://internal/conquistas/${nome}`));
    }

    return new Response(paginaInicial(), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders }
    });
  }
};

// ============================================
// DURABLE OBJECT: SALA MULTIPLAYER CASUAL
// ============================================
export class SalaDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.jogadores = new Map();
    this.cartaAtual = null;
    this.respostas = new Map();
    this.rodadaAtiva = false;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Snapshot admin via HTTP
    if (path === '/__admin_snapshot' && request.method === 'GET') {
      const jogadores = Array.from(this.jogadores.values()).map(j => ({ nome: j.nome, pontos: j.pontos }));
      return new Response(JSON.stringify({
        tipo: 'casual',
        totalJogadores: jogadores.length,
        jogadores,
        rodadaAtiva: !!this.rodadaAtiva,
        cartaAtual: this.cartaAtual ? { resposta: this.cartaAtual.resposta } : null
      }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    await this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(webSocket) {
    webSocket.accept();
    const id = Math.random().toString(36).substring(7);
    this.sessions.set(id, { ws: webSocket, nome: null });

    webSocket.addEventListener('message', async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        await this.handleMessage(id, data);
      } catch (e) {
        console.error('Erro ao processar mensagem:', e);
      }
    });

    webSocket.addEventListener('close', () => {
      const session = this.sessions.get(id);
      if (session && session.nome) {
        this.jogadores.delete(session.nome);
        this.broadcast({ tipo: 'jogador_saiu', nome: session.nome });
      }
      this.sessions.delete(id);
    });
  }

  async handleMessage(sessionId, data) {
    const session = this.sessions.get(sessionId);

    switch (data.tipo) {
      case 'entrar':
        session.nome = data.nome;
        this.jogadores.set(data.nome, { nome: data.nome, pontos: 0 });

        session.ws.send(JSON.stringify({
          tipo: 'bem_vindo',
          jogadores: Array.from(this.jogadores.keys())
        }));

        this.broadcast({
          tipo: 'jogador_entrou',
          nome: data.nome,
          total: this.jogadores.size
        });
        break;

      case 'iniciar_rodada':
        await this.iniciarRodada(data.categoria);
        break;

      case 'responder':
        this.processarResposta(data.nome, data.resposta, data.tempo);
        break;

      case 'chat':
        this.broadcast({ tipo: 'chat', nome: data.nome, mensagem: data.mensagem });
        break;
    }
  }

  async iniciarRodada(categoria) {
    this.rodadaAtiva = true;
    this.respostas.clear();

    const id = this.env.BancoDadosDO.idFromName('banco-principal');
    const stub = this.env.BancoDadosDO.get(id);
    const response = await stub.fetch(new Request(`http://internal/cartas/${categoria}`));
    const data = await response.json();

    if (data.cartas && data.cartas.length > 0) {
      this.cartaAtual = data.cartas[Math.floor(Math.random() * data.cartas.length)];

      this.broadcast({
        tipo: 'nova_rodada',
        carta: { dica1: this.cartaAtual.dica1, dica2: this.cartaAtual.dica2, dica3: this.cartaAtual.dica3 }
      });

      setTimeout(() => this.finalizarRodada(), 60000);
    }
  }

  processarResposta(nome, resposta, tempo) {
    if (this.respostas.has(nome)) return;

    const acertou = this.normalizarTexto(resposta) === this.normalizarTexto(this.cartaAtual.resposta);

    let pontos = 0;
    if (acertou) {
      if (tempo >= 40) pontos = 3;
      else if (tempo >= 20) pontos = 2;
      else pontos = 1;
    }

    this.respostas.set(nome, { acertou, pontos });

    const jogador = this.jogadores.get(nome);
    if (jogador) jogador.pontos += pontos;

    this.broadcast({ tipo: 'resposta_registrada', nome, acertou, pontos });
  }

  finalizarRodada() {
    this.rodadaAtiva = false;
    this.broadcast({ tipo: 'fim_rodada', respostaCorreta: this.cartaAtual.resposta });
  }

  normalizarTexto(texto) {
    return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  broadcast(message) {
    const msg = JSON.stringify(message);
    for (const session of this.sessions.values()) {
      try { session.ws.send(msg); } catch (e) { console.error('Erro ao enviar mensagem:', e); }
    }
  }
}

// ============================================
// DURABLE OBJECT: SALA COMPETITIVA (A vs B)
// ============================================
export class SalaCompetitivaDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.jogadores = new Map();
    this.salaA = new Set();
    this.salaB = new Set();
    this.host = null;
    this.categoria = 'personagens';
    this.rodadaAtual = 0;
    this.totalRodadas = 20;
    this.cartaAtual = null;
    this.respostas = new Map();
    this.rodadaAtiva = false;
    this.estadoSala = 'lobby';
    this.resgatesRealizados = 0;
    this.inicioJogo = null;
    this.timerRodada = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Snapshot admin via HTTP
    if (path === '/__admin_snapshot' && request.method === 'GET') {
      const jogadores = Array.from(this.jogadores.values()).map(j => ({
        nome: j.nome,
        pontos: j.pontos,
        sala: j.sala,
        host: !!j.host,
        pulandoAte: j.pulandoAte ?? null
      }));

      return new Response(JSON.stringify({
        tipo: 'competitivo',
        estadoSala: this.estadoSala,
        categoria: this.categoria,
        rodadaAtual: this.rodadaAtual,
        totalRodadas: this.totalRodadas,
        host: this.host,
        totalJogadores: jogadores.length,
        jogadores,
        salaA: Array.from(this.salaA),
        salaB: Array.from(this.salaB),
        resgatesRealizados: this.resgatesRealizados,
        inicioJogo: this.inicioJogo
      }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    await this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(webSocket) {
    webSocket.accept();
    const id = Math.random().toString(36).substring(7);
    this.sessions.set(id, { ws: webSocket, nome: null });

    webSocket.addEventListener('message', async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        await this.handleMessage(id, data);
      } catch (e) {
        console.error('Erro ao processar mensagem:', e);
      }
    });

    webSocket.addEventListener('close', () => {
      const session = this.sessions.get(id);
      if (session && session.nome) this.removerJogador(session.nome);
      this.sessions.delete(id);
    });
  }

  async handleMessage(sessionId, data) {
    const session = this.sessions.get(sessionId);
    const nome = data.nome || session.nome;

    switch (data.tipo) {
      case 'entrar':
        session.nome = nome;

        if (!this.host) this.host = nome;

        this.jogadores.set(nome, { nome, pontos: 0, sala: 'A', host: nome === this.host, pulandoAte: null });
        this.salaA.add(nome);

        session.ws.send(JSON.stringify({
          tipo: 'bem_vindo',
          jogadores: Array.from(this.jogadores.values()),
          host: this.host
        }));

        this.broadcast({ tipo: 'jogador_entrou', nome, jogadores: Array.from(this.jogadores.values()) });
        break;

      case 'iniciar_jogo':
        if (nome === this.host) await this.iniciarJogo(data.categoria);
        break;

      case 'responder':
        await this.processarResposta(nome, data.resposta, data.tempo);
        break;

      case 'resgatar':
        await this.processarResgate(nome, data.nomeResgatado);
        break;

      case 'continuar_jogo':
        if (nome === this.host) await this.continuarJogo();
        break;

      case 'chat':
        this.broadcast({ tipo: 'chat', nome, mensagem: data.mensagem });
        break;
    }
  }

  async iniciarJogo(categoria) {
    this.categoria = categoria;
    this.estadoSala = 'jogo';
    this.rodadaAtual = 0;
    this.inicioJogo = Date.now();

    const totalJogadores = this.jogadores.size;
    this.totalRodadas = this.calcularTotalRodadas(totalJogadores);

    this.broadcast({ tipo: 'jogo_iniciado', totalRodadas: this.totalRodadas, categoria: this.categoria });
    setTimeout(() => this.proximaRodada(), 2000);
  }

  calcularTotalRodadas(total) {
    if (total <= 2) return 20;
    if (total <= 6) return 20;
    if (total <= 9) return 25;
    if (total <= 15) return 30;
    return 40;
  }

  async proximaRodada() {
    this.rodadaAtual++;
    this.rodadaAtiva = true;
    this.respostas.clear();

    if (this.rodadaAtual > 1 && this.rodadaAtual % 4 === 1) {
      await this.iniciarSalaConversa();
      return;
    }

    const id = this.env.BancoDadosDO.idFromName('banco-principal');
    const stub = this.env.BancoDadosDO.get(id);
    const response = await stub.fetch(new Request(`http://internal/cartas/${this.categoria}`));
    const data = await response.json();

    if (data.cartas && data.cartas.length > 0) {
      this.cartaAtual = data.cartas[Math.floor(Math.random() * data.cartas.length)];

      const jogadoresPulando = [];
      for (const [nome, jogador] of this.jogadores.entries()) {
        if (jogador.pulandoAte && this.rodadaAtual <= jogador.pulandoAte) {
          jogadoresPulando.push(nome);
          if (this.rodadaAtual === jogador.pulandoAte) jogador.pulandoAte = null;
        }
      }

      const proximaEliminacao = this.getProximaEliminacao();

      this.broadcast({
        tipo: 'nova_rodada',
        rodada: this.rodadaAtual,
        carta: { dica1: this.cartaAtual.dica1, dica2: this.cartaAtual.dica2, dica3: this.cartaAtual.dica3, resposta: this.cartaAtual.resposta },
        proximaEliminacao,
        jogadoresPulando
      });

      if (this.timerRodada) clearTimeout(this.timerRodada);
      this.timerRodada = setTimeout(() => { if (this.rodadaAtiva) this.finalizarRodada(); }, 60000);
    }
  }

  verificarEliminacao() { return [5, 9, 13, 17].includes(this.rodadaAtual); }

  getProximaEliminacao() {
    const rodadasEliminacao = [5, 9, 13, 17];
    const proxima = rodadasEliminacao.find(r => r > this.rodadaAtual);
    if (!proxima) return null;

    const jogadoresRestantes = this.salaA.size;
    let quantidade = 1;

    if (proxima === 5) quantidade = Math.max(1, Math.floor(jogadoresRestantes * 0.2));
    else if (proxima === 9) quantidade = Math.max(1, Math.floor(jogadoresRestantes * 0.3));
    else if (proxima === 13) quantidade = Math.max(1, Math.floor(jogadoresRestantes * 0.4));
    else if (proxima === 17) quantidade = Math.max(1, Math.floor(jogadoresRestantes * 0.5));

    return { rodada: proxima, quantidade };
  }

  async processarResposta(nome, resposta, tempo) {
    const jogador = this.jogadores.get(nome);
    if (!jogador || jogador.sala !== 'A' || this.respostas.has(nome)) return;

    const acertou = this.normalizarTexto(resposta) === this.normalizarTexto(this.cartaAtual.resposta);

    let pontos = 0;
    if (acertou) {
      if (tempo >= 40) pontos = 3;
      else if (tempo >= 20) pontos = 2;
      else pontos = 1;
    }

    this.respostas.set(nome, { acertou, pontos });
    jogador.pontos += pontos;

    this.broadcast({ tipo: 'resposta_registrada', nome, acertou, pontos });

    const jogadoresSalaA = Array.from(this.salaA);
    const jogadoresAtivos = jogadoresSalaA.filter(n => {
      const jog = this.jogadores.get(n);
      return jog && !(jog.pulandoAte && this.rodadaAtual <= jog.pulandoAte);
    });

    const todosResponderam = jogadoresAtivos.every(n => this.respostas.has(n));
    if (todosResponderam && this.rodadaAtiva) {
      if (this.timerRodada) clearTimeout(this.timerRodada);
      setTimeout(() => { if (this.rodadaAtiva) this.finalizarRodada(); }, 2000);
    }
  }

  async finalizarRodada() {
    if (!this.rodadaAtiva) return;
    this.rodadaAtiva = false;

    if (this.timerRodada) { clearTimeout(this.timerRodada); this.timerRodada = null; }

    this.broadcast({ tipo: 'fim_rodada', respostaCorreta: this.cartaAtual.resposta });

    if (this.verificarEliminacao()) await this.eliminarJogadores();

    if (this.rodadaAtual >= this.totalRodadas) {
      setTimeout(() => this.finalizarJogo(), 3000);
      return;
    }

    if (this.rodadaAtual % 4 === 0 && this.rodadaAtual < this.totalRodadas) {
      setTimeout(() => this.iniciarSalaConversa(), 3000);
    } else {
      setTimeout(() => this.proximaRodada(), 3000);
    }
  }

  async eliminarJogadores() {
    const quantidade = this.calcularQuantidadeEliminacao();
    const jogadoresSalaA = Array.from(this.salaA).map(nome => this.jogadores.get(nome)).sort((a, b) => a.pontos - b.pontos);
    const eliminados = jogadoresSalaA.slice(0, quantidade);

    for (const jogador of eliminados) {
      jogador.sala = 'B';
      this.salaA.delete(jogador.nome);
      this.salaB.add(jogador.nome);
    }

    this.broadcast({
      tipo: 'eliminacao',
      eliminados: eliminados.map(j => j.nome),
      salaA: Array.from(this.salaA).map(nome => ({ nome, pontos: this.jogadores.get(nome).pontos })),
      salaB: Array.from(this.salaB).map(nome => ({ nome, pontos: this.jogadores.get(nome).pontos }))
    });
  }

  calcularQuantidadeEliminacao() {
    const total = this.salaA.size;
    if (this.rodadaAtual === 5) return Math.max(1, Math.floor(total * 0.2));
    if (this.rodadaAtual === 9) return Math.max(1, Math.floor(total * 0.3));
    if (this.rodadaAtual === 13) return Math.max(1, Math.floor(total * 0.4));
    if (this.rodadaAtual === 17) return Math.max(1, Math.floor(total * 0.5));
    return 1;
  }

  async iniciarSalaConversa() {
    this.estadoSala = 'conversa';
    const proximaEliminacao = this.getProximaEliminacao();
    this.broadcast({
      tipo: 'sala_conversa',
      salaA: Array.from(this.salaA).map(nome => {
        const j = this.jogadores.get(nome);
        return { nome: j.nome, pontos: j.pontos, host: j.host };
      }),
      salaB: Array.from(this.salaB).map(nome => {
        const j = this.jogadores.get(nome);
        return { nome: j.nome, pontos: j.pontos };
      }),
      proximaEliminacao
    });
  }

  async processarResgate(nomeResgatador, nomeResgatado) {
    const resgatador = this.jogadores.get(nomeResgatador);
    const resgatado = this.jogadores.get(nomeResgatado);
    if (!resgatador || !resgatado) return;
    if (resgatador.sala !== 'A' || resgatado.sala !== 'B') return;
    if (resgatador.pontos < 5) return;

    resgatador.pontos -= 5;
    resgatador.pulandoAte = this.rodadaAtual + 1;

    resgatado.sala = 'A';
    this.salaB.delete(nomeResgatado);
    this.salaA.add(nomeResgatado);

    this.resgatesRealizados++;
    const proximaEliminacao = this.getProximaEliminacao();

    this.broadcast({
      tipo: 'resgate_realizado',
      quemResgatou: nomeResgatador,
      resgatado: nomeResgatado,
      salaA: Array.from(this.salaA).map(nome => {
        const j = this.jogadores.get(nome);
        return { nome: j.nome, pontos: j.pontos, host: j.host };
      }),
      salaB: Array.from(this.salaB).map(nome => {
        const j = this.jogadores.get(nome);
        return { nome: j.nome, pontos: j.pontos };
      }),
      proximaEliminacao
    });
  }

  async continuarJogo() {
    this.estadoSala = 'jogo';
    this.broadcast({ tipo: 'continuar_jogo' });
    setTimeout(() => this.proximaRodada(), 2000);
  }

  finalizarJogo() {
    this.estadoSala = 'final';
    const duracao = this.inicioJogo ? Math.floor((Date.now() - this.inicioJogo) / 60000) : 0;

    this.broadcast({
      tipo: 'fim_jogo',
      totalRodadas: this.totalRodadas,
      salaA: Array.from(this.salaA).map(nome => ({ nome, pontos: this.jogadores.get(nome).pontos })).sort((a, b) => b.pontos - a.pontos),
      salaB: Array.from(this.salaB).map(nome => ({ nome, pontos: this.jogadores.get(nome).pontos })).sort((a, b) => b.pontos - a.pontos),
      categoria: this.categoria,
      duracao: `${duracao} minutos`,
      resgatesRealizados: this.resgatesRealizados
    });
  }

  removerJogador(nome) {
    this.jogadores.delete(nome);
    this.salaA.delete(nome);
    this.salaB.delete(nome);

    if (this.host === nome) {
      const novosJogadores = Array.from(this.jogadores.keys());
      this.host = novosJogadores.length > 0 ? novosJogadores[0] : null;

      if (this.host) {
        const novoHost = this.jogadores.get(this.host);
        if (novoHost) novoHost.host = true;
        this.broadcast({ tipo: 'host_mudou', novoHost: this.host, jogadores: Array.from(this.jogadores.values()) });
      }
    }

    this.broadcast({ tipo: 'jogador_saiu', nome });
  }

  normalizarTexto(texto) {
    return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  broadcast(message) {
    const msg = JSON.stringify(message);
    for (const session of this.sessions.values()) {
      try { session.ws.send(msg); } catch (e) { console.error('Erro ao enviar mensagem:', e); }
    }
  }
}

// ============================================
// DURABLE OBJECT: BANCO DE DADOS (CARTAS)
// ============================================
export class BancoDadosDO {
  constructor(state, env) {
    this.state = state;
    this.sql = state.storage.sql;
    this.initialized = false;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (!this.initialized) {
      await this.inicializar();
      this.initialized = true;
    }

    if (path.endsWith('/popular') && request.method === 'POST') {
      const categoria = path.split('/')[2];
      const body = await request.json();
      await this.popularCartas(categoria, body.cartas);
      return new Response(JSON.stringify({ sucesso: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path.startsWith('/cartas/') && !path.endsWith('/popular')) {
      const categoria = path.split('/')[2];
      const cartas = await this.obterCartas(categoria);
      return new Response(JSON.stringify({ cartas }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  async inicializar() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS cartas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        categoria TEXT NOT NULL,
        dica1 TEXT NOT NULL,
        dica2 TEXT NOT NULL,
        dica3 TEXT NOT NULL,
        resposta TEXT NOT NULL
      )
    `);

    try {
      const cols = this.sql.exec(`PRAGMA table_info(cartas)`).toArray();
      const hasId = cols.some(c => String(c.name).toLowerCase() === 'id');

      if (!hasId) {
        this.sql.exec(`
          CREATE TABLE IF NOT EXISTS cartas_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria TEXT NOT NULL,
            dica1 TEXT NOT NULL,
            dica2 TEXT NOT NULL,
            dica3 TEXT NOT NULL,
            resposta TEXT NOT NULL
          )
        `);

        this.sql.exec(`
          INSERT INTO cartas_new (categoria, dica1, dica2, dica3, resposta)
          SELECT categoria, dica1, dica2, dica3, resposta FROM cartas
        `);

        this.sql.exec(`DROP TABLE cartas`);
        this.sql.exec(`ALTER TABLE cartas_new RENAME TO cartas`);

        console.log('✅ [BancoDadosDO] Migração aplicada: adicionada coluna id');
      }
    } catch (e) {
      console.log('⚠️ [BancoDadosDO] Falha ao checar/migrar schema:', e?.message || e);
    }

    const count = this.sql.exec('SELECT COUNT(*) as total FROM cartas').toArray()[0].total;
    if (count === 0) {
      await this.popularCartasPadrao();
    }
  }

  async obterCartas(categoria) {
    try {
      return this.sql.exec(
        'SELECT id, dica1, dica2, dica3, resposta FROM cartas WHERE categoria = ?',
        categoria
      ).toArray();
    } catch (e) {
      console.log('⚠️ [BancoDadosDO] SELECT com id falhou, usando rowid. Erro:', e?.message || e);
      return this.sql.exec(
        'SELECT rowid as id, dica1, dica2, dica3, resposta FROM cartas WHERE categoria = ?',
        categoria
      ).toArray();
    }
  }

  async popularCartas(categoria, cartas) {
    this.sql.exec('DELETE FROM cartas WHERE categoria = ?', categoria);

    for (const carta of cartas) {
      this.sql.exec(
        'INSERT INTO cartas (categoria, dica1, dica2, dica3, resposta) VALUES (?, ?, ?, ?, ?)',
        categoria,
        carta.dica1,
        carta.dica2,
        carta.dica3,
        carta.resposta
      );
    }
  }

  async popularCartasPadrao() {
    const cartasPadrao = {
      personagens: [
        { dica1: 'Foi vendido por seus irmãos', dica2: 'Interpretou sonhos do Faraó', dica3: 'Governou o Egito', resposta: 'José' },
        { dica1: 'Construiu uma arca', dica2: 'Sobreviveu ao dilúvio', dica3: 'Tinha 600 anos quando o dilúvio começou', resposta: 'Noé' },
        { dica1: 'Pastor de ovelhas', dica2: 'Matou um gigante com uma funda', dica3: 'Segundo rei de Israel', resposta: 'Davi' },
        { dica1: 'Nasceu de uma virgem', dica2: 'Fez muitos milagres', dica3: 'Ressuscitou ao terceiro dia', resposta: 'Jesus' },
        { dica1: 'Era pescador', dica2: 'Negou Jesus três vezes', dica3: 'Recebeu as chaves do Reino', resposta: 'Pedro' },
        { dica1: 'Pai da fé', dica2: 'Quase sacrificou seu filho', dica3: 'Pai de Isaque', resposta: 'Abraão' },
        { dica1: 'Libertou Israel do Egito', dica2: 'Recebeu os 10 mandamentos', dica3: 'Dividiu o Mar Vermelho', resposta: 'Moisés' },
        { dica1: 'O mais sábio de todos', dica2: 'Construiu o templo', dica3: 'Filho de Davi', resposta: 'Salomão' },
        { dica1: 'Apóstolo dos gentios', dica2: 'Escreveu várias cartas', dica3: 'Antes se chamava Saulo', resposta: 'Paulo' },
        { dica1: 'Rainha corajosa', dica2: 'Salvou seu povo', dica3: 'Esposa do rei persa', resposta: 'Ester' },
      ],
      profecias: [
        { dica1: 'Predisse a vinda do Messias', dica2: 'Falou sobre um servo sofredor', dica3: 'Escreveu 66 capítulos', resposta: 'Isaías' },
        { dica1: 'Profetizou sobre a destruição de Jerusalém', dica2: 'Conhecido como profeta chorão', dica3: 'Escreveu Lamentações', resposta: 'Jeremias' },
        { dica1: 'Teve visões de criaturas celestiais', dica2: 'Profetizou sobre ossos secos', dica3: 'Descreveu o templo futuro', resposta: 'Ezequiel' },
        { dica1: 'Interpretou sonhos de reis', dica2: 'Sobreviveu na cova dos leões', dica3: 'Teve visões das quatro bestas', resposta: 'Daniel' },
        { dica1: 'Falou sobre derramamento do espírito', dica2: 'Profetizou sobre pragas de gafanhotos', dica3: 'Viveu em Judá', resposta: 'Joel' },
      ],
      pregacao: [
        { dica1: 'Tema sobre fé e obras', dica2: 'A fé sem obras é morta', dica3: 'Carta de Tiago', resposta: 'Fé e Obras' },
        { dica1: 'Salvação pela graça', dica2: 'Não por obras', dica3: 'Para que ninguém se glorie', resposta: 'Graça de Deus' },
        { dica1: 'Amai vossos inimigos', dica2: 'Fazei bem aos que vos odeiam', dica3: 'Sermão do Monte', resposta: 'Amor ao Próximo' },
        { dica1: 'Eu sou o caminho', dica2: 'A verdade', dica3: 'E a vida', resposta: 'Jesus o Caminho' },
        { dica1: 'Fruto do espírito', dica2: 'Amor, alegria, paz', dica3: 'Gálatas 5', resposta: 'Fruto do Espírito' },
      ],
    };

    for (const [categoria, cartas] of Object.entries(cartasPadrao)) {
      await this.popularCartas(categoria, cartas);
    }
  }
}

// ============================================
// DURABLE OBJECT: PONTOS GLOBAIS + RECOMPENSAS
// ============================================
export class PontosGlobaisDO {
  constructor(state, env) {
    this.state = state;
    this.sql = state.storage.sql;
    this.initialized = false;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (!this.initialized) {
      await this.inicializar();
      this.initialized = true;
    }

    if (path.startsWith('/pontos/')) {
      const nome = decodeURIComponent(path.split('/')[2]);
      const pontos = await this.obterPontos(nome);
      return new Response(JSON.stringify({ nome, pontos }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path === '/adicionar' && request.method === 'POST') {
      const body = await request.json();
      await this.adicionarPontos(body.nome, body.pontos);
      return new Response(JSON.stringify({ sucesso: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path === '/ranking') {
      const ranking = await this.obterRanking();
      return new Response(JSON.stringify({ ranking }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path.startsWith('/perfil/')) {
      const nome = decodeURIComponent(path.split('/')[2]);
      const perfil = await this.obterPerfil(nome);
      return new Response(JSON.stringify(perfil), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path === '/loja') {
      const loja = await this.obterLoja();
      return new Response(JSON.stringify(loja), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path === '/resgatar' && request.method === 'POST') {
      const body = await request.json();
      const resultado = await this.resgatarItem(body.nome, body.item, body.custo);
      return new Response(JSON.stringify(resultado), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path.startsWith('/conquistas/')) {
      const nome = decodeURIComponent(path.split('/')[2]);
      const conquistas = await this.obterConquistas(nome);
      return new Response(JSON.stringify({ conquistas }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  async inicializar() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS jogadores (
        nome TEXT PRIMARY KEY,
        pontos INTEGER DEFAULT 0,
        totalAcertos INTEGER DEFAULT 0,
        totalErros INTEGER DEFAULT 0,
        maiorSequencia INTEGER DEFAULT 0,
        nivel TEXT DEFAULT 'Bronze',
        dataCriacao TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // (PATCH) migração defensiva: adiciona coluna ultimaPartidaEm se não existir
    try {
      this.sql.exec(`ALTER TABLE jogadores ADD COLUMN ultimaPartidaEm TEXT`);
    } catch (e) {
      // já existe -> ignora
    }

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS resgates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        itemId INTEGER NOT NULL,
        itemNome TEXT NOT NULL,
        custo INTEGER NOT NULL,
        dataResgate TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (nome) REFERENCES jogadores(nome)
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS loja (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT NOT NULL,
        custo INTEGER NOT NULL,
        categoria TEXT NOT NULL
      )
    `);

    const countLoja = this.sql.exec('SELECT COUNT(*) as total FROM loja').toArray()[0].total;
    if (countLoja === 0) await this.popularLoja();
  }

  async obterPontos(nome) {
    const result = this.sql.exec('SELECT pontos FROM jogadores WHERE nome = ?', nome).toArray();
    if (result.length === 0) {
      this.sql.exec('INSERT INTO jogadores (nome, pontos) VALUES (?, 0)', nome);
      return 0;
    }
    return result[0].pontos;
  }

  async adicionarPontos(nome, pontos) {
    const atual = await this.obterPontos(nome);
    const novo = atual + pontos;

    const agoraISO = new Date().toISOString();

    // (PATCH) atualiza pontos + última partida
    this.sql.exec('UPDATE jogadores SET pontos = ?, ultimaPartidaEm = ? WHERE nome = ?', novo, agoraISO, nome);

    await this.atualizarNivel(nome, novo);
  }

  async atualizarNivel(nome, pontos) {
    let nivel = 'Bronze';
    if (pontos >= 5000) nivel = 'Mestre';
    else if (pontos >= 2000) nivel = 'Diamante';
    else if (pontos >= 1000) nivel = 'Ouro';
    else if (pontos >= 500) nivel = 'Prata';
    this.sql.exec('UPDATE jogadores SET nivel = ? WHERE nome = ?', nivel, nome);
  }

  async obterRanking() {
    // (PATCH) inclui ultimaPartidaEm
    return this.sql.exec(
      'SELECT nome, pontos, nivel, ultimaPartidaEm FROM jogadores ORDER BY pontos DESC LIMIT 100'
    ).toArray();
  }

  async obterPerfil(nome) {
    const jogador = this.sql.exec('SELECT * FROM jogadores WHERE nome = ?', nome).toArray();
    if (jogador.length === 0) return { erro: 'Jogador não encontrado' };

    const resgates = this.sql.exec(
      'SELECT itemId, itemNome, custo, dataResgate FROM resgates WHERE nome = ? ORDER BY dataResgate DESC',
      nome
    ).toArray();

    return { ...jogador[0], resgates };
  }

  async obterLoja() {
    const itens = this.sql.exec('SELECT * FROM loja ORDER BY categoria, custo').toArray();
    return { itens };
  }

  async resgatarItem(nome, item, custo) {
    const pontosAtuais = await this.obterPontos(nome);
    if (pontosAtuais < custo) return { erro: 'Pontos insuficientes' };

    const novoPontos = pontosAtuais - custo;
    this.sql.exec('UPDATE jogadores SET pontos = ? WHERE nome = ?', novoPontos, nome);

    this.sql.exec(
      'INSERT INTO resgates (nome, itemId, itemNome, custo) VALUES (?, ?, ?, ?)',
      nome,
      item.id,
      item.nome,
      custo
    );

    return { sucesso: true, pontosRestantes: novoPontos, itemResgatado: item.nome };
  }

  async obterConquistas(nome) {
    return this.sql.exec(
      'SELECT itemNome, dataResgate FROM resgates WHERE nome = ? ORDER BY dataResgate DESC',
      nome
    ).toArray();
  }

  async popularLoja() {
    const itens = [
      { nome: '🏆 Troféu Bronze', descricao: 'Seu primeiro troféu!', custo: 50, categoria: 'trofeu' },
      { nome: '🏆 Troféu Prata', descricao: 'Dominando o conhecimento', custo: 100, categoria: 'trofeu' },
      { nome: '🏆 Troféu Ouro', descricao: 'Expert bíblico!', custo: 200, categoria: 'trofeu' },
      { nome: '🏆 Troféu Diamante', descricao: 'Mestre das Escrituras', custo: 500, categoria: 'trofeu' },
      { nome: '⭐ Badge Iniciante', descricao: 'Primeiros passos', custo: 30, categoria: 'badge' },
      { nome: '⭐ Badge Estudioso', descricao: 'Dedicação exemplar', custo: 80, categoria: 'badge' },
      { nome: '⭐ Badge Mestre', descricao: 'Conhecimento profundo', custo: 150, categoria: 'badge' },
      { nome: '⭐ Badge Legendário', descricao: 'Lenda viva!', custo: 300, categoria: 'badge' },
      { nome: '👑 Título: Sábio', descricao: 'Reconhecido pela sabedoria', custo: 100, categoria: 'titulo' },
      { nome: '👑 Título: Doutor', descricao: 'PhD em conhecimento bíblico', custo: 250, categoria: 'titulo' },
      { nome: '👑 Título: Professor', descricao: 'Ensine aos outros', custo: 400, categoria: 'titulo' },
      { nome: '🎨 Avatar Especial 1', descricao: 'Destaque-se na sala', custo: 75, categoria: 'avatar' },
      { nome: '🎨 Avatar Especial 2', descricao: 'Estilo único', custo: 120, categoria: 'avatar' },
      { nome: '🎨 Avatar Premium', descricao: 'Exclusivo e raro', custo: 300, categoria: 'avatar' },
      { nome: '🎁 Bônus +50 Pontos', descricao: 'Impulso instantâneo', custo: 25, categoria: 'bonus' },
      { nome: '🎁 Bônus +100 Pontos', descricao: 'Grande impulso', custo: 50, categoria: 'bonus' },
      { nome: '🎁 Bônus +500 Pontos', descricao: 'Mega impulso!', custo: 200, categoria: 'bonus' },
    ];

    for (const item of itens) {
      this.sql.exec(
        'INSERT INTO loja (nome, descricao, custo, categoria) VALUES (?, ?, ?, ?)',
        item.nome,
        item.descricao,
        item.custo,
        item.categoria
      );
    }
  }
}

function paginaInicial() {
  return `
🎯 QUEM SOU EU? - Backend v4.2 COM HISTÓRICO GLOBAL PADRONIZADO (KEYS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status: ✅ ONLINE

📡 ENDPOINTS:
  GET  /cartas/:categoria
  POST /cartas/:categoria/popular
  GET  /cartas-recentes
  POST /registrar-cartas
  POST /limpar-historico

🛠️ ADMIN:
  GET /admin/salas
  GET /admin/jogadores-completos
  GET /admin/sala?sala=ABC123&tipo=casual|competitivo
`;
}
// Compatibilidade retroativa para migrations antigas do Durable Object
// que ainda referenciam a classe PontosBiblicoDO.
export class PontosBiblicoDO extends PontosGlobaisDO {}

