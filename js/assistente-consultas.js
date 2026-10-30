/* Ajudante sem inventar: as perguntas comuns são respondidas pelo PRÓPRIO app (datas em America/Sao_Paulo vindas de PS.u.hoje),
   e qualquer resposta do modelo é conferida contra os dados: horário, data, valor ou item fora da lista => descartada. PURO, testável em Node. byGui */
(function (raiz) {
  'use strict';
  var DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function pad(n) { n = +n; return (n < 10 ? '0' : '') + n; }
  function utc(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function somaDias(iso, n) { var t = new Date(utc(iso) + n * 864e5); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
  function ddmm(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); }
  function curta(iso) { return DIAS[new Date(utc(iso)).getUTCDay()] + ', ' + ddmm(iso); }
  function brl(v) { return v == null ? 'sem valor' : 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  /* domingo da semana corrente (semana de segunda a domingo); no domingo é o próprio dia */
  function fimSemana(iso) { var d = new Date(utc(iso)).getUTCDay(); return somaDias(iso, d === 0 ? 0 : 7 - d); }
  function rotSemana(hoje) { var f = fimSemana(hoje); return f === hoje ? 'nesta semana (hoje, ' + ddmm(hoje) + ')' : 'nesta semana (' + ddmm(hoje) + ' a ' + ddmm(f) + ')'; }
  function sem(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

  function classificar(pergunta, hoje) {
    var p = sem(pergunta), am = somaDias(hoje, 1);
    if (/atrasad|vencid|em atraso/.test(p)) return { tipo: 'atrasadas', ini: '', fim: somaDias(hoje, -1), rotulo: 'atrasadas' };
    if (/prioridade/.test(p) && /alta|urgent/.test(p)) return { tipo: 'prioridade', rotulo: 'prioridade alta' };
    if (/venc|pagar|contas?\b/.test(p) && /semana/.test(p)) return { tipo: 'vencimentos', ini: hoje, fim: fimSemana(hoje), rotulo: rotSemana(hoje) };
    if (/agenda|compromisso|marcado|tenho|reuni|consulta/.test(p)) {
      if (/depois de amanha/.test(p)) { var d2 = somaDias(hoje, 2); return { tipo: 'agenda', ini: d2, fim: d2, rotulo: 'depois de amanhã (' + ddmm(d2) + ')' }; }
      if (/amanha/.test(p)) return { tipo: 'agenda', ini: am, fim: am, rotulo: 'amanhã (' + ddmm(am) + ')' };
      if (/hoje/.test(p)) return { tipo: 'agenda', ini: hoje, fim: hoje, rotulo: 'hoje (' + ddmm(hoje) + ')' };
      if (/semana/.test(p)) return { tipo: 'agenda', ini: hoje, fim: fimSemana(hoje), rotulo: rotSemana(hoje) };
    }
    if (/tarefa|afazer|pendente/.test(p)) return { tipo: 'tarefas', rotulo: 'pendentes' };
    return null;
  }

  function vazio() { return { datas: {}, horas: {}, valores: {}, maxLinhas: null }; }
  function addValor(p, v) { if (v != null && isFinite(v)) p.valores[Math.round(v * 100)] = 1; }
  function responder(q, d) {
    d = d || {}; var itens = [], linhas, texto, p = vazio();
    function real(x) { return x && !x.exemplo; }   /* dados de EXEMPLO (dados.json) nunca entram nas respostas */
    if (q.tipo === 'agenda') {
      itens = (d.compromissos || []).filter(real).filter(function (c) { return c.data >= q.ini && c.data <= q.fim; })
        .sort(function (a, b) { return (a.data + (a.hora || '')) < (b.data + (b.hora || '')) ? -1 : 1; });
      linhas = itens.map(function (c) { return '- ' + curta(c.data) + (c.hora ? ' às ' + c.hora : '') + ': ' + c.titulo + (c.local ? ' (' + c.local + ')' : ''); });
      texto = itens.length ? 'Na agenda ' + q.rotulo + ':\n' + linhas.join('\n') : 'Não encontrei nada na agenda para ' + q.rotulo + '.';
    } else if (q.tipo === 'vencimentos' || q.tipo === 'atrasadas') {
      itens = (d.abertas || []).filter(real).filter(function (x) { return q.tipo === 'atrasadas' ? x.dias < 0 : x.data >= q.ini && x.data <= q.fim; })
        .sort(function (a, b) { return a.data < b.data ? -1 : 1; });
      linhas = itens.map(function (x) { return '- ' + x.titulo + ': ' + brl(x.valor) + ', ' + (x.dias < 0 ? 'venceu ' : 'vence ') + curta(x.data); });
      texto = itens.length ? (q.tipo === 'atrasadas' ? 'Contas atrasadas:\n' : 'Vence ' + q.rotulo + ':\n') + linhas.join('\n')
        : (q.tipo === 'atrasadas' ? 'Não encontrei conta atrasada no app.' : 'Não encontrei conta vencendo ' + q.rotulo + '.');
    } else if (q.tipo === 'prioridade') {
      itens = (d.tarefas || []).filter(real).filter(function (t) { return !t.feita && t.prio === 'alta'; });
      linhas = itens.map(function (t) { return '- ' + t.titulo + (t.vence ? ' (até ' + curta(t.vence) + ')' : ''); });
      texto = itens.length ? 'Tarefas de prioridade alta:\n' + linhas.join('\n') : 'Não encontrei tarefa pendente de prioridade alta.';
    } else if (q.tipo === 'tarefas') {
      itens = (d.tarefas || []).filter(real).filter(function (t) { return !t.feita; });
      linhas = itens.map(function (t) { return '- ' + t.titulo + (t.lista ? ' [' + t.lista + ']' : '') + (t.vence ? ' (até ' + curta(t.vence) + ')' : ''); });
      texto = itens.length ? 'Tarefas pendentes (' + itens.length + '):\n' + linhas.join('\n') : 'Não encontrei tarefa pendente.';
    }
    itens.forEach(function (x) { if (x.data) p.datas[ddmm(x.data)] = 1; if (x.vence) p.datas[ddmm(x.vence)] = 1; if (x.hora) p.horas[x.hora] = 1; addValor(p, x.valor); });
    if (q.ini) p.datas[ddmm(q.ini)] = 1; if (q.fim) p.datas[ddmm(q.fim)] = 1;
    p.maxLinhas = Math.max(itens.length, 0);
    return { itens: itens, texto: texto, permitido: p };
  }

  function permitidoDeTexto(ctx, hoje) {
    var p = vazio(), s = String(ctx || ''), m, re;
    re = /(\d{4})-(\d{2})-(\d{2})/g; while ((m = re.exec(s))) p.datas[m[3] + '/' + m[2]] = 1;
    re = /\b(\d{1,2})\/(\d{1,2})\b/g; while ((m = re.exec(s))) p.datas[pad(m[1]) + '/' + pad(m[2])] = 1;
    re = /\b(\d{1,2}):(\d{2})\b/g; while ((m = re.exec(s))) p.horas[pad(m[1]) + ':' + m[2]] = 1;
    re = /R\$\s*([\d.]+,\d{2})/g; while ((m = re.exec(s))) addValor(p, Number(m[1].replace(/\./g, '').replace(',', '.')));
    if (hoje) { p.datas[ddmm(hoje)] = 1; p.datas[ddmm(somaDias(hoje, 1))] = 1; }
    return p;
  }

  /* a pergunta do usuário só libera datas/horários/valores quando ele pede para criar/anotar algo */
  function permitidoResposta(ctx, pergunta, hoje) {
    var criar = /\b(anot|cri[ae]|marc|marq|agend|adicion|lembr|cadastr|grav|coloc|inclu|registr)/i.test(sem(pergunta));
    return permitidoDeTexto(String(ctx || '') + (criar ? '\n' + normHoras(pergunta) : ''), hoje);
  }
  function normHoras(s) { return String(s || '').replace(/\b(\d{1,2})\s*h\s*(\d{2})?\b/gi, function (a, h1, m1) { return pad(h1) + ':' + (m1 || '00'); }); }
  /* tira <think>, reticências em série, linhas repetidas e frases em laço (o modelo pequeno às vezes repete sem parar) */
  function limpar(s) {
    s = String(s || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '');
    s = s.replace(/(\s*(\.{2,}|…))+/g, '…').replace(/(\S)…\s*$/, '$1.').replace(/^\s*…\s*$/gm, '');
    var vistas = {}, out = [];
    s.split('\n').forEach(function (l) { var k = l.trim().toLowerCase(); if (k && vistas[k]) return; if (k) vistas[k] = 1; out.push(l.replace(/\s+$/, '')); });
    s = out.join('\n');
    var ant;
    do { ant = s; s = s.replace(/(\b[^.!?\n]{3,}?[.!?])(\s+\1)+/g, '$1'); } while (s !== ant);
    return s.replace(/\n{3,}/g, '\n\n').trim();
  }

  /* true se tudo que a resposta afirma (horários, datas, valores, quantidade de itens) está na lista permitida */
  function fiel(texto, p) {
    var s = String(texto || ''), m, re;
    re = /\b(\d{1,2})\s*(?::|h)\s*(\d{2})?\b/gi; while ((m = re.exec(s))) if (!p.horas[pad(m[1]) + ':' + (m[2] || '00')]) return false;
    re = /\b(\d{4})-(\d{2})-(\d{2})\b/g; while ((m = re.exec(s))) if (!p.datas[m[3] + '/' + m[2]]) return false;
    re = /\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g; while ((m = re.exec(s))) if (!p.datas[pad(m[1]) + '/' + pad(m[2])]) return false;
    re = /R\$\s*([\d.]+(?:,\d{1,2})?)/g; while ((m = re.exec(s))) { var v = Number(m[1].replace(/\./g, '').replace(',', '.')); if (!p.valores[Math.round(v * 100)]) return false; }
    if (p.maxLinhas != null) { var n = s.split('\n').filter(function (l) { return /^\s*([-•*]|\d+[.)])\s+/.test(l); }).length; if (n > p.maxLinhas) return false; }
    return true;
  }

  var C = { permitidoResposta: permitidoResposta, limpar: limpar, classificar: classificar, responder: responder, fiel: fiel, permitidoDeTexto: permitidoDeTexto, somaDias: somaDias, fimSemana: fimSemana };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  if (raiz) { raiz.PS = raiz.PS || {}; raiz.PS.consultas = C; }
})(typeof window !== 'undefined' ? window : null);
