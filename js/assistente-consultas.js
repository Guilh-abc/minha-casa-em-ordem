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
    if (/proxim/.test(p) && /evento|compromisso|agenda|marcad|consulta|reuni/.test(p)) return { tipo: 'proximo', ini: hoje, rotulo: 'próximo compromisso' };
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
    if (q.tipo === 'proximo') {
      itens = (d.compromissos || []).filter(real).filter(function (c) { return c.data && c.data >= q.ini; })
        .sort(function (a, b) { return (a.data + (a.hora || '')) < (b.data + (b.hora || '')) ? -1 : 1; }).slice(0, 1);
      texto = itens.length ? 'Próximo compromisso: ' + itens[0].titulo + ', ' + curta(itens[0].data) + (itens[0].hora ? ' às ' + itens[0].hora : '') + (itens[0].local ? ' (' + itens[0].local + ')' : '') + '.' : 'Não encontrei compromisso a partir de hoje na agenda.';
    } else if (q.tipo === 'agenda') {
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

  /* respostas que o app dá sozinho, sem passar pelo modelo */
  function soLocal(q) { return !!q && q.tipo === 'proximo'; }
  /* o usuário pediu para CRIAR algo? só então o bloco <<SUGESTAO>> é aceito */
  function pedeCriar(t) { return /^\s*(por favor\s+)?agenda\b/.test(sem(t)) || /\b(cri[ae]r?|adicion\w*|acrescent\w*|agend(?:e|ar|em|ei)|marc[ae]r?|marqu\w*|anot\w*|lembr[ae]r?|coloqu\w*|coloc[ae]r?|salv[ae]r?|inclu\w*|registr\w*|cadastr\w*|nova|novo)\b/.test(sem(t)); }
  var SEM_RESPOSTA = 'Não entendi a pergunta. Tente, por exemplo: qual o próximo evento, o que vence essa semana ou quais tarefas tenho.';
  /* tira blocos <<SUGESTAO>> não pedidos; se sobrar só lixo, devolve '' */
  function textoFinal(bruto, pergunta) {
    var t = String(bruto || '');
    if (!pedeCriar(pergunta)) t = t.replace(/<<\s*SUGEST[AÃ]O[\s\S]*?>>/gi, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    var semBloco = t.replace(/<<[\s\S]*?>>/g, '');
    if (!/SUGEST/i.test(t) && (semBloco.match(/[a-zA-Zà-úÀ-Ú]/g) || []).length < 8) return '';
    return t;
  }
  /* ---------- <<SUGESTAO>> tolerante: aceita JSON quebrado, aspas simples, chave fora das chaves, bloco sem fechar ---------- */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function dataSug(v, hoje) {
    v = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var m = v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/); if (!m) return '';
    var d = +m[1], me = +m[2], a = m[3] ? +m[3] : +String(hoje || '').slice(0, 4); if (a < 100) a += 2000;
    var dt = new Date(a, me - 1, d); if (dt.getMonth() !== me - 1 || dt.getDate() !== d) return '';
    var iso = a + '-' + p2(me) + '-' + p2(d);
    if (!m[3] && hoje && iso < hoje) iso = (a + 1) + iso.slice(4);
    return iso;
  }
  function valorSug(v) {
    if (typeof v === 'number') return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
    var t = String(v || '').replace(/R\$|\s/g, ''); if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(t); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  var CHAVE = /["']?(tipo|t[ií]tulo|data|hora|vence|valor|local)["']?\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^,}\s>]+))/gi;
  function camposBloco(b) {
    var o = {}, i = b.indexOf('{'), j = b.lastIndexOf('}');
    if (i >= 0 && j > i) { try { o = JSON.parse(b.slice(i, j + 1)); } catch (e) { try { o = JSON.parse(b.slice(i, j + 1).replace(/'/g, '"')); } catch (e2) { o = {}; } } }
    if (!o || typeof o !== 'object') o = {};
    var m; CHAVE.lastIndex = 0;
    while ((m = CHAVE.exec(b))) { var k = sem(m[1]); if (o[k] == null || o[k] === '') o[k] = m[2] != null ? m[2] : (m[3] != null ? m[3] : m[4]); }
    return o;
  }
  function validarSug(o, hoje) {
    var t = String(o.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 120), tipo = sem(o.tipo);
    if (!t) return null;
    var hr = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(o.hora || '')) ? o.hora : '';
    if (tipo === 'tarefa') return { tipo: 'tarefa', titulo: t, data: dataSug(o.data || o.vence, hoje) };
    if (tipo === 'conta') { var v = dataSug(o.vence || o.data, hoje); return v ? { tipo: 'conta', titulo: t.slice(0, 80), vence: v, valor: valorSug(o.valor) } : null; }
    if (tipo === 'compromisso' || tipo === 'agenda' || tipo === 'evento') { var d = dataSug(o.data, hoje); return d ? { tipo: 'compromisso', titulo: t, data: d, hora: hr } : null; }
    return null;
  }
  function lerSugestoes(txt, hoje) {
    var sugs = [], re = /<<\s*SUGEST[AÃ]O\b([\s\S]*?)(?:>>|$)/gi;
    var limpo = String(txt || '').replace(re, function (x, corpo) { var s1 = validarSug(camposBloco(corpo), hoje); if (s1) sugs.push(s1); return ' '; });
    limpo = limpo.replace(/<<|>>/g, ' ').replace(/\bSUGEST[AÃ]O\b/gi, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    limpo = limpo.replace(/[\s:]+$/, '');
    return { texto: limpo, sugestoes: sugs.slice(0, 5) };
  }
  /* o título precisa vir do que o usuário escreveu: nada de itens inventados */
  var VAZIAS = /\b(uma?|o|a|os|as|nov[ao]s?|pra|para|mim|me|por|favor|ai|aqui|ajudante|agora|tarefas?|compromissos?|eventos?|contas?|agenda|na|no|de|do|da)\b/g;
  function sugestaoFiel(sg, pergunta) {
    var p = sem(pergunta), ws = sem(sg && sg.titulo).replace(VAZIAS, ' ').split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3 && !/^\d+$/.test(w) && w !== 'ate'; });
    if (!ws.length) return false;
    var achou = ws.filter(function (w) { return p.indexOf(w.slice(0, Math.min(5, w.length))) >= 0; }).length;
    return achou * 2 >= ws.length;
  }
  function pedidoVazio(pergunta) {
    var p = sem(pergunta);
    if (!pedeCriar(p)) return '';
    var tipo = /\btarefa/.test(p) ? 'tarefa' : /\b(compromisso|evento)/.test(p) ? 'compromisso' : /\bconta\b/.test(p) ? 'conta' : '';
    if (!tipo) return '';
    var resto = p.replace(/\b(cri[ae]r?|adicion\w*|acrescent\w*|agend[ae]r?|marc[ae]r?|anot[ae]r?|coloc[ae]r?|inclu\w*|registr\w*|cadastr\w*|faz(er)?|fa[cç]a|quero|preciso|pode|voce)\b/g, ' ').replace(VAZIAS, ' ').replace(/[^a-z0-9]+/g, '');
    return resto ? '' : tipo;
  }
  var C = { lerSugestoes: lerSugestoes, sugestaoFiel: sugestaoFiel, pedidoVazio: pedidoVazio, dataSug: dataSug, valorSug: valorSug, soLocal: soLocal, pedeCriar: pedeCriar, SEM_RESPOSTA: SEM_RESPOSTA, textoFinal: textoFinal, permitidoResposta: permitidoResposta, limpar: limpar, classificar: classificar, responder: responder, fiel: fiel, permitidoDeTexto: permitidoDeTexto, somaDias: somaDias, fimSemana: fimSemana };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  if (raiz) { raiz.PS = raiz.PS || {}; raiz.PS.consultas = C; }
})(typeof window !== 'undefined' ? window : null);
