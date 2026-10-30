/* Assistente (Liquid AI LFM3-1.7B via Worker minha-casa-assistente): perguntas sobre contas, tarefas e agenda.
   Envia um RESUMO dos dados (sem faturas detalhadas, sem cartões). Nada é gravado sem confirmação. byGui */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, h = U.h, I = PS.icone, S = PS.store, C = PS.consultas;
  var URL_API = (g.MCO_ASSISTENTE_URL || 'https://minha-casa-assistente.guilhermeromionetto.workers.dev') + '/chat';
  var conversa = [];   /* { papel: 'user'|'assistant', texto, sugestao } só na memória da aba */
  var enviando = false;

  function brl(v) { return v == null ? 'sem valor' : 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
  /* resumo compacto, até ~12 mil caracteres */
  function contexto() {
    var s = S.get(), hoje = U.hoje(), fim = U.somaDias(hoje, 45), l = [], exIds = {};
    (s.contas || []).forEach(function (c) { if (c.exemplo) exIds[c.id] = 1; });
    function real(x) { return x && !x.exemplo && !exIds[x.id]; }   /* dados de EXEMPLO não vão para o modelo */
    try {
      var ls = PS.fin.listas(s, hoje), ab = ls.abertas.filter(real).filter(function (x) { return x.data <= fim; }).slice(0, 40);
      l.push('CONTAS EM ABERTO (até 45 dias):');
      ab.forEach(function (x) { l.push('- ' + x.titulo + ': ' + brl(x.valor) + ', vence ' + x.data + (x.dias < 0 ? ' (ATRASADA)' : '') + (x.forma ? ', ' + x.forma : '')); });
      if (!ab.length) l.push('- nenhuma');
      var pg = ls.pagas.filter(real).filter(function (x) { return (x.pagaEm || x.data) >= U.somaDias(hoje, -31); }).slice(0, 20);
      l.push('PAGAS NOS ÚLTIMOS 30 DIAS:');
      pg.forEach(function (x) { l.push('- ' + x.titulo + ': ' + brl(x.valor) + (x.pagaEm ? ', paga em ' + x.pagaEm : '')); });
      if (!pg.length) l.push('- nenhuma');
    } catch (e) { l.push('CONTAS: indisponível'); }
    var tf = (s.tarefas || []).filter(real).filter(function (t) { return !t.feita; }).slice(0, 60);
    l.push('TAREFAS PENDENTES:');
    tf.forEach(function (t) { l.push('- ' + t.titulo + ' [' + t.lista + ', prioridade ' + t.prio + (t.vence ? ', até ' + t.vence : '') + ']'); });
    if (!tf.length) l.push('- nenhuma');
    var cp = (s.compromissos || []).filter(real).filter(function (c) { return c.data >= hoje && c.data <= fim; }).sort(function (a, b) { return (a.data + a.hora) < (b.data + b.hora) ? -1 : 1; }).slice(0, 40);
    l.push('AGENDA (próximos 45 dias):');
    cp.forEach(function (c) { l.push('- ' + c.data + (c.hora ? ' ' + c.hora : '') + ': ' + c.titulo + (c.local ? ' (' + c.local + ')' : '')); });
    if (!cp.length) l.push('- nada marcado');
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
    txt = String(txt || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,!?]|$)/g, '$1$2').replace(/^\s*-{3,}\s*$/gm, '').trim();
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
    var filhos = [h('p', { class: 'ass-autor' }, m.papel === 'user' ? 'Você' : 'Ajudante'), h('div', { class: 'ass-texto' }, m.texto)];
    if (m.sugestao) {
      var sg = m.sugestao;
      filhos.push(h('div', { class: 'ass-sug', role: 'group', 'aria-label': 'Sugestão de lançamento' },
        h('p', null, I('alerta'), h('span', null, descSug(sg))),
        sg.feito ? h('p', { class: 'ass-ok' }, I('check'), h('span', null, sg.feito)) :
        h('div', { class: 'acoes' },
          h('button', { class: 'btn primario', type: 'button', 'data-fid': 'ass-confirmar-' + i, onclick: function () { gravar(sg); sg.feito = 'Gravado no app.'; desenhar(); } }, 'Confirmar e gravar'),
          h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-descartar-' + i, onclick: function () { sg.feito = 'Descartado. Nada foi gravado.'; desenhar(); } }, 'Descartar'))));
    }
    if (m.foto) {
      var fc = m.foto;
      filhos.push(h('div', { class: 'ass-sug', role: 'group', 'aria-label': 'Dados lidos da foto' },
        fc.feito ? h('p', { class: 'ass-ok' }, I('check'), h('span', null, fc.feito)) :
        h('div', { class: 'acoes' },
          h('button', { class: 'btn primario', type: 'button', 'data-fid': 'ass-foto-salvar-' + i, onclick: function () { PS.foto.salvar(fc.c, function (msg) { fc.feito = msg + '.'; desenhar(); }); } }, 'Confirmar e salvar'),
          h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-foto-editar-' + i, onclick: function () { PS.foto.revisar(fc.c, '', function (msg) { fc.feito = msg + '.'; desenhar(); }); } }, 'Editar'),
          h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-foto-descartar-' + i, onclick: function () { fc.feito = 'Descartado. Nada foi salvo.'; desenhar(); } }, 'Descartar'))));
    }
    return h('li', { class: 'ass-msg ' + (m.papel === 'user' ? 'eu' : 'ia') }, filhos);
  }

  function render() {
    var raiz = h('div', { class: 'tela-ass' });
    var lista = h('ol', { class: 'ass-lista', 'aria-live': 'polite', 'aria-label': 'Conversa com o ajudante' });
    var status = h('p', { class: 'ass-status', role: 'status' });
    var campo = h('textarea', { id: 'ass-pergunta', rows: '2', maxlength: '1000', placeholder: 'Ex.: O que vence essa semana?', 'data-fid': 'ass-pergunta' });
    var btn = h('button', { class: 'btn primario', type: 'submit', 'data-fid': 'ass-enviar' }, 'Perguntar');
    function desenhar() {
      U.limpar(lista);
      if (!conversa.length) lista.appendChild(h('li', { class: 'vazio' }, 'Nenhuma pergunta ainda. O ajudante lê um resumo dos dados deste aparelho e só grava algo se você confirmar.'));
      conversa.forEach(function (m, i) { lista.appendChild(balao(m, i, desenhar)); });
      btn.disabled = enviando; status.textContent = enviando ? 'Pensando…' : '';
      lista.scrollTop = lista.scrollHeight;
    }
    function dadosConsulta() {
      var st = S.get(), ab = [];
      try { ab = PS.fin.listas(st, U.hoje()).abertas; } catch (e) { ab = []; }
      var ex = {}; (st.contas || []).forEach(function (c) { if (c.exemplo) ex[c.id] = 1; });
      return { abertas: ab.filter(function (x) { return !ex[x.id]; }), compromissos: st.compromissos || [], tarefas: st.tarefas || [] };
    }
    function hojeTexto() { var hj = U.hoje(), am = U.somaDias(hj, 1); return U.DIAS[U.dowIso(hj)] + ', ' + hj.slice(8, 10) + '/' + hj.slice(5, 7) + '/' + hj.slice(0, 4) + ' (' + hj + '); amanhã é ' + U.DIAS[U.dowIso(am)] + ', ' + am.slice(8, 10) + '/' + am.slice(5, 7) + ' (' + am + ')'; }
    function responderLocal(txt) { conversa.push({ papel: 'assistant', texto: txt, local: true }); }
    /* rapida=true: pergunta pronta, respondida 100% pelo app, sem modelo */
    function enviar(texto, rapida) {
      texto = String(texto || '').trim(); if (!texto || enviando) return;
      conversa.push({ papel: 'user', texto: texto }); campo.value = '';
      var hj = U.hoje(), q = C.classificar(texto, hj), fechada = q ? C.responder(q, dadosConsulta()) : null;
      if (fechada && (rapida || C.soLocal(q) || !fechada.itens.length)) { responderLocal(fechada.texto); desenhar(); return; }
      enviando = true; desenhar();
      var ctx = fechada ? 'LISTA FECHADA (estes são TODOS os itens; reformule só esta lista, não acrescente nada):\n' + fechada.texto : contexto();
      var permitido = fechada ? fechada.permitido : C.permitidoResposta(ctx, texto, hj);
      var hist = fechada ? [{ papel: 'user', texto: texto }] : conversa.filter(function (m) { return !m.local; }).slice(-10).map(function (m) { return { papel: m.papel, texto: m.texto.slice(0, 4000) }; });
      fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagens: hist, contexto: ctx, hoje: hojeTexto() }) })
        .then(function (r) { return r.json().catch(function () { return { erro: 'Resposta inválida.' }; }); })
        .then(function (j) {
          if (j && j.resposta) {
            var p = separar(C.textoFinal(C.limpar(j.resposta), texto));
            if (fechada) { if (C.fiel(p.texto, permitido)) conversa.push({ papel: 'assistant', texto: p.texto || fechada.texto }); else responderLocal(fechada.texto); }
            else if (C.fiel(p.texto, permitido)) conversa.push({ papel: 'assistant', texto: p.texto || (p.sugestao ? 'Posso adicionar isto:' : C.SEM_RESPOSTA), sugestao: p.sugestao });
            else responderLocal('Não encontrei isso nos dados do app. Pergunte, por exemplo, o que vence essa semana ou o que tem na agenda amanhã.');
          }
          else conversa.push({ papel: 'assistant', texto: 'Não consegui responder: ' + ((j && j.erro) || 'erro desconhecido') });
        })
        .catch(function () { if (fechada) responderLocal(fechada.texto); else conversa.push({ papel: 'assistant', texto: 'Sem conexão com o ajudante agora. Tente de novo quando estiver online.' }); })
        .then(function () { enviando = false; desenhar(); campo.focus(); });
    }
    /* entrada por voz (Web Speech API, pt-BR): o texto aparece no campo e é enviado quando a escuta termina */
    var Reconhecer = g.SpeechRecognition || g.webkitSpeechRecognition, rec = null, ouvindo = false;
    var mic = Reconhecer ? h('button', { class: 'btn btn-mic', type: 'button', 'data-fid': 'ass-voz', 'aria-label': 'Falar a pergunta', 'aria-pressed': 'false', onclick: function () { if (ouvindo) { if (rec) rec.stop(); } else ouvir(); } }, I('microfone'), h('span', { class: 'mic-rot' }, 'Falar')) : null;
    function marcarOuvindo(v) {
      ouvindo = v; if (!mic) return;
      mic.setAttribute('aria-pressed', v ? 'true' : 'false'); mic.setAttribute('aria-label', v ? 'Parar de ouvir' : 'Falar a pergunta');
      mic.classList.toggle('ouvindo', v); mic.querySelector('.mic-rot').textContent = v ? 'Ouvindo…' : 'Falar';
      status.textContent = v ? 'Ouvindo… fale sua pergunta.' : '';
    }
    function ouvir() {
      if (enviando) return;
      try { rec = new Reconhecer(); } catch (e) { return; }
      rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      rec.onresult = function (ev) { var t = ''; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; campo.value = t; };
      rec.onerror = function (ev) { marcarOuvindo(false); status.textContent = ev && (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') ? 'Microfone bloqueado. Libere o acesso nas permissões do navegador.' : 'Não consegui ouvir. Tente de novo.'; rec = null; };
      rec.onend = function () { var era = ouvindo; marcarOuvindo(false); rec = null; if (era && campo.value.trim()) enviar(campo.value); };
      marcarOuvindo(true);
      try { rec.start(); } catch (e) { marcarOuvindo(false); }
    }
    /* foto na conversa: a imagem vai para /foto, a resposta vira mensagem com confirmar/editar; a foto é descartada */
    var fotoCb = {
      inicio: function () { fotoBox.hidden = true; conversa.push({ papel: 'user', texto: 'Enviei uma foto.', local: true }); enviando = true; status.textContent = 'Lendo a imagem…'; desenhar(); },
      sucesso: function (c) { enviando = false; status.textContent = ''; conversa.push({ papel: 'assistant', texto: PS.fotoNucleo.resumo(c), foto: { c: c }, local: true }); desenhar(); },
      erro: function (msg) { enviando = false; status.textContent = ''; conversa.push({ papel: 'assistant', texto: 'Não consegui ler a imagem. ' + msg, local: true }); desenhar(); }
    };
    var fotoBox = h('div', { class: 'acoes ft-acoes', 'data-fid': 'ass-foto-opcoes', hidden: 'hidden' }, PS.foto ? PS.foto.botao(fotoCb) : []);
    var form = h('form', { class: 'ass-form', onsubmit: function (e) { e.preventDefault(); enviar(campo.value); } },
      h('label', { class: 'campo', 'for': 'ass-pergunta' }, h('span', null, 'Sua pergunta')), h('div', { class: 'ass-linha-campo' }, campo, mic), h('div', { class: 'acoes' }, btn,
        h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-foto', 'aria-expanded': 'false', onclick: function () { var ab = fotoBox.hidden; fotoBox.hidden = !ab; this.setAttribute('aria-expanded', ab ? 'true' : 'false'); } }, I('camera'), 'Foto'),
        h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-limpar', onclick: function () { conversa = []; desenhar(); } }, 'Limpar conversa')), fotoBox);
    campo.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(campo.value); } });
    var atalhos = h('div', { class: 'ass-atalhos', role: 'group', 'aria-label': 'Perguntas rápidas' },
      ['O que vence essa semana?', 'Tem conta atrasada?', 'Quais tarefas são prioridade alta?', 'O que tenho na agenda amanhã?'].map(function (q, i) {
        return h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-rapida-' + i, onclick: function () { enviar(q, true); } }, q);
      }));
    raiz.appendChild(h('section', { class: 'cartao' }, h('h2', null, I('estrela'), h('span', null, 'Ajudante da casa')), h('p', { class: 'ass-intro' }, 'Oi! Sou o ajudante geral do app. Posso ajudar com contas e vencimentos, agenda e tarefas: pergunte o que vence, o que está atrasado ou o que tem para amanhã. Se você pedir para anotar algo, eu sugiro e você confirma antes de gravar.'), atalhos, lista, status, form,
      h('p', { class: 'ass-nota' }, 'Usa o modelo LFM3-1.7B da Liquid AI. Um resumo de contas, tarefas e agenda sai deste aparelho só quando você pergunta; faturas detalhadas e cartões não são enviados. Respostas podem errar: confira antes de pagar.')));
    desenhar();
    return raiz;
  }
  PS.views.assistente = { reativo: false, titulo: 'Ajudante', render: render };
  PS.assistente = { contexto: contexto, separar: separar };
})(window);
