/* Assistente (Liquid AI LFM3-1.7B via Worker minha-casa-assistente): perguntas sobre contas, tarefas e agenda.
   Envia um RESUMO dos dados (sem faturas detalhadas, sem cartões). Nada é gravado sem confirmação. byGui */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, h = U.h, I = PS.icone, S = PS.store;
  var URL_API = 'https://minha-casa-assistente.guilhermeromionetto.workers.dev/chat';
  var conversa = [];   /* { papel: 'user'|'assistant', texto, sugestao } só na memória da aba */
  var enviando = false;

  function brl(v) { return v == null ? 'sem valor' : 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
  /* resumo compacto, até ~12 mil caracteres */
  function contexto() {
    var s = S.get(), hoje = U.hoje(), fim = U.somaDias(hoje, 45), l = [];
    try {
      var ls = PS.fin.listas(s, hoje), ab = ls.abertas.filter(function (x) { return x.data <= fim; }).slice(0, 40);
      l.push('CONTAS EM ABERTO (até 45 dias):');
      ab.forEach(function (x) { l.push('- ' + x.titulo + ': ' + brl(x.valor) + ', vence ' + x.data + (x.dias < 0 ? ' (ATRASADA)' : '') + (x.forma ? ', ' + x.forma : '')); });
      if (!ab.length) l.push('- nenhuma');
      var pg = ls.pagas.filter(function (x) { return (x.pagaEm || x.data) >= U.somaDias(hoje, -31); }).slice(0, 20);
      l.push('PAGAS NOS ÚLTIMOS 30 DIAS:');
      pg.forEach(function (x) { l.push('- ' + x.titulo + ': ' + brl(x.valor) + (x.pagaEm ? ', paga em ' + x.pagaEm : '')); });
      if (!pg.length) l.push('- nenhuma');
    } catch (e) { l.push('CONTAS: indisponível'); }
    var tf = (s.tarefas || []).filter(function (t) { return !t.feita; }).slice(0, 60);
    l.push('TAREFAS PENDENTES:');
    tf.forEach(function (t) { l.push('- ' + t.titulo + ' [' + t.lista + ', prioridade ' + t.prio + (t.vence ? ', até ' + t.vence : '') + ']'); });
    if (!tf.length) l.push('- nenhuma');
    var cp = (s.compromissos || []).filter(function (c) { return c.data >= hoje && c.data <= fim; }).sort(function (a, b) { return (a.data + a.hora) < (b.data + b.hora) ? -1 : 1; }).slice(0, 40);
    l.push('AGENDA (próximos 45 dias):');
    cp.forEach(function (c) { l.push('- ' + c.data + (c.hora ? ' ' + c.hora : '') + ': ' + c.titulo + (c.local ? ' (' + c.local + ')' : '')); });
    if (!cp.length) l.push('- nada marcado');
    var lb = (s.lembretes || []).filter(function (x) { return !x.feito; }).slice(0, 30);
    if (lb.length) { l.push('LEMBRETES MENSAIS:'); lb.forEach(function (x) { l.push('- ' + x.titulo + (x.dia ? ' (dia ' + x.dia + ')' : ' (sem data)')); }); }
    return l.join('\n').slice(0, 12000);
  }

  /* extrai <<SUGESTAO {...}>> e valida; devolve { texto, sugestao|null } */
  function separar(txt) {
    var m = /<<\s*SUGEST[AÃ]O\s*(\{[\s\S]*?\})\s*>>/i.exec(txt || ''), sug = null;
    if (m) {
      try {
        var o = JSON.parse(m[1]), t = String(o.titulo || '').slice(0, 120).trim();
        if (t && o.tipo === 'tarefa') sug = { tipo: 'tarefa', titulo: t, data: U.dataValida(o.data) ? o.data : '' };
        else if (t && o.tipo === 'conta' && U.dataValida(o.vence)) sug = { tipo: 'conta', titulo: t.slice(0, 80), vence: o.vence, valor: isFinite(Number(o.valor)) && Number(o.valor) > 0 ? Math.round(Number(o.valor) * 100) / 100 : null };
        else if (t && o.tipo === 'compromisso' && U.dataValida(o.data)) sug = { tipo: 'compromisso', titulo: t, data: o.data, hora: U.horaValida(o.hora) ? o.hora : '' };
      } catch (e) { sug = null; }
      txt = txt.replace(m[0], '').trim();
    }
    return { texto: txt, sugestao: sug };
  }
  function descSug(x) {
    if (x.tipo === 'tarefa') return 'Nova tarefa: ' + x.titulo + (x.data ? ', até ' + U.dataCurta(x.data) : '');
    if (x.tipo === 'conta') return 'Nova conta (avulsa): ' + x.titulo + ', ' + brl(x.valor) + ', vence ' + U.dataCurta(x.vence);
    return 'Novo compromisso: ' + x.titulo + ', ' + U.dataCurta(x.data) + (x.hora ? ' às ' + x.hora : '');
  }
  function gravar(x) {
    S.alterar(function (s) {
      var it;
      if (x.tipo === 'tarefa') { it = S.sanearItem('tarefas', null, { titulo: x.titulo, vence: x.data, lista: s.listas[0], prio: 'media' }); if (it) s.tarefas.push(it); }
      else if (x.tipo === 'conta') { it = S.sanearItem('contas', null, { titulo: x.titulo, mensal: false, data: x.vence, dia: +x.vence.slice(8, 10), valor: x.valor }); if (it) s.contas.push(it); }
      else { it = S.sanearItem('compromissos', null, { titulo: x.titulo, data: x.data, hora: x.hora, fonte: 'manual' }); if (it) s.compromissos.push(it); }
    });
  }

  function balao(m, i, desenhar) {
    var filhos = [h('p', { class: 'ass-autor' }, m.papel === 'user' ? 'Você' : 'Assistente'), h('div', { class: 'ass-texto' }, m.texto)];
    if (m.sugestao) {
      var sg = m.sugestao;
      filhos.push(h('div', { class: 'ass-sug', role: 'group', 'aria-label': 'Sugestão de lançamento' },
        h('p', null, I('alerta'), h('span', null, descSug(sg))),
        sg.feito ? h('p', { class: 'ass-ok' }, I('check'), h('span', null, sg.feito)) :
        h('div', { class: 'acoes' },
          h('button', { class: 'btn primario', type: 'button', 'data-fid': 'ass-confirmar-' + i, onclick: function () { gravar(sg); sg.feito = 'Gravado no app.'; desenhar(); } }, 'Confirmar e gravar'),
          h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-descartar-' + i, onclick: function () { sg.feito = 'Descartado. Nada foi gravado.'; desenhar(); } }, 'Descartar'))));
    }
    return h('li', { class: 'ass-msg ' + (m.papel === 'user' ? 'eu' : 'ia') }, filhos);
  }

  function render() {
    var raiz = h('div', { class: 'tela-ass' });
    var lista = h('ol', { class: 'ass-lista', 'aria-live': 'polite', 'aria-label': 'Conversa com o assistente' });
    var status = h('p', { class: 'ass-status', role: 'status' });
    var campo = h('textarea', { id: 'ass-pergunta', rows: '2', maxlength: '1000', placeholder: 'Ex.: O que vence essa semana?', 'data-fid': 'ass-pergunta' });
    var btn = h('button', { class: 'btn primario', type: 'submit', 'data-fid': 'ass-enviar' }, 'Perguntar');
    function desenhar() {
      U.limpar(lista);
      if (!conversa.length) lista.appendChild(h('li', { class: 'vazio' }, 'Pergunte sobre contas, vencimentos, tarefas ou agenda. O assistente lê um resumo dos dados deste aparelho e só grava algo se você confirmar.'));
      conversa.forEach(function (m, i) { lista.appendChild(balao(m, i, desenhar)); });
      btn.disabled = enviando; status.textContent = enviando ? 'Pensando…' : '';
      lista.scrollTop = lista.scrollHeight;
    }
    function enviar(texto) {
      texto = String(texto || '').trim(); if (!texto || enviando) return;
      conversa.push({ papel: 'user', texto: texto }); enviando = true; campo.value = ''; desenhar();
      var hist = conversa.slice(-10).map(function (m) { return { papel: m.papel, texto: m.texto.slice(0, 4000) }; });
      var hojeTxt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) + ' (' + U.hoje() + ')';
      fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagens: hist, contexto: contexto(), hoje: hojeTxt }) })
        .then(function (r) { return r.json().catch(function () { return { erro: 'Resposta inválida.' }; }); })
        .then(function (j) {
          if (j && j.resposta) { var p = separar(j.resposta); conversa.push({ papel: 'assistant', texto: p.texto || 'Pronto.', sugestao: p.sugestao }); }
          else conversa.push({ papel: 'assistant', texto: 'Não consegui responder: ' + ((j && j.erro) || 'erro desconhecido') });
        })
        .catch(function () { conversa.push({ papel: 'assistant', texto: 'Sem conexão com o assistente agora. Tente de novo quando estiver online.' }); })
        .then(function () { enviando = false; desenhar(); campo.focus(); });
    }
    var form = h('form', { class: 'ass-form', onsubmit: function (e) { e.preventDefault(); enviar(campo.value); } },
      h('label', { class: 'campo' }, h('span', null, 'Sua pergunta'), campo), h('div', { class: 'acoes' }, btn,
        h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-limpar', onclick: function () { conversa = []; desenhar(); } }, 'Limpar conversa')));
    campo.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(campo.value); } });
    var atalhos = h('div', { class: 'ass-atalhos', role: 'group', 'aria-label': 'Perguntas rápidas' },
      ['O que vence essa semana?', 'Tem conta atrasada?', 'Quais tarefas são prioridade alta?', 'O que tenho na agenda amanhã?'].map(function (q, i) {
        return h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-rapida-' + i, onclick: function () { enviar(q); } }, q);
      }));
    raiz.appendChild(h('section', { class: 'cartao' }, h('h2', null, I('estrela'), h('span', null, 'Assistente')), atalhos, lista, status, form,
      h('p', { class: 'ass-nota' }, 'Usa o modelo LFM3-1.7B da Liquid AI. Um resumo de contas, tarefas e agenda sai deste aparelho só quando você pergunta; faturas detalhadas e cartões não são enviados. Respostas podem errar: confira antes de pagar.')));
    desenhar();
    return raiz;
  }
  PS.views.assistente = { reativo: false, titulo: 'Assistente', render: render };
  PS.assistente = { contexto: contexto, separar: separar };
})(window);
