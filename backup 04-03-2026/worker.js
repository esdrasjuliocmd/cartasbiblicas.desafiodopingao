﻿﻿// ============================================
// QUEM SOU EU? - Backend Cloudflare Workers
// Sistema Completo: Solo + Multiplayer + Competitivo
// COM MEMÓRIA GLOBAL DE CARTAS
// (PATCH) Histórico global padronizado para KEYS (h:/id:)
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

      // já é key
      if (s.startsWith('h:') || s.startsWith('id:')) return s;

      // gera key determinística a partir do texto normalizado
      const base = normalizarTexto(s);

      // hash 32-bit simples, determinístico
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

      // remove duplicados mantendo ordem
      const seen = new Set();
      const dedup = [];
      for (const it of normalizados) {
        if (seen.has(it.key)) continue;
        seen.add(it.key);
        dedup.push(it);
      }

      // limitar
      return dedup.slice(-100);
    }

    // ============================================
    // ROTA: OBTER CARTAS USADAS RECENTEMENTE (GLOBAL)
    // PADRONIZADO: sempre retorna KEYS (h:/id:)
    // ============================================
    if (path === '/cartas-recentes' && request.method === 'GET') {
      try {
        const id = env.PontosGlobaisDO.idFromName('pontos-globais');
        const stub = env.PontosGlobaisDO.get(id);
        const response = await stub.fetch(new Request('http://internal/cartas-recentes-globais'));
        return response;
      } catch (erro) {
        console.error('Erro ao buscar cartas recentes:', erro);
        return new Response(JSON.stringify({
          cartas: [],
          total: 0,
          timestamp: Date.now()
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...corsHeaders
          }
        });
      }
    }

    // ============================================
    // ROTA: REGISTRAR CARTAS USADAS (GLOBAL)
    // PADRONIZADO: sempre grava KEYS (h:/id:)
    // ============================================
    if (path === '/registrar-cartas' && request.method === 'POST') {
      try {
        const id = env.PontosGlobaisDO.idFromName('pontos-globais');
        const stub = env.PontosGlobaisDO.get(id);
        return stub.fetch(request);
      } catch (erro) {
        console.error('Erro ao registrar cartas:', erro);
        return new Response(JSON.stringify({
          success: false,
          erro: erro.message
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...corsHeaders
          }
        });
      }
    }

    // ============================================
    // ROTA: LIMPAR HISTÓRICO GLOBAL (ADMIN)
    // ============================================
    if (path === '/limpar-historico' && request.method === 'POST') {
      try {
        const id = env.PontosGlobaisDO.idFromName('pontos-globais');
        const stub = env.PontosGlobaisDO.get(id);
        const response = await stub.fetch(new Request('http://internal/limpar-historico-cartas', { method: 'POST' }));
        return response;
      } catch (erro) {
        console.error('Erro ao limpar histórico:', erro);
        return new Response(JSON.stringify({
          success: false,
          erro: erro.message
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...corsHeaders
          }
        });
      }
    }

    // ============================================
    // WEBSOCKET - MULTIPLAYER CASUAL
    // ============================================
    if (path === '/ws') {
      const sala = url.searchParams.get('sala');
      if (!sala) {
        return new Response('Sala não especificada', { status: 400 });
      }

      const id = env.SALA_DO.idFromName(sala);
      const stub = env.SALA_DO.get(id);
      return stub.fetch(request);
    }

    // ============================================
    // WEBSOCKET - MULTIPLAYER COMPETITIVO
    // ============================================
    if (path === '/ws-competitivo') {
      const sala = url.searchParams.get('sala');
      if (!sala) {
        return new Response('Sala não especificada', { status: 400 });
      }

      const id = env.SALA_COMPETITIVA_DO.idFromName(sala);
      const stub = env.SALA_COMPETITIVA_DO.get(id);
      return stub.fetch(request);
    }

    // ============================================
    // API REST - PONTOS
    // ============================================
    if (path.startsWith('/pontos/')) {
      const nome = decodeURIComponent(path.split('/')[2]);
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      const stub = env.PontosGlobaisDO.get(id);
      return stub.fetch(new Request(`http://internal/pontos/${nome}`));
    }

    if (path === '/adicionar' && request.method === 'POST') {
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      const stub = env.PontosGlobaisDO.get(id);
      return stub.fetch(request);
    }

    if (path === '/fase-completa' && request.method === 'POST') {
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      const stub = env.PontosGlobaisDO.get(id);
      return stub.fetch(request);
    }

    if (path === '/ranking') {
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      const stub = env.PontosGlobaisDO.get(id);
      return stub.fetch(new Request('http://internal/ranking'));
    }

    // ============================================
    // API REST - CARTAS
    // ============================================
    if (path.endsWith('/popular') && request.method === 'POST' && path.startsWith('/cartas/')) {
      const categoria = path.split('/')[2];

      let doNamespace;
      let bancoName;

      switch (categoria) {
        case 'personagens':
          doNamespace = env.BancoDadosPersonagensDO; bancoName = 'banco-personagens'; break;
        case 'profecias':
          doNamespace = env.BancoDadosProfeciasDO; bancoName = 'banco-profecias'; break;
        case 'mimica':
          doNamespace = env.BancoDadosMimicaDO; bancoName = 'banco-mimica'; break;
        case 'pregacao':
          doNamespace = env.BancoDadosPregacaoDO; bancoName = 'banco-pregacao'; break;

        // NOVO
        case 'verdadeirofalso':
          doNamespace = env.BancoDadosVerdadeiroFalsoDO; bancoName = 'banco-verdadeirofalso'; break;

        default:
          return new Response(JSON.stringify({ sucesso: false, erro: 'Categoria inválida', categoria }), {
            status: 400,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
      }

      const id = doNamespace.idFromName(bancoName);
      const stub = doNamespace.get(id);
      return stub.fetch(request);
    }

    if (path.startsWith('/cartas/') && !path.endsWith('/popular')) {
      const categoria = path.split('/')[2];

      let doNamespace;
      let bancoName;

      switch (categoria) {
        case 'personagens':
          doNamespace = env.BancoDadosPersonagensDO; bancoName = 'banco-personagens'; break;
        case 'profecias':
          doNamespace = env.BancoDadosProfeciasDO; bancoName = 'banco-profecias'; break;
        case 'mimica':
          doNamespace = env.BancoDadosMimicaDO; bancoName = 'banco-mimica'; break;
        case 'pregacao':
          doNamespace = env.BancoDadosPregacaoDO; bancoName = 'banco-pregacao'; break;

        // NOVO
        case 'verdadeirofalso':
          doNamespace = env.BancoDadosVerdadeiroFalsoDO; bancoName = 'banco-verdadeirofalso'; break;

        default:
          return new Response(JSON.stringify({ sucesso: false, erro: 'Categoria inválida', categoria }), {
            status: 400,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
      }

      const id = doNamespace.idFromName(bancoName);
      const stub = doNamespace.get(id);
      return stub.fetch(request);
    }

    // ============================================
    // API REST - RECOMPENSAS
    // ============================================
    if (path.startsWith('/perfil/')) {
      const nome = decodeURIComponent(path.split('/')[2]);
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      const stub = env.PontosGlobaisDO.get(id);
      return stub.fetch(new Request(`http://internal/perfil/${nome}`));
    }

    if (path === '/loja') {
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      const stub = env.PontosGlobaisDO.get(id);
      return stub.fetch(new Request('http://internal/loja'));
    }

    if (path === '/resgatar' && request.method === 'POST') {
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      const stub = env.PontosGlobaisDO.get(id);
      return stub.fetch(request);
    }

    if (path.startsWith('/conquistas/')) {
      const nome = decodeURIComponent(path.split('/')[2]);
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      const stub = env.PontosGlobaisDO.get(id);
      return stub.fetch(new Request(`http://internal/conquistas/${nome}`));
    }

    // ============================================
    // API REST - ADMIN (Jogadores) - PROTEGIDO POR TOKEN
    // Header obrigatório: X-Admin-Token
    // ============================================

    if (path.startsWith('/admin/jogadores/') && (request.method === 'PUT' || request.method === 'DELETE')) {
      const token = request.headers.get('X-Admin-Token') || '';
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return new Response(JSON.stringify({ sucesso: false, erro: 'Não autorizado' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      }

      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      const stub = env.PontosGlobaisDO.get(id);

      return stub.fetch(new Request("http://internal" + path, request));
    }

    if (path === '/admin/salas') {
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      const stub = env.PontosGlobaisDO.get(id);
      return stub.fetch(new Request('http://internal/admin/salas'));
    }

    if (path === '/admin/jogadores-completos') {
      const id = env.PontosGlobaisDO.idFromName('pontos-globais');
      const stub = env.PontosGlobaisDO.get(id);
      return stub.fetch(new Request('http://internal/admin/jogadores-completos'));
    }

    // ============================================
    // PÁGINA INICIAL
    // ============================================
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
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    await this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
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
        this.broadcast({
          tipo: 'jogador_saiu',
          nome: session.nome
        });
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
        this.broadcast({
          tipo: 'chat',
          nome: data.nome,
          mensagem: data.mensagem
        });
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
        carta: {
          dica1: this.cartaAtual.dica1,
          dica2: this.cartaAtual.dica2,
          dica3: this.cartaAtual.dica3
        }
      });

      setTimeout(() => {
        this.finalizarRodada();
      }, 60000);
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
    if (jogador) {
      jogador.pontos += pontos;
    }

    this.broadcast({
      tipo: 'resposta_registrada',
      nome: nome,
      acertou: acertou,
      pontos: pontos
    });
  }

  finalizarRodada() {
    this.rodadaAtiva = false;

    this.broadcast({
      tipo: 'fim_rodada',
      respostaCorreta: this.cartaAtual.resposta
    });
  }

  normalizarTexto(texto) {
    return texto.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  broadcast(message) {
    const msg = JSON.stringify(message);
    for (const [id, session] of this.sessions.entries()) {
      try {
        session.ws.send(msg);
      } catch (e) {
        console.error('Erro ao enviar mensagem:', e);
      }
    }
  }
}

// ============================================
// DURABLE OBJECT: SALA COMPETITIVA (A vs B)
// (PATCH) Removida pausa estratégica. Sala de conversa só abre após eliminação.
// (PATCH 2026-03-02) Resgate limitado: 1 resgate por jogador da Sala A por conversa/rodada,
//                    e um jogador da Sala B não pode ser resgatado 2x na mesma conversa.
// ============================================
export class SalaCompetitivaDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    this.STATE_KEY = 'estado_competitivo_v1';

    this.sessions = new Map();
    this.jogadores = new Map();
    this.salaA = new Set();
    this.salaB = new Set();
    this.host = null;
    this.categoria = 'personagens';
    this.rodadaAtual = 0;
    this.totalRodadas = 20;
    this.totalJogadoresInicial = 0;
    this.cartaAtual = null;
    this.respostas = new Map();
    this.rodadaAtiva = false;
    this.estadoSala = 'lobby';
    this.resgatesRealizados = 0;
    this.inicioJogo = null;
    this.timerRodada = null;

    // ✅ PATCH: controle de conversa apenas quando houve eliminação
    this.aguardandoConversaEliminacao = false;

    // ✅ PATCH: dedupe de mensagens para evitar spam no cliente
    this.ultimaConversaRodada = 0;
    this.ultimoContinuarJogoRodada = 0;

    // ✅ PATCH 2026-03-02: trava de resgates por conversa/rodada (1 por resgatador; 1 por resgatado)
    this.resgatesPorResgatadorRodada = new Set();
    this.resgatadosNaRodada = new Set();
  }

  exportarEstado() {
    return {
      host: this.host,
      categoria: this.categoria,
      rodadaAtual: this.rodadaAtual,
      totalRodadas: this.totalRodadas,
      totalJogadoresInicial: this.totalJogadoresInicial,
      cartaAtual: this.cartaAtual,
      rodadaAtiva: this.rodadaAtiva,
      estadoSala: this.estadoSala,
      resgatesRealizados: this.resgatesRealizados,
      inicioJogo: this.inicioJogo,
      jogadores: Array.from(this.jogadores.values()),
      salaA: Array.from(this.salaA),
      salaB: Array.from(this.salaB),

      aguardandoConversaEliminacao: this.aguardandoConversaEliminacao,
      ultimaConversaRodada: this.ultimaConversaRodada,
      ultimoContinuarJogoRodada: this.ultimoContinuarJogoRodada,

      // ✅ PATCH 2026-03-02
      resgatesPorResgatadorRodada: Array.from(this.resgatesPorResgatadorRodada),
      resgatadosNaRodada: Array.from(this.resgatadosNaRodada),
    };
  }

  async salvarEstado() {
    await this.state.storage.put(this.STATE_KEY, this.exportarEstado());
  }

  async carregarEstado() {
    const data = await this.state.storage.get(this.STATE_KEY);
    if (!data) return;

    this.host = data.host ?? this.host;
    this.categoria = data.categoria ?? this.categoria;
    this.rodadaAtual = data.rodadaAtual ?? this.rodadaAtual;
    this.totalRodadas = data.totalRodadas ?? this.totalRodadas;
    this.totalJogadoresInicial = data.totalJogadoresInicial ?? this.totalJogadoresInicial;
    this.cartaAtual = data.cartaAtual ?? this.cartaAtual;
    this.rodadaAtiva = data.rodadaAtiva ?? this.rodadaAtiva;
    this.estadoSala = data.estadoSala ?? this.estadoSala;
    this.resgatesRealizados = data.resgatesRealizados ?? this.resgatesRealizados;
    this.inicioJogo = data.inicioJogo ?? this.inicioJogo;

    this.jogadores = new Map((data.jogadores || []).map(j => [j.nome, j]));
    this.salaA = new Set(data.salaA || []);
    this.salaB = new Set(data.salaB || []);

    this.aguardandoConversaEliminacao = data.aguardandoConversaEliminacao ?? this.aguardandoConversaEliminacao;
    this.ultimaConversaRodada = data.ultimaConversaRodada ?? this.ultimaConversaRodada;
    this.ultimoContinuarJogoRodada = data.ultimoContinuarJogoRodada ?? this.ultimoContinuarJogoRodada;

    // ✅ PATCH 2026-03-02
    this.resgatesPorResgatadorRodada = new Set(data.resgatesPorResgatadorRodada || []);
    this.resgatadosNaRodada = new Set(data.resgatadosNaRodada || []);
  }

  async fetch(request) {
    await this.state.blockConcurrencyWhile(async () => {
      await this.carregarEstado();
    });

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    await this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
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
        this.removerJogador(session.nome);
      }
      this.sessions.delete(id);
    });
  }

  async handleMessage(sessionId, data) {
    const session = this.sessions.get(sessionId);
    const nome = data.nome || session.nome;

    switch (data.tipo) {
      case 'entrar':
        session.nome = nome;

        if (!this.host) {
          this.host = nome;
        }

        this.jogadores.set(nome, {
          nome: nome,
          pontos: 0,
          sala: 'A',
          host: nome === this.host,
          pulandoAte: null
        });

        this.salaA.add(nome);

        await this.salvarEstado();

        session.ws.send(JSON.stringify({
          tipo: 'bem_vindo',
          jogadores: Array.from(this.jogadores.values()),
          host: this.host
        }));

        this.broadcast({
          tipo: 'jogador_entrou',
          nome: nome,
          jogadores: Array.from(this.jogadores.values())
        });
        break;

      case 'iniciar_jogo':
        console.log('📨 [COMPETITIVO] Recebido iniciar_jogo de:', nome, 'HOST:', this.host);
        if (nome === this.host) {
          console.log('✅ [COMPETITIVO] HOST confirmado, iniciando jogo...');
          await this.iniciarJogo(data.categoria);
        } else {
          console.log('❌ [COMPETITIVO] Jogador não é HOST, ignorando');
        }
        break;

      case 'responder':
        await this.processarResposta(nome, data.resposta, data.tempo, data.dicas);
        break;

      case 'resgatar':
        await this.processarResgate(nome, data.nomeResgatado);
        break;

      case 'continuar_jogo':
        if (nome === this.host) {
          await this.continuarJogo();
        }
        break;

      case 'chat':
        this.broadcast({
          tipo: 'chat',
          nome: nome,
          mensagem: data.mensagem
        });
        break;
    }
  }

  async iniciarJogo(categoria) {
    console.log('🎮 [COMPETITIVO] Iniciando jogo - Categoria:', categoria);
    console.log('🎮 [COMPETITIVO] Total de jogadores:', this.jogadores.size);

    this.categoria = categoria;
    this.estadoSala = 'jogo';
    this.rodadaAtual = 0;
    this.inicioJogo = Date.now();

    this.aguardandoConversaEliminacao = false;
    this.ultimaConversaRodada = 0;
    this.ultimoContinuarJogoRodada = 0;

    // ✅ PATCH 2026-03-02: reset travas
    this.resgatesPorResgatadorRodada.clear();
    this.resgatadosNaRodada.clear();

    const totalJogadores = this.jogadores.size;
    this.totalJogadoresInicial = totalJogadores;
    this.totalRodadas = this.calcularTotalRodadas(totalJogadores);

    await this.salvarEstado();

    this.broadcast({
      tipo: 'jogo_iniciado',
      totalRodadas: this.totalRodadas,
      categoria: this.categoria
    });

    setTimeout(() => {
      this.proximaRodada();
    }, 2000);
  }

  calcularTotalRodadas(total) {
    if (total <= 2) return 10;
    if (total === 3) return 15;
    return 20; // 4+ jogadores → 20 rodadas fixas
  }

  async proximaRodada() {
    console.log('🔄 [COMPETITIVO] Iniciando rodada:', this.rodadaAtual + 1);

    this.rodadaAtual++;
    this.rodadaAtiva = true;
    this.respostas.clear();

    // ✅ a cada rodada, reseta gatilho de conversa
    this.aguardandoConversaEliminacao = false;

    // ✅ PATCH 2026-03-02: a cada rodada reseta travas de resgate (vale por conversa/rodada)
    this.resgatesPorResgatadorRodada.clear();
    this.resgatadosNaRodada.clear();

    await this.salvarEstado();

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

          if (this.rodadaAtual === jogador.pulandoAte) {
            jogador.pulandoAte = null;
          }
        }
      }

      const proximaEliminacao = this.getProximaEliminacao();

      await this.salvarEstado();

      this.broadcast({
        tipo: 'nova_rodada',
        rodada: this.rodadaAtual,
        carta: {
          dica1: this.cartaAtual.dica1,
          dica2: this.cartaAtual.dica2,
          dica3: this.cartaAtual.dica3,
          resposta: this.cartaAtual.resposta
        },
        proximaEliminacao: proximaEliminacao,
        jogadoresPulando: jogadoresPulando
      });

      if (this.timerRodada) {
        clearTimeout(this.timerRodada);
      }

      // ⏱️ Mantém 60s por rodada
      this.timerRodada = setTimeout(() => {
        if (this.rodadaAtiva) {
          console.log('⏰ [COMPETITIVO] Tempo esgotado! Finalizando rodada...');
          this.finalizarRodada();
        }
      }, 60000);
    }
  }

  verificarEliminacao() {
    if (this.totalJogadoresInicial <= 2) return false;
    return this.rodadaAtual % 5 === 0 && this.rodadaAtual < this.totalRodadas;
  }

  getProximaEliminacao() {
    if (this.totalJogadoresInicial <= 2) return null;

    let proxima = null;
    for (let r = 5; r < this.totalRodadas; r += 5) {
      if (r > this.rodadaAtual) {
        proxima = r;
        break;
      }
    }

    if (!proxima) return null;

    const jogadoresRestantes = this.salaA.size;
    const quantidade = this.totalJogadoresInicial <= 4
      ? 1
      : Math.max(1, Math.floor(jogadoresRestantes * 0.2));

    return { rodada: proxima, quantidade };
  }

  // ✅ PATCH: nova regra de pontos por dicas (tempo não conta)
  async processarResposta(nome, resposta, tempo, dicas) {
    const jogador = this.jogadores.get(nome);

    if (!jogador || jogador.sala !== 'A' || this.respostas.has(nome)) {
      return;
    }

    const acertou = this.normalizarTexto(resposta) === this.normalizarTexto(this.cartaAtual.resposta);

    let pontos = 0;
    if (acertou) {
      const dicasLiberadas = Math.min(3, Math.max(1, parseInt(dicas ?? 1, 10) || 1));
      pontos = 10 - (dicasLiberadas - 1) * 3; // 10, 7, 4
      if (pontos < 1) pontos = 1;
    }

    this.respostas.set(nome, { acertou, pontos });
    jogador.pontos += pontos;

    await this.salvarEstado();

    this.broadcast({
      tipo: 'resposta_registrada',
      nome: nome,
      acertou: acertou,
      pontos: pontos
    });

    const jogadoresSalaA = Array.from(this.salaA);
    const jogadoresAtivos = jogadoresSalaA.filter(nomeJogador => {
      const jog = this.jogadores.get(nomeJogador);
      return jog && !(jog.pulandoAte && this.rodadaAtual <= jog.pulandoAte);
    });
    const todosResponderam = jogadoresAtivos.every(nomeJogador => {
      return this.respostas.has(nomeJogador);
    });

    if (todosResponderam && this.rodadaAtiva) {
      console.log('✅ [COMPETITIVO] Todos da Sala A responderam! Finalizando em 2s...');

      if (this.timerRodada) {
        clearTimeout(this.timerRodada);
        this.timerRodada = null;
      }

      setTimeout(() => {
        if (this.rodadaAtiva) {
          this.finalizarRodada();
        }
      }, 2000);
    }
  }

  async finalizarRodada() {
    if (!this.rodadaAtiva) {
      console.log('⚠️ [COMPETITIVO] Rodada já finalizada, ignorando...');
      return;
    }

    console.log('🏁 [COMPETITIVO] Finalizando rodada', this.rodadaAtual);

    this.rodadaAtiva = false;

    if (this.timerRodada) {
      clearTimeout(this.timerRodada);
      this.timerRodada = null;
    }

    await this.salvarEstado();

    this.broadcast({
      tipo: 'fim_rodada',
      respostaCorreta: this.cartaAtual.resposta
    });

    const houveEliminacao = this.verificarEliminacao();

    if (houveEliminacao) {
      await this.eliminarJogadores();
      this.aguardandoConversaEliminacao = true;
      await this.salvarEstado();
    }

    if (this.rodadaAtual >= this.totalRodadas) {
      setTimeout(() => {
        this.finalizarJogo();
      }, 3000);
      return;
    }

    // ✅ somente após eliminação abre conversa (para resgates)
    if (this.aguardandoConversaEliminacao) {
      setTimeout(() => {
        this.iniciarSalaConversa();
      }, 3000);
      return;
    }

    // ✅ sem eliminação: segue o jogo direto
    setTimeout(() => {
      this.proximaRodada();
    }, 3000);
  }

  async eliminarJogadores() {
    const quantidade = this.calcularQuantidadeEliminacao();

    const jogadoresSalaA = Array.from(this.salaA)
      .map(nome => this.jogadores.get(nome))
      .filter(Boolean)
      .sort((a, b) => a.pontos - b.pontos);

    const eliminados = jogadoresSalaA.slice(0, quantidade);

    for (const jogador of eliminados) {
      jogador.sala = 'B';
      this.salaA.delete(jogador.nome);
      this.salaB.add(jogador.nome);
    }

    await this.salvarEstado();

    this.broadcast({
      tipo: 'eliminacao',
      eliminados: eliminados.map(j => j.nome),
      salaA: Array.from(this.salaA).map(nome => {
        const j = this.jogadores.get(nome);
        return { nome: j.nome, pontos: j.pontos, host: j.host };
      }),
      salaB: Array.from(this.salaB).map(nome => {
        const j = this.jogadores.get(nome);
        return { nome: j.nome, pontos: j.pontos };
      })
    });
  }

  calcularQuantidadeEliminacao() {
    const total = this.salaA.size;
    if (this.totalJogadoresInicial <= 4) return 1;
    return Math.max(1, Math.floor(total * 0.2));
  }

  async iniciarSalaConversa() {
    // ✅ só entra em conversa quando gatilho estiver true
    if (!this.aguardandoConversaEliminacao) {
      console.log('⚠️ [COMPETITIVO] iniciarSalaConversa ignorado (sem eliminacao)');
      return;
    }

    // ✅ dedupe: não mandar duas conversas na mesma rodada
    if (this.ultimaConversaRodada === this.rodadaAtual) {
      console.log('⚠️ [COMPETITIVO] sala_conversa duplicada ignorada (rodada)', this.rodadaAtual);
      return;
    }

    this.estadoSala = 'conversa';
    this.ultimaConversaRodada = this.rodadaAtual;

    // ✅ PATCH 2026-03-02: ao abrir conversa, garante travas limpas
    this.resgatesPorResgatadorRodada.clear();
    this.resgatadosNaRodada.clear();

    // consome gatilho
    this.aguardandoConversaEliminacao = false;

    const proximaEliminacao = this.getProximaEliminacao();

    await this.salvarEstado();

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
      proximaEliminacao: proximaEliminacao
    });
  }

  async processarResgate(nomeResgatador, nomeResgatado) {
    const resgatador = this.jogadores.get(nomeResgatador);
    const resgatado = this.jogadores.get(nomeResgatado);

    if (!resgatador || !resgatado) return;
    if (this.totalJogadoresInicial <= 2) return; // sem Sala B no modo 2 jogadores
    if (resgatador.sala !== 'A' || resgatado.sala !== 'B') return;
    if (resgatador.pontos < 5) return;

    // ✅ PATCH 2026-03-02: resgate só permitido durante a conversa
    if (this.estadoSala !== 'conversa') return;

    // ✅ PATCH 2026-03-02: cada jogador da Sala A resgata apenas 1 por conversa/rodada
    if (this.resgatesPorResgatadorRodada.has(nomeResgatador)) {
      return;
    }

    // ✅ PATCH 2026-03-02: um jogador da Sala B só pode ser resgatado uma vez (protege corrida)
    if (this.resgatadosNaRodada.has(nomeResgatado)) {
      return;
    }

    // trava antes de efetivar (importante contra corrida)
    this.resgatesPorResgatadorRodada.add(nomeResgatador);
    this.resgatadosNaRodada.add(nomeResgatado);

    resgatador.pontos -= 5;
    resgatador.pulandoAte = this.rodadaAtual + 1;

    resgatado.sala = 'A';
    this.salaB.delete(nomeResgatado);
    this.salaA.add(nomeResgatado);

    this.resgatesRealizados++;

    const proximaEliminacao = this.getProximaEliminacao();

    await this.salvarEstado();

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
      proximaEliminacao: proximaEliminacao
    });
  }

  async continuarJogo() {
    // ✅ dedupe: não mandar continuar_jogo repetido na mesma rodada
    if (this.ultimoContinuarJogoRodada === this.rodadaAtual) {
      console.log('⚠️ [COMPETITIVO] continuar_jogo duplicado ignorado (rodada)', this.rodadaAtual);
      return;
    }

    // Só faz sentido continuar se estiver na conversa
    if (this.estadoSala !== 'conversa') {
      console.log('⚠️ [COMPETITIVO] continuar_jogo ignorado (estadoSala != conversa):', this.estadoSala);
      return;
    }

    this.ultimoContinuarJogoRodada = this.rodadaAtual;
    this.estadoSala = 'jogo';

    await this.salvarEstado();

    this.broadcast({
      tipo: 'continuar_jogo'
    });

    setTimeout(() => {
      this.proximaRodada();
    }, 2000);
  }

  finalizarJogo() {
    this.estadoSala = 'final';

    const duracao = this.inicioJogo ? Math.floor((Date.now() - this.inicioJogo) / 60000) : 0;

    // salva async sem await (função não é async)
    this.state.storage.put(this.STATE_KEY, this.exportarEstado()).catch(() => {});

    this.broadcast({
      tipo: 'fim_jogo',
      totalRodadas: this.totalRodadas,
      salaA: Array.from(this.salaA).map(nome => {
        const j = this.jogadores.get(nome);
        return { nome: j.nome, pontos: j.pontos };
      }).sort((a, b) => b.pontos - a.pontos),
      salaB: Array.from(this.salaB).map(nome => {
        const j = this.jogadores.get(nome);
        return { nome: j.nome, pontos: j.pontos };
      }).sort((a, b) => b.pontos - a.pontos),
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

        this.broadcast({
          tipo: 'host_mudou',
          novoHost: this.host,
          jogadores: Array.from(this.jogadores.values())
        });
      }
    }

    // salva async sem await (função não é async)
    this.state.storage.put(this.STATE_KEY, this.exportarEstado()).catch(() => {});

    this.broadcast({
      tipo: 'jogador_saiu',
      nome: nome
    });
  }

  normalizarTexto(texto) {
    return texto.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  broadcast(message) {
    const msg = JSON.stringify(message);
    for (const [id, session] of this.sessions.entries()) {
      try {
        session.ws.send(msg);
      } catch (e) {
        console.error('Erro ao enviar mensagem:', e);
      }
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
      try {
        const categoria = path.split('/')[2];
        const body = await request.json();

        if (!body || !Array.isArray(body.cartas)) {
          return new Response(JSON.stringify({
            sucesso: false,
            erro: 'Payload inválido: esperado objeto com array "cartas"'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const resultado = await this.popularCartas(categoria, body.cartas);

        return new Response(JSON.stringify({
          sucesso: true,
          categoria,
          inseridas: resultado.inseridas,
          ignoradas: resultado.ignoradas
        }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      } catch (erro) {
        return new Response(JSON.stringify({
          sucesso: false,
          erro: erro?.message || 'Erro ao popular cartas'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (path.startsWith('/cartas/') && !path.endsWith('/popular')) {
      const categoria = path.split('/')[2];
      const cartas = await this.obterCartas(categoria);
      return new Response(JSON.stringify({ cartas }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
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
        resposta TEXT NOT NULL,
        genero TEXT,
        masculino INTEGER DEFAULT 0,
        feminino INTEGER DEFAULT 0,
        dificuldade INTEGER DEFAULT 5
      )
    `);

    const colunas = this.sql.exec('PRAGMA table_info(cartas)').toArray().map(c => c.name);
    if (!colunas.includes('genero')) this.sql.exec('ALTER TABLE cartas ADD COLUMN genero TEXT');
    if (!colunas.includes('masculino')) this.sql.exec('ALTER TABLE cartas ADD COLUMN masculino INTEGER DEFAULT 0');
    if (!colunas.includes('feminino')) this.sql.exec('ALTER TABLE cartas ADD COLUMN feminino INTEGER DEFAULT 0');
    if (!colunas.includes('dificuldade')) this.sql.exec('ALTER TABLE cartas ADD COLUMN dificuldade INTEGER DEFAULT 5');

    const count = this.sql.exec('SELECT COUNT(*) as total FROM cartas').toArray()[0].total;

    if (count === 0) {
      await this.popularCartasPadrao();
    }
  }

  async obterCartas(categoria) {
    const result = this.sql.exec(
      'SELECT id, dica1, dica2, dica3, resposta, genero, masculino, feminino, dificuldade FROM cartas WHERE categoria = ?',
      categoria
    ).toArray();

    return result;
  }

  async popularCartas(categoria, cartas) {
    if (!Array.isArray(cartas)) {
      throw new Error('Formato inválido para cartas: esperado array');
    }

    // Função melhorada para garantir UTF-8 correto
    const normalizarTexto = (valor) => {
      if (valor == null) return '';
      let texto = String(valor).trim();
      // Remove caracteres de controle mas mantém caracteres UTF-8 válidos
      texto = texto.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      return texto;
    };
    const normalizadas = [];

    for (const carta of cartas) {
      const resposta = normalizarTexto(carta?.resposta);
      const dica1 = normalizarTexto(carta?.dica1);
      const dica2 = normalizarTexto(carta?.dica2);
      const dica3 = normalizarTexto(carta?.dica3);

      if (!resposta || !dica1 || !dica2 || !dica3) {
        continue;
      }

      const genero = typeof carta?.genero === 'string' ? carta.genero.toLowerCase() : null;
      const masculino = carta?.masculino === true || carta?.masculino === 1 ? 1 : 0;
      const feminino = carta?.feminino === true || carta?.feminino === 1 ? 1 : 0;
      const dificuldadeRaw = Number.isFinite(Number(carta?.dificuldade)) ? Number(carta.dificuldade) : 5;
      const dificuldade = Math.max(0, Math.min(10, Math.round(dificuldadeRaw)));

      normalizadas.push({
        categoria,
        dica1,
        dica2,
        dica3,
        resposta,
        genero,
        masculino,
        feminino,
        dificuldade
      });
    }

    this.sql.exec('DELETE FROM cartas WHERE categoria = ?', categoria);

    for (const carta of normalizadas) {
      this.sql.exec(
        'INSERT INTO cartas (categoria, dica1, dica2, dica3, resposta, genero, masculino, feminino, dificuldade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        carta.categoria,
        carta.dica1,
        carta.dica2,
        carta.dica3,
        carta.resposta,
        carta.genero,
        carta.masculino,
        carta.feminino,
        carta.dificuldade
      );
    }

    return {
      inseridas: normalizadas.length,
      ignoradas: cartas.length - normalizadas.length
    };
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

// NOVO: bancos separados (1 DO SQLite por categoria)
export class BancoDadosPersonagensDO extends BancoDadosDO {}
export class BancoDadosProfeciasDO extends BancoDadosDO {}
export class BancoDadosMimicaDO extends BancoDadosDO {}
export class BancoDadosPregacaoDO extends BancoDadosDO {}
export class BancoDadosVerdadeiroFalsoDO extends BancoDadosDO {}

// ============================================
// DURABLE OBJECT: PONTOS GLOBAIS + RECOMPENSAS
// ============================================
export class PontosGlobaisDO {
  constructor(state, env) {
    this.state = state;
    this.sql = state.storage.sql;
    this.initialized = false;
  }

  normalizarNomeEntrada(nome) {
    return String(nome || '').trim();
  }

  obterNomeCanonical(nome) {
    const nomeLimpo = this.normalizarNomeEntrada(nome);
    if (!nomeLimpo) return '';

    const existente = this.sql.exec(
      'SELECT nome FROM jogadores WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?)) LIMIT 1',
      nomeLimpo
    ).toArray();

    if (existente.length > 0) {
      return existente[0].nome;
    }

    return nomeLimpo;
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
      try {
        const body = await request.json();
        const resultado = await this.adicionarPontos(body.nome, body.pontos);
        return new Response(JSON.stringify({ sucesso: true, ...resultado }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (erro) {
        return new Response(JSON.stringify({
          sucesso: false,
          erro: erro.message || 'Falha ao adicionar pontos'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (path === '/fase-completa' && request.method === 'POST') {
      try {
        const body = await request.json();
        const resultado = await this.adicionarPontosFase(
          body.nome,
          body.faseNumero,
          body.pontosTotal,
          body.pontosNormal,
          body.pontosBonusTotal,
          body.categoria
        );
        return new Response(JSON.stringify({ sucesso: true, ...resultado }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (erro) {
        return new Response(JSON.stringify({
          sucesso: false,
          erro: erro.message || 'Falha ao registrar fase'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
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

    // NOVO: Endpoint para obter cartas recentes globais
    if (path === '/cartas-recentes-globais') {
      try {
        const cartas = await this.obterCartasRecentesGlobais();
        return new Response(JSON.stringify({
          cartas: cartas,
          total: cartas.length,
          timestamp: Date.now()
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (erro) {
        console.error('Erro ao obter cartas recentes:', erro);
        return new Response(JSON.stringify({
          cartas: [],
          total: 0,
          erro: erro.message
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // NOVO: Endpoint para registrar cartas globais
    if (path === '/registrar-cartas' && request.method === 'POST') {
      try {
        const body = await request.json();
        const input = Array.isArray(body.cartas) ? body.cartas : [];

        if (input.length === 0) {
          return new Response(JSON.stringify({
            success: true,
            registradas: 0
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const resultado = await this.registrarCartasGlobais(input);
        return new Response(JSON.stringify({
          success: true,
          ...resultado
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (erro) {
        console.error('Erro ao registrar cartas:', erro);
        return new Response(JSON.stringify({
          success: false,
          erro: erro.message
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // NOVO: Endpoint para limpar histórico de cartas
    if (path === '/limpar-historico-cartas' && request.method === 'POST') {
      try {
        const resultado = await this.limparCartasGlobais();
        return new Response(JSON.stringify({
          success: true,
          ...resultado
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (erro) {
        console.error('Erro ao limpar histórico:', erro);
        return new Response(JSON.stringify({
          success: false,
          erro: erro.message
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // NOVO: Admin - Listar salas
    if (path === '/admin/salas') {
      try {
        return new Response(JSON.stringify({
          salas: []
        }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      } catch (erro) {
        return new Response(JSON.stringify({
          salas: [],
          erro: erro.message
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      }
    }

    // NOVO: Admin - Listar jogadores solo com última partida
    if (path === '/admin/jogadores-completos') {
      try {
        const jogadores = await this.obterJogadoresCompletos();
        return new Response(JSON.stringify({
          jogadores: jogadores
        }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      } catch (erro) {
        console.error('Erro ao obter jogadores completos:', erro);
        return new Response(JSON.stringify({
          jogadores: [],
          erro: erro.message
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      }
    }

    // ============================
    // ADMIN: Atualizar / Excluir jogador
    // ============================

    // PUT /admin/jogadores/:nome
    if (path.startsWith('/admin/jogadores/') && request.method === 'PUT') {
      try {
        const nomeAtual = decodeURIComponent(path.split('/')[3] || '').trim();
        if (!nomeAtual) throw new Error('Nome atual inválido');

        const body = await request.json().catch(() => ({}));
        const novoNome = typeof body?.novoNome === 'string' ? body.novoNome.trim() : '';
        const pontos = body?.pontos;

        if (pontos === undefined || pontos === null || pontos === '') throw new Error('Campo "pontos" é obrigatório');
        const pontosNumero = Number(pontos);
        if (!Number.isFinite(pontosNumero) || pontosNumero < 0) throw new Error('Campo "pontos" inválido');

        const existe = this.sql.exec('SELECT nome FROM jogadores WHERE nome = ? LIMIT 1', nomeAtual).toArray();
        if (existe.length === 0) throw new Error('Jogador não encontrado');

        let nomeFinal = nomeAtual;

        if (novoNome && novoNome !== nomeAtual) {
          const conflito = this.sql.exec('SELECT nome FROM jogadores WHERE nome = ? LIMIT 1', novoNome).toArray();
          if (conflito.length > 0) throw new Error('Já existe um jogador com esse novo nome');

          this.sql.exec('UPDATE jogadores SET nome = ? WHERE nome = ?', novoNome, nomeAtual);
          this.sql.exec('UPDATE historico_fases SET nome = ? WHERE nome = ?', novoNome, nomeAtual);
          this.sql.exec('UPDATE resgates SET nome = ? WHERE nome = ?', novoNome, nomeAtual);

          nomeFinal = novoNome;
        }

        this.sql.exec('UPDATE jogadores SET pontos = ? WHERE nome = ?', pontosNumero, nomeFinal);
        await this.atualizarNivel(nomeFinal, pontosNumero);

        const atualizado = this.sql.exec('SELECT nome, pontos, nivel FROM jogadores WHERE nome = ? LIMIT 1', nomeFinal).toArray()[0];

        return new Response(JSON.stringify({ sucesso: true, jogador: atualizado }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      } catch (erro) {
        return new Response(JSON.stringify({ sucesso: false, erro: erro.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      }
    }

    // DELETE /admin/jogadores/:nome
    if (path.startsWith('/admin/jogadores/') && request.method === 'DELETE') {
      try {
        const nome = decodeURIComponent(path.split('/')[3] || '').trim();
        if (!nome) throw new Error('Nome inválido');

        this.sql.exec('DELETE FROM historico_fases WHERE nome = ?', nome);
        this.sql.exec('DELETE FROM resgates WHERE nome = ?', nome);
        this.sql.exec('DELETE FROM jogadores WHERE nome = ?', nome);

        return new Response(JSON.stringify({ sucesso: true }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      } catch (erro) {
        return new Response(JSON.stringify({ sucesso: false, erro: erro.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  async inicializar() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS jogadores (
        nome TEXT PRIMARY KEY,
        pontos INTEGER DEFAULT 0,
        nivel INTEGER DEFAULT 1,
        ultima_partida INTEGER DEFAULT 0
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS historico_fases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        faseNumero INTEGER NOT NULL,
        pontosTotal INTEGER DEFAULT 0,
        pontosNormal INTEGER DEFAULT 0,
        pontosBonusTotal INTEGER DEFAULT 0,
        categoria TEXT,
        data INTEGER DEFAULT 0
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS resgates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        item TEXT NOT NULL,
        custo INTEGER NOT NULL,
        data INTEGER DEFAULT 0
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS conquistas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        conquista TEXT NOT NULL,
        data INTEGER DEFAULT 0
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS historico_cartas_globais (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // índices
    this.sql.exec('CREATE INDEX IF NOT EXISTS idx_hcg_ts ON historico_cartas_globais(timestamp)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS idx_hcg_key ON historico_cartas_globais(key)');

    // loja
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS loja (
        item TEXT PRIMARY KEY,
        custo INTEGER NOT NULL,
        descricao TEXT NOT NULL
      )
    `);

    // popula loja se vazia
    const totalLoja = this.sql.exec('SELECT COUNT(*) as total FROM loja').toArray()[0].total;
    if (totalLoja === 0) {
      await this.popularLoja();
    }
  }

  async obterPontos(nome) {
    const canon = this.obterNomeCanonical(nome);
    if (!canon) return 0;

    const result = this.sql.exec('SELECT pontos FROM jogadores WHERE nome = ? LIMIT 1', canon).toArray();
    return result.length > 0 ? (result[0].pontos || 0) : 0;
  }

  async adicionarPontos(nome, pontos) {
    const canon = this.obterNomeCanonical(nome);
    if (!canon) throw new Error('Nome inválido');

    const pontosNumero = Number(pontos);
    if (!Number.isFinite(pontosNumero) || pontosNumero < 0) throw new Error('Pontos inválidos');

    const existente = this.sql.exec('SELECT pontos FROM jogadores WHERE nome = ? LIMIT 1', canon).toArray();
    if (existente.length === 0) {
      this.sql.exec('INSERT INTO jogadores (nome, pontos, nivel, ultima_partida) VALUES (?, ?, ?, ?)', canon, pontosNumero, 1, Date.now());
    } else {
      const novoTotal = (existente[0].pontos || 0) + pontosNumero;
      this.sql.exec('UPDATE jogadores SET pontos = ?, ultima_partida = ? WHERE nome = ?', novoTotal, Date.now(), canon);
      await this.atualizarNivel(canon, novoTotal);
    }

    const pontosAtual = await this.obterPontos(canon);
    return { nome: canon, pontos: pontosAtual };
  }

  async adicionarPontosFase(nome, faseNumero, pontosTotal, pontosNormal, pontosBonusTotal, categoria) {
    const canon = this.obterNomeCanonical(nome);
    if (!canon) throw new Error('Nome inválido');

    const fase = Number(faseNumero);
    if (!Number.isFinite(fase) || fase < 0) throw new Error('Fase inválida');

    const pt = Number(pontosTotal) || 0;
    const pn = Number(pontosNormal) || 0;
    const pb = Number(pontosBonusTotal) || 0;

    const now = Date.now();

    this.sql.exec(
      'INSERT INTO historico_fases (nome, faseNumero, pontosTotal, pontosNormal, pontosBonusTotal, categoria, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
      canon, fase, pt, pn, pb, categoria || null, now
    );

    const existente = this.sql.exec('SELECT pontos FROM jogadores WHERE nome = ? LIMIT 1', canon).toArray();
    if (existente.length === 0) {
      this.sql.exec('INSERT INTO jogadores (nome, pontos, nivel, ultima_partida) VALUES (?, ?, ?, ?)', canon, pt, 1, now);
      await this.atualizarNivel(canon, pt);
    } else {
      const novoTotal = (existente[0].pontos || 0) + pt;
      this.sql.exec('UPDATE jogadores SET pontos = ?, ultima_partida = ? WHERE nome = ?', novoTotal, now, canon);
      await this.atualizarNivel(canon, novoTotal);
    }

    const pontosAtual = await this.obterPontos(canon);
    return { nome: canon, pontos: pontosAtual };
  }

  async obterCartasRecentesGlobais() {
    const agora = Date.now();
    const umaHoraAtras = agora - (60 * 60 * 1000);

    const rows = this.sql.exec(
      'SELECT key, timestamp FROM historico_cartas_globais WHERE timestamp > ? ORDER BY timestamp ASC',
      umaHoraAtras
    ).toArray();

    // migração/dedup in-memory (garante padronização)
    const historico = { cartas: rows.map(r => ({ key: r.key, timestamp: r.timestamp })) };
    const migrado = migrarHistoricoParaKeys(historico, agora);
    return migrado.map(x => x.key);
  }

  async registrarCartasGlobais(chaves) {
    const agora = Date.now();
    const input = Array.isArray(chaves) ? chaves : [];

    const keys = input
      .map(v => normalizarParaKey(v))
      .filter(Boolean);

    if (keys.length === 0) return { registradas: 0 };

    for (const key of keys) {
      this.sql.exec(
        'INSERT INTO historico_cartas_globais (key, timestamp) VALUES (?, ?)',
        key,
        agora
      );
    }

    // limpa mais antigas que 1h
    const umaHoraAtras = agora - (60 * 60 * 1000);
    this.sql.exec('DELETE FROM historico_cartas_globais WHERE timestamp <= ?', umaHoraAtras);

    return { registradas: keys.length };
  }

  async limparCartasGlobais() {
    this.sql.exec('DELETE FROM historico_cartas_globais');
    return { removidas: true };
  }

  async atualizarNivel(nome, pontos) {
    const p = Number(pontos) || 0;
    // regra simples: nível a cada 100 pontos
    const nivel = Math.max(1, Math.floor(p / 100) + 1);
    this.sql.exec('UPDATE jogadores SET nivel = ? WHERE nome = ?', nivel, nome);
    return nivel;
  }

  async obterRanking() {
    return this.sql.exec('SELECT nome, pontos, nivel FROM jogadores ORDER BY pontos DESC LIMIT 50').toArray();
  }

  async obterJogadoresCompletos() {
    return this.sql.exec('SELECT nome, pontos, nivel, ultima_partida FROM jogadores ORDER BY ultima_partida DESC LIMIT 200').toArray();
  }

  async obterPerfil(nome) {
    const canon = this.obterNomeCanonical(nome);
    if (!canon) return { nome: '', pontos: 0, nivel: 1, historico: [], resgates: [] };

    const jogador = this.sql.exec('SELECT nome, pontos, nivel, ultima_partida FROM jogadores WHERE nome = ? LIMIT 1', canon).toArray()[0]
      || { nome: canon, pontos: 0, nivel: 1, ultima_partida: 0 };

    const historico = this.sql.exec(
      'SELECT faseNumero, pontosTotal, pontosNormal, pontosBonusTotal, categoria, data FROM historico_fases WHERE nome = ? ORDER BY data DESC LIMIT 50',
      canon
    ).toArray();

    const resgates = this.sql.exec(
      'SELECT item, custo, data FROM resgates WHERE nome = ? ORDER BY data DESC LIMIT 50',
      canon
    ).toArray();

    const conquistas = this.sql.exec(
      'SELECT conquista, data FROM conquistas WHERE nome = ? ORDER BY data DESC LIMIT 50',
      canon
    ).toArray();

    return { jogador, historico, resgates, conquistas };
  }

  async obterLoja() {
    const itens = this.sql.exec('SELECT item, custo, descricao FROM loja ORDER BY custo ASC').toArray();
    return { itens };
  }

  async resgatarItem(nome, item, custo) {
    const canon = this.obterNomeCanonical(nome);
    if (!canon) throw new Error('Nome inválido');

    const it = String(item || '').trim();
    if (!it) throw new Error('Item inválido');

    const custoNum = Number(custo);
    if (!Number.isFinite(custoNum) || custoNum < 0) throw new Error('Custo inválido');

    const jogador = this.sql.exec('SELECT pontos FROM jogadores WHERE nome = ? LIMIT 1', canon).toArray();
    if (jogador.length === 0) throw new Error('Jogador não encontrado');

    const pontosAtual = jogador[0].pontos || 0;
    if (pontosAtual < custoNum) throw new Error('Pontos insuficientes');

    const novoTotal = pontosAtual - custoNum;
    this.sql.exec('UPDATE jogadores SET pontos = ? WHERE nome = ?', novoTotal, canon);
    await this.atualizarNivel(canon, novoTotal);

    this.sql.exec('INSERT INTO resgates (nome, item, custo, data) VALUES (?, ?, ?, ?)', canon, it, custoNum, Date.now());

    return { sucesso: true, nome: canon, pontos: novoTotal };
  }

  async obterConquistas(nome) {
    const canon = this.obterNomeCanonical(nome);
    if (!canon) return [];

    const rows = this.sql.exec('SELECT conquista, data FROM conquistas WHERE nome = ? ORDER BY data DESC LIMIT 200', canon).toArray();
    return rows;
  }

  async popularLoja() {
    const itens = [
      { item: 'Dica Extra', custo: 50, descricao: 'Ganhe 1 dica extra em uma rodada (solo).' },
      { item: 'Pular Pergunta', custo: 80, descricao: 'Pule uma carta e vá para a próxima (solo).' },
      { item: 'Tema Especial', custo: 120, descricao: 'Desbloqueia um tema especial (em breve).' },
    ];

    for (const it of itens) {
      this.sql.exec('INSERT OR REPLACE INTO loja (item, custo, descricao) VALUES (?, ?, ?)', it.item, it.custo, it.descricao);
    }
  }
}

function paginaInicial() {
  return `QUEM SOU EU? - Backend ativo`;
}

// Compatibilidade retroativa
export class PontosBiblicoDO extends PontosGlobaisDO {}