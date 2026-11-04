/* Ajudante com Gemini: as FERRAMENTAS rodam aqui no aparelho, sobre os dados reais (sem EXEMPLO); o modelo só vê os resultados.
   PURO e testável em Node (node tools/teste-gemini.js). ES5. byGui */
(function (raiz) {
  'use strict';
  var C = typeof require === 'function' && typeof module !== 'undefined' ? require('./assistente-consultas.js') : raiz.PS.consultas;
  var DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], PRIO = { alta: 0, media: 1, baixa: 2 };
  function pad(n) { n = +n; return (n < 10 ? '0' : '') + n; }
  function iso(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }
  function ddmm(d) { return d.slice(8, 10) + '/' + d.slice(5, 7); }
  function dia(d) { var p = d.split('-'); return DIAS[new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()] + ', ' + ddmm(d); }
  function brl(v) { return v == null || !isFinite(v) ? 'sem valor' : 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function real(x) { return x && !x.exemplo; }
  function fimMes(h) { var y = +h.slice(0, 4), m = +h.slice(5, 7); return y + '-' + pad(m) + '-' + pad(new Date(Date.UTC(y, m, 0)).getUTCDate()); }

  function evento(c) { return { titulo: c.titulo, data: c.data, dia: dia(c.data), hora: c.hora || 'dia todo', local: c.local || '' }; }
  function tarefa(t) { return { titulo: t.titulo, lista: t.lista || '', prioridade: t.prio || 'media', prazo: t.vence ? dia(t.vence) : 'sem prazo', concluida: !!t.feita }; }
  function conta(x) { return { titulo: x.titulo, valor: brl(x.valor), vencimento: dia(x.data), situacao: x.pagaEm ? 'paga em ' + ddmm(x.pagaEm) : x.dias < 0 ? 'atrasada há ' + (-x.dias) + ' dia(s)' : x.dias === 0 ? 'vence hoje' : 'vence em ' + x.dias + ' dia(s)' }; }

  /* executa UMA ferramenta. d = { compromissos, tarefas, abertas, pagas }, hoje AAAA-MM-DD, agora HH:MM */
  function executar(nome, a, d, hoje, agora) {
    a = a || {}; d = d || {};
    if (nome === 'buscar_agenda') {
      var de = iso(a.de) || hoje, ate = iso(a.ate) || de; if (ate < de) { var t = de; de = ate; ate = t; }
      var ev = (d.compromissos || []).filter(real).filter(function (c) { return c.data >= de && c.data <= ate; })
        .sort(function (x, y) { return (x.data + (x.hora || '')) < (y.data + (y.hora || '')) ? -1 : 1; }).slice(0, 40);
      return { periodo: dia(de) + ' a ' + dia(ate), total: ev.length, itens: ev.map(evento) };
    }
    if (nome === 'proximo_evento') {
      var p = (d.compromissos || []).filter(real).filter(function (c) { return c.data > hoje || (c.data === hoje && (!c.hora || !agora || c.hora >= agora)); })
        .sort(function (x, y) { return (x.data + (x.hora || '')) < (y.data + (y.hora || '')) ? -1 : 1; })[0];
      return p ? { encontrado: true, evento: evento(p) } : { encontrado: false };
    }
    if (nome === 'listar_tarefas') {
      var f = a.filtro || 'pendentes', fim7 = C.somaDias(hoje, 7), ts = (d.tarefas || []).filter(real).filter(function (t) {
        if (a.lista && String(t.lista || '').toLowerCase() !== String(a.lista).toLowerCase()) return false;
        if (f === 'todas') return true; if (f === 'concluidas') return !!t.feita; if (t.feita) return false;
        if (f === 'alta') return t.prio === 'alta'; if (f === 'hoje') return t.vence === hoje; if (f === 'atrasadas') return !!t.vence && t.vence < hoje;
        if (f === 'semana') return !!t.vence && t.vence <= fim7; return true;
      }).sort(function (x, y) { if (!!x.feita !== !!y.feita) return x.feita ? 1 : -1; var px = PRIO[x.prio] == null ? 1 : PRIO[x.prio], py = PRIO[y.prio] == null ? 1 : PRIO[y.prio]; if (px !== py) return px - py; return (x.vence || '9999') < (y.vence || '9999') ? -1 : 1; });
      var n = +a.limite > 0 ? Math.min(+a.limite, 50) : 50;
      return { filtro: f, total: ts.length, mostrando: Math.min(n, ts.length), itens: ts.slice(0, n).map(tarefa) };
    }
    if (nome === 'listar_contas') {
      /* atrasadas: sempre todas as vencidas (o modelo às vezes manda de=ate=hoje para "atrasada hoje") */
      var st = a.status || 'abertas', de2 = iso(a.de), ate2 = iso(a.ate);
      var l = st === 'pagas' ? (d.pagas || []) : st === 'todas' ? (d.abertas || []).concat(d.pagas || []) : (d.abertas || []);
      l = l.filter(real).filter(function (x) { return (st !== 'atrasadas' || x.dias < 0) && (st === 'atrasadas' || ((!de2 || x.data >= de2) && (!ate2 || x.data <= ate2))); })
        .sort(function (x, y) { return x.data < y.data ? -1 : 1; }).slice(0, 40);
      var soma = 0, tem = false; l.forEach(function (x) { if (x.valor != null && isFinite(x.valor)) { soma += x.valor; tem = true; } });
      return { status: st, total: l.length, soma: tem ? brl(Math.round(soma * 100) / 100) : 'sem valor', itens: l.map(conta) };
    }
    return { erro: 'ferramenta desconhecida' };
  }

  /* criar_sugestao: só vale se o usuário pediu para criar/anotar/lembrar (na mensagem atual ou na anterior: "sim, pode criar") */
  function sugestao(a, pedidos, hoje) {
    a = a || {};
    var pediu = pedidos.some(function (p) { return C.pedeCriar(p) || /^\s*(sim|pode|isso|ok|confirmo|manda)\b/i.test(p); });
    if (!pediu) return { erro: 'o usuário não pediu para criar nada; não sugira' };
    var t = String(a.titulo || '').trim().slice(0, 120), tipo = a.tipo, data = iso(a.data), hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(a.hora || '') ? a.hora : '';
    if (!t) return { erro: 'falta o título' };
    if (data && data < hoje) return { erro: 'data no passado' };
    var s;
    if (tipo === 'compras') { var its = (Array.isArray(a.itens) ? a.itens : []).map(function (x) { return String(x || '').trim().slice(0, 80); }).filter(Boolean).slice(0, 30); if (!its.length) its = [t]; s = { tipo: 'compras', titulo: t, itens: its }; }
    else if (tipo === 'tarefa' || tipo === 'lembrete') s = { tipo: 'tarefa', titulo: t, data: data, prio: PRIO[a.prioridade] != null ? a.prioridade : 'media' };
    else if (tipo === 'compromisso') { if (!data) return { erro: 'falta a data do compromisso; pergunte ao usuário' }; s = { tipo: 'compromisso', titulo: t, data: data, hora: hora }; }
    else if (tipo === 'conta') { if (!data) return { erro: 'falta o vencimento; pergunte ao usuário' }; s = { tipo: 'conta', titulo: t.slice(0, 80), vence: data, valor: +a.valor > 0 ? Math.round(+a.valor * 100) / 100 : null }; }
    else return { erro: 'tipo inválido' };
    return { sugestao: s, resultado: { ok: true, aguardando_confirmacao_do_usuario: true, resumo: s } };
  }

  /* lista do que a resposta final pode citar: só o que veio das ferramentas nesta pergunta e nas respostas anteriores já validadas (memória) + hoje/amanhã + a sugestão */
  function permitido(resultados, hoje) {
    var txt = resultados.map(function (r) { return JSON.stringify(r); }).join('\n');
    txt = txt.replace(/(\d{4})-(\d{2})-(\d{2})/g, '$1-$2-$3 $3/$2 $3/$2/$1');
    txt = txt.replace(/"valor":"?(\d+(?:\.\d+)?)/g, function (m, v) { return m + ' ' + brl(+v); });   /* valor numérico da sugestão -> R$ */
    return C.permitidoDeTexto(txt, hoje);
  }
  /* resposta final: remove marcadores, confere fidelidade */
  function finalizar(texto, perm) {
    var t = C.lerSugestoes(C.limpar(texto), '').texto.replace(/\*\*([^*]+)\*\*/g, '$1').trim();
    return { texto: t, fiel: !!t && C.fiel(t, perm) };
  }
  /* memória: últimas ~10 trocas em texto (sem resultados de ferramenta) */
  function memoria(conversa) {
    return conversa.filter(function (m) { return (m.papel === 'user' || m.papel === 'assistant') && m.texto && !m.leituras; }).slice(-20)
      .map(function (m) { return { r: m.papel === 'user' ? 'user' : 'model', t: String(m.texto).slice(0, 2000) }; });
  }
  /* fallback determinístico com aviso claro */
  function reserva(pergunta, d, hoje, motivo) {
    var q = C.classificar(pergunta, hoje), r = q ? C.responder(q, d) : null;
    var pre = 'O Gemini ' + String(motivo || 'não respondeu agora').replace(/[.\s]+$/, '') + '. ';
    return r ? pre + 'Respondi direto com os dados do app:\n' + r.texto : pre + 'Por enquanto consigo responder: o que vence essa semana, contas atrasadas, minhas tarefas, agenda de hoje/amanhã.';
  }
  var G = { executar: executar, sugestao: sugestao, permitido: permitido, finalizar: finalizar, memoria: memoria, reserva: reserva };
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  if (raiz) { raiz.PS = raiz.PS || {}; raiz.PS.gemini = G; }
})(typeof window !== 'undefined' ? window : null);
