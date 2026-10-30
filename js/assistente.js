/* Assistente (Liquid AI LFM3-1.7B via Worker minha-casa-assistente): perguntas sobre contas, tarefas e agenda.
   Envia um RESUMO dos dados (sem faturas detalhadas, sem cartões). Nada é gravado sem confirmação. byGui */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, h = U.h, I = PS.icone, S = PS.store, C = PS.consultas;
  var BASE = g.MCO_ASSISTENTE_URL || 'https://minha-casa-assistente.guilhermeromionetto.workers.dev';
  var URL_API = BASE + '/chat', URL_LER = BASE + '/ler';
  var LADO_MAX = 1280, MAX_DATAURL = 1400000;   /* a foto é reduzida no aparelho e nunca é guardada */
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
    var lb = (s.lembretes || []).filter(real).filter(function (x) { return !x.feito; }).slice(0, 30);
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

  /* grava UMA sugestão vinda da leitura de foto/print (já normalizada por PS.leitura). Devolve o texto de resultado. */
  function gravarLeitura(sg) {
    var d = sg.dados, res = 'Gravado no app.';
    S.alterar(function (s) {
      var it;
      if (sg.acao === 'conta') {
        if (s.contas.some(function (c) { return !c.mensal && c.data === d.data && c.valor === d.valor && c.titulo.toLowerCase() === String(d.titulo).toLowerCase(); })) { res = 'Já existia uma conta igual. Nada foi gravado.'; return; }
        it = S.sanearItem('contas', null, { titulo: d.titulo, mensal: false, data: d.data, dia: +d.data.slice(8, 10), valor: d.valor, obs: d.linha ? 'Linha ' + d.linha : '' }); if (it) s.contas.push(it);
      } else if (sg.acao === 'pagar') {
        var ab = PS.fin.listas(s, U.hoje()).abertas.some(function (x) { return x.tipo === d.tipo && x.id === d.id && x.chave === d.chave; });
        if (!ab) { res = 'Essa conta já estava paga. Nada foi alterado.'; return; }
        PS.fin.marcarPaga(s, d.tipo, d.id, d.chave, d.pagaEm); res = 'Marcada como paga.';
      } else if (sg.acao === 'compromisso') {
        if (s.compromissos.some(function (c) { return c.data === d.data && c.titulo.toLowerCase() === d.titulo.toLowerCase(); })) { res = 'Já estava na agenda. Nada foi gravado.'; return; }
        it = S.sanearItem('compromissos', null, { titulo: d.titulo, data: d.data, hora: d.hora, local: d.local, fonte: 'manual' }); if (it) s.compromissos.push(it);
      } else if (sg.acao === 'lembrete') {
        it = S.sanearItem('lembretes', null, { titulo: d.titulo, dia: 0, obs: d.obs, prio: 'media' }); if (it) s.lembretes.push(it);
      } else if (sg.acao === 'tarefa') {
        if (s.tarefas.some(function (t) { return !t.feita && t.titulo.toLowerCase() === d.titulo.toLowerCase(); })) { res = 'Já existe essa tarefa pendente.'; return; }
        it = S.sanearItem('tarefas', null, { titulo: d.titulo, lista: s.listas[0], prio: 'media' }); if (it) s.tarefas.push(it);
      } else if (sg.acao === 'gasto') {
        /* gasto avulso (cupom fiscal): lançamento sem cartão, fatura 'avulso' */
        if (s.lancs.some(function (l) { return l.fatura === 'avulso' && l.data === d.data && l.valor === d.valor && l.desc === d.titulo.slice(0, 80); })) { res = 'Esse cupom já foi lançado. Nada foi gravado.'; return; }
        it = S.sanearItem('lancs', null, { fatura: 'avulso', data: d.data, desc: d.titulo, valor: d.valor || 0, cat: d.cat, catBanco: 'cupom' }); if (it) s.lancs.push(it);
      } else res = 'Nada a gravar.';
      if (!it && /^Gravado/.test(res)) res = 'Não consegui gravar (dados inválidos).';
    });
    return res;
  }
  /* reduz a foto no aparelho: lado maior até 1280 px, JPEG 0,8 (cai para 0,6 se ainda ficar grande) */
  function reduzir(arquivo, cb) {
    if (!arquivo || !/^image\//.test(arquivo.type || '')) { cb('Escolha uma imagem.'); return; }
    var leitor = new FileReader();
    leitor.onerror = function () { cb('Não consegui abrir a imagem.'); };
    leitor.onload = function () {
      var img = new Image();
      img.onerror = function () { cb('Formato de imagem não suportado.'); };
      img.onload = function () {
        var esc = Math.min(1, LADO_MAX / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * esc)), hh = Math.max(1, Math.round(img.height * esc));
        var cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, hh); cx.drawImage(img, 0, 0, w, hh);
        var url = cv.toDataURL('image/jpeg', 0.8); if (url.length > MAX_DATAURL) url = cv.toDataURL('image/jpeg', 0.6);
        cv.width = cv.height = 0; img.src = '';
        if (url.length > MAX_DATAURL) { cb('Imagem grande demais mesmo reduzida.'); return; }
        cb('', url, w, hh);
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
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
    if (m.leituras && m.leituras.length) {
      var pend = m.leituras.filter(function (x) { return !x.feito && x.acao !== 'nada'; });
      m.leituras.forEach(function (sg, k) {
        var fid = 'ass-ler-' + i + '-' + k;
        filhos.push(h('div', { class: 'ass-sug', role: 'group', 'aria-label': 'Leitura para confirmar' },
          h('p', null, I('alerta'), h('span', null, sg.resumo)),
          sg.avisos.length ? h('ul', { class: 'ass-avisos' }, sg.avisos.map(function (a) { return h('li', null, a); })) : null,
          sg.feito ? h('p', { class: 'ass-ok' }, I('check'), h('span', null, sg.feito)) : sg.acao === 'nada' ? null :
          h('div', { class: 'acoes' },
            h('button', { class: 'btn primario', type: 'button', 'data-fid': fid + '-confirmar', onclick: function () { sg.feito = gravarLeitura(sg); desenhar(); } }, 'Confirmar e gravar'),
            h('button', { class: 'btn', type: 'button', 'data-fid': fid + '-descartar', onclick: function () { sg.feito = 'Descartado. Nada foi gravado.'; desenhar(); } }, 'Descartar'))));
      });
      if (pend.length > 1) filhos.push(h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'button', 'data-fid': 'ass-ler-' + i + '-todas', onclick: function () { pend.forEach(function (sg) { if (!sg.feito) sg.feito = gravarLeitura(sg); }); desenhar(); } }, 'Confirmar todas (' + pend.length + ')')));
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
      btn.disabled = enviando; arquivo.disabled = enviando; if (!enviando) status.textContent = ''; else if (!status.textContent) status.textContent = 'Pensando…';
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
      if (fechada && (rapida || !fechada.itens.length)) { responderLocal(fechada.texto); desenhar(); return; }
      enviando = true; desenhar();
      var ctx = fechada ? 'LISTA FECHADA (estes são TODOS os itens; reformule só esta lista, não acrescente nada):\n' + fechada.texto : contexto();
      var permitido = fechada ? fechada.permitido : C.permitidoResposta(ctx, texto, hj);
      var hist = fechada ? [{ papel: 'user', texto: texto }] : conversa.filter(function (m) { return !m.local; }).slice(-10).map(function (m) { return { papel: m.papel, texto: m.texto.slice(0, 4000) }; });
      fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagens: hist, contexto: ctx, hoje: hojeTexto() }) })
        .then(function (r) { return r.json().catch(function () { return { erro: 'Resposta inválida.' }; }); })
        .then(function (j) {
          if (j && j.resposta) {
            var p = separar(C.limpar(j.resposta));
            if (fechada) { if (C.fiel(p.texto, permitido)) conversa.push({ papel: 'assistant', texto: p.texto || fechada.texto }); else responderLocal(fechada.texto); }
            else if (C.fiel(p.texto, permitido)) conversa.push({ papel: 'assistant', texto: p.texto || 'Pronto.', sugestao: p.sugestao });
            else responderLocal('Não encontrei isso nos dados do app. Pergunte, por exemplo, o que vence essa semana ou o que tem na agenda amanhã.');
          }
          else conversa.push({ papel: 'assistant', texto: 'Não consegui responder: ' + ((j && j.erro) || 'erro desconhecido') });
        })
        .catch(function () { if (fechada) responderLocal(fechada.texto); else conversa.push({ papel: 'assistant', texto: 'Sem conexão com o ajudante agora. Tente de novo quando estiver online.' }); })
        .then(function () { enviando = false; desenhar(); campo.focus(); });
    }
    var arquivo = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'ass-arquivo', id: 'ass-foto', 'data-fid': 'ass-foto', 'aria-label': 'Foto ou print de boleto, comprovante, convite, lista ou cupom' });
    arquivo.addEventListener('change', function () {
      var f = arquivo.files && arquivo.files[0]; arquivo.value = '';
      if (!f || enviando) return;
      enviando = true; status.textContent = 'Reduzindo a imagem…';
      conversa.push({ papel: 'user', texto: 'Foto/print enviado para leitura (a imagem não é guardada).' }); desenhar(); status.textContent = 'Lendo a imagem…';
      reduzir(f, function (erro, url) {
        if (erro) { conversa.push({ papel: 'assistant', texto: erro }); enviando = false; desenhar(); return; }
        fetch(URL_LER, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagem: url, hoje: U.hoje() }) })
          .then(function (r) { return r.json().catch(function () { return { erro: 'Resposta inválida.' }; }); })
          .then(function (j) {
            url = '';
            if (!j || !j.leitura) { conversa.push({ papel: 'assistant', texto: 'Não consegui ler: ' + ((j && j.erro) || 'erro desconhecido') }); return; }
            var abertas = []; try { abertas = PS.fin.listas(S.get(), U.hoje()).abertas; } catch (e) { abertas = []; }
            var sugs = PS.leitura.normalizar(j.leitura, U.hoje(), abertas);
            conversa.push({ papel: 'assistant', texto: sugs.length ? 'Li a imagem. Confira e confirme o que deve ir para o app:' : 'Não reconheci esse documento. Tente boleto, comprovante, convite, acordo, lista ou cupom fiscal.', leituras: sugs });
          })
          .catch(function () { conversa.push({ papel: 'assistant', texto: 'Sem conexão com o ajudante agora. Tente de novo quando estiver online.' }); })
          .then(function () { enviando = false; desenhar(); });
      });
    });
    var btnFoto = h('label', { class: 'btn ass-btn-foto', for: 'ass-foto', 'data-fid': 'ass-btn-foto' }, I('camera'), h('span', null, 'Ler foto ou print'));
    var form = h('form', { class: 'ass-form', onsubmit: function (e) { e.preventDefault(); enviar(campo.value); } },
      h('label', { class: 'campo' }, h('span', null, 'Sua pergunta'), campo), h('div', { class: 'acoes' }, btn, btnFoto, arquivo,
        h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-limpar', onclick: function () { conversa = []; desenhar(); } }, 'Limpar conversa')));
    campo.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(campo.value); } });
    var atalhos = h('div', { class: 'ass-atalhos', role: 'group', 'aria-label': 'Perguntas rápidas' },
      ['O que vence essa semana?', 'Tem conta atrasada?', 'Quais tarefas são prioridade alta?', 'O que tenho na agenda amanhã?'].map(function (q, i) {
        return h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-rapida-' + i, onclick: function () { enviar(q, true); } }, q);
      }));
    raiz.appendChild(h('section', { class: 'cartao' }, h('h2', null, I('estrela'), h('span', null, 'Ajudante da casa')), h('p', { class: 'ass-intro' }, 'Oi! Sou o ajudante geral do app. Posso ajudar com contas e vencimentos, agenda, tarefas e lembretes: pergunte o que vence, o que está atrasado ou o que tem para amanhã. Também leio foto ou print de boleto, comprovante, acordo, convite, lista ou cupom fiscal. Se você pedir para anotar algo, eu sugiro e você confirma antes de gravar.'), atalhos, lista, status, form,
      h('p', { class: 'ass-nota' }, 'Usa o modelo LFM3-1.7B da Liquid AI. Um resumo de contas, tarefas e agenda sai deste aparelho só quando você pergunta; faturas detalhadas e cartões não são enviados. Fotos e prints são lidos pelo LFM3-VL-2B: a imagem é reduzida neste aparelho, enviada só para a leitura e não é guardada. Respostas podem errar: confira antes de pagar.')));
    desenhar();
    return raiz;
  }
  PS.views.assistente = { reativo: false, titulo: 'Ajudante', render: render };
  PS.assistente = { contexto: contexto, separar: separar, gravarLeitura: gravarLeitura };
})(window);
