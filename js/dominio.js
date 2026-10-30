/* Regras de negócio puras: contas a vencer, compromissos, tarefas do dia, frase do dia. */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u;
  var PESO = { alta: 0, media: 1, baixa: 2 };
  var ROTULO_PRIO = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

  /* ocorrências relevantes de uma conta: mensal => mês atual e próximo; avulsa => data */
  function ocorrenciasConta(c, hoje) {
    if (!c.mensal) return c.data ? [{ conta: c, data: c.data, chave: 'avulsa', paga: !!c.paga }] : [];
    var m0 = U.ym(hoje), out = [];
    [0, 1].forEach(function (i) {
      var m = U.somaMes(m0, i);
      out.push({ conta: c, data: U.dataNoMes(m, c.dia), chave: m, paga: !!(c.pagas && c.pagas[m]) });
    });
    return out;
  }
  /* ocorrência exibida na tela Contas a pagar: a do mês; se já resolvida e já passou, a do próximo mês */
  function ocorrenciaVisivel(lista, hoje) {
    var a = lista[0], b = lista[1];
    if (!b) return a;
    var resolvida = a.paga != null ? a.paga : a.feito;
    return (resolvida && a.data < hoje) ? b : a;
  }
  function estadoVenc(data, hoje, resolvido) {
    if (resolvido) return 'ok';
    var n = U.difDias(data, hoje);
    return n < 0 ? 'atrasado' : (n <= 3 ? 'aviso' : 'normal');
  }

  /* contas que vencem em até N dias (inclui atrasados do mês atual, não resolvidos) */
  function aVencer(s, hoje, dias) {
    var lim = U.somaDias(hoje, dias), out = [];
    s.contas.forEach(function (c) {
      ocorrenciasConta(c, hoje).forEach(function (o) {
        if (o.paga) return;
        if (o.data <= lim && (o.data >= hoje || c.mensal && U.ym(o.data) === U.ym(hoje) || !c.mensal)) {
          out.push({ tipo: 'conta', titulo: c.titulo, icone: c.icone, data: o.data, valor: c.valor, ref: o, estado: estadoVenc(o.data, hoje, false) });
        }
      });
    });
    out.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    return out;
  }

  function chaveHora(c) { return c.data + 'T' + (c.hora || '00:00'); }
  function ordenarCompromissos(l) { return l.slice().sort(function (a, b) { var x = chaveHora(a), y = chaveHora(b); return x < y ? -1 : x > y ? 1 : 0; }); }
  /* próximos compromissos a partir de agora (tolera 30min de atraso) */
  function proximosCompromissos(s, ag, dias) {
    var lim = U.somaDias(ag.iso, dias);
    return ordenarCompromissos(s.compromissos.filter(function (c) {
      if (c.data > lim) return false;
      if (c.data > ag.iso) return true;
      if (c.data < ag.iso) return false;
      if (!c.hora) return true;
      var min = +c.hora.slice(0, 2) * 60 + +c.hora.slice(3), agora = ag.h * 60 + ag.mi;
      return min >= agora - 30;
    }));
  }

  function ordenarTarefas(l) {
    return l.slice().sort(function (a, b) {
      if (a.feita !== b.feita) return a.feita ? 1 : -1;
      if (PESO[a.prio] !== PESO[b.prio]) return PESO[a.prio] - PESO[b.prio];
      return (a.vence || '9999') < (b.vence || '9999') ? -1 : (a.vence || '9999') > (b.vence || '9999') ? 1 : 0;
    });
  }
  /* ---------- quadro de tarefas por prazo ----------
     Regra simples (docs/TAREFAS.md): semana corrente de segunda a domingo; Esta semana = de amanhã até domingo (no domingo fica vazia).
     Mover: Hoje = hoje; Esta semana = esse domingo; Depois = hoje + 14 dias; Sem data = limpa; Atrasadas não é destino. */
  var COLUNAS = [['atrasadas', 'Atrasadas'], ['hoje', 'Hoje'], ['semana', 'Esta semana'], ['depois', 'Depois'], ['semdata', 'Sem data']];
  function fimDaSemana(hoje) { var d = U.dowIso(hoje); return U.somaDias(hoje, d === 0 ? 0 : 7 - d); }   /* semana de segunda a domingo */
  function colunaPrazo(t, hoje) {
    if (!t.vence) return 'semdata';
    if (t.vence < hoje) return 'atrasadas';
    if (t.vence === hoje) return 'hoje';
    return t.vence <= fimDaSemana(hoje) ? 'semana' : 'depois';
  }
  function quadroPrazo(tarefas, hoje, lista) {
    var cols = COLUNAS.map(function (c) { return { id: c[0], rotulo: c[1], itens: [] }; }), idx = {};
    cols.forEach(function (c) { idx[c.id] = c; });
    ordenarTarefas(tarefas.filter(function (t) { return !t.feita && (!lista || t.lista === lista); })).forEach(function (t) { idx[colunaPrazo(t, hoje)].itens.push(t); });
    return cols;
  }
  function dataDaColuna(col, hoje) {
    return col === 'hoje' ? hoje : col === 'semana' ? fimDaSemana(hoje) : col === 'depois' ? U.somaDias(hoje, 14) : col === 'semdata' ? '' : null;
  }
  function moverTarefa(t, col, hoje) { var d = dataDaColuna(col, hoje); if (d === null) return false; t.vence = d; return true; }

  /* tarefas do dia: vencem hoje/atrasadas + as de prioridade alta sem data */
  function tarefasDoDia(s, hoje) {
    return ordenarTarefas(s.tarefas.filter(function (t) { return !t.feita && ((t.vence && t.vence <= hoje) || (!t.vence && t.prio === 'alta')); }));
  }
  /* a fazer hoje = tarefas do dia (os lembretes saíram do app) */
  function itensDoDia(s, hoje) {
    return tarefasDoDia(s, hoje).map(function (t) { return { tipo: 'tarefa', t: t }; });
  }
  function fraseDoDia(s, hoje) {
    var l = s.foco; if (!l.length) return '';
    var d = new Date(hoje + 'T00:00:00Z').getTime() / 86400000;
    return l[Math.floor(d) % l.length].texto;
  }
  function listasComTarefas(s) {
    var nomes = s.listas.slice();
    s.tarefas.forEach(function (t) { if (nomes.indexOf(t.lista) < 0) nomes.push(t.lista); });
    return nomes;
  }
  function saudacao(h) { return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }

  PS.dom = { itensDoDia: itensDoDia, ocorrenciaVisivel: ocorrenciaVisivel, ocorrenciasConta: ocorrenciasConta, aVencer: aVencer, ordenarCompromissos: ordenarCompromissos, proximosCompromissos: proximosCompromissos, ordenarTarefas: ordenarTarefas, tarefasDoDia: tarefasDoDia, fraseDoDia: fraseDoDia, listasComTarefas: listasComTarefas, saudacao: saudacao, ROTULO_PRIO: ROTULO_PRIO, COLUNAS_PRAZO: COLUNAS, fimDaSemana: fimDaSemana, colunaPrazo: colunaPrazo, quadroPrazo: quadroPrazo, dataDaColuna: dataDaColuna, moverTarefa: moverTarefa };
})(window);
