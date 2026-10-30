/* Assistente (Gemini com ferramentas locais via Worker minha-casa-assistente /conversa; fotos: LFM3-VL): perguntas sobre contas, tarefas e agenda.
   O modelo só vê o que as ferramentas devolvem (sem faturas detalhadas, sem cartões, sem itens de exemplo). Nada é gravado sem confirmação. byGui */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, h = U.h, I = PS.icone, S = PS.store, C = PS.consultas, G = PS.gemini;
  var BASE = g.MCO_ASSISTENTE_URL || 'https://minha-casa-assistente.guilhermeromionetto.workers.dev';
  var URL_LER = BASE + '/ler', URL_CONVERSA = BASE + '/conversa';
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
  function separar(txt, podeSugerir) {
    var r = C.extrairSugestoes(txt), sug = null, o = podeSugerir ? r.sugestoes[0] : null;
    if (o) {
      var t = String(o.titulo || '').slice(0, 120).trim();
      if (t && o.tipo === 'tarefa') sug = { tipo: 'tarefa', titulo: t, data: U.dataValida(o.data) ? o.data : '' };
      else if (t && o.tipo === 'conta' && U.dataValida(o.vence)) sug = { tipo: 'conta', titulo: t.slice(0, 80), vence: o.vence, valor: isFinite(Number(o.valor)) && Number(o.valor) > 0 ? Math.round(Number(o.valor) * 100) / 100 : null };
      else if (t && o.tipo === 'compromisso' && U.dataValida(o.data)) sug = { tipo: 'compromisso', titulo: t, data: o.data, hora: U.horaValida(o.hora) ? o.hora : '' };
    }
    var tx = r.texto.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,!?]|$)/g, '$1$2').replace(/^\s*-{3,}\s*$/gm, '').trim();
    return { texto: tx, sugestao: sug };
  }
  function descSug(x) {
    if (x.tipo === 'tarefa') return 'Nova tarefa: ' + x.titulo + (x.data ? ', até ' + U.dataCurta(x.data) : '');
    if (x.tipo === 'conta') return 'Nova conta (avulsa): ' + x.titulo + ', ' + brl(x.valor) + ', vence ' + U.dataCurta(x.vence);
    return 'Novo compromisso: ' + x.titulo + ', ' + U.dataCurta(x.data) + (x.hora ? ' às ' + x.hora : '');
  }
  function gravar(x) {
    S.alterar(function (s) {
      var it;
      if (x.tipo === 'tarefa') { it = S.sanearItem('tarefas', null, { titulo: x.titulo, vence: x.data, lista: s.listas[0], prio: x.prio || 'media' }); if (it) s.tarefas.push(it); }
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
        it = S.sanearItem('tarefas', null, { titulo: d.titulo, lista: s.listas[0], prio: x.prio || 'media' }); if (it) s.tarefas.push(it);
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
  /* reduz no aparelho: objectURL (não carrega 8 MB em base64 na memória), <img> aplica a rotação EXIF, canvas JPEG */
  function reduzir(arquivo, cb) {
    var tipo = String(arquivo && arquivo.type || '').toLowerCase(), nome = String(arquivo && arquivo.name || '').toLowerCase();
    if (!arquivo) { cb('Escolha uma imagem.'); return; }
    if (/hei[cf]/.test(tipo) || /\.hei[cf]$/.test(nome)) { cb('Foto em HEIC não é suportada neste navegador. Tire a foto pelo botão "Tirar foto" ou salve como JPEG.'); return; }
    if (tipo && !/^image\//.test(tipo)) { cb('Escolha uma imagem.'); return; }
    var feito = false, cb0 = cb, src = ''; cb = function (e, u, w, hh) { if (feito) return; feito = true; if (src) { try { URL.revokeObjectURL(src); } catch (x) { } } cb0(e, u, w, hh); };   /* uma única resposta */
    var img = new Image();
    img.onerror = function () { cb('Não consegui abrir essa imagem (formato não suportado). Tente outra foto ou um print.'); };
    img.onload = function () {
      try {
        var esc = Math.min(1, LADO_MAX / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * esc)), hh = Math.max(1, Math.round(img.height * esc));
        var cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, hh); cx.drawImage(img, 0, 0, w, hh);
        var url = cv.toDataURL('image/jpeg', 0.8); if (url.length > MAX_DATAURL) url = cv.toDataURL('image/jpeg', 0.6);
        cv.width = cv.height = 0; img.onload = img.onerror = null; img.removeAttribute('src');
        if (!/^data:image\/jpeg;base64,/.test(url)) { cb('Este aparelho não conseguiu reduzir a imagem. Tente um print da tela.'); return; }
        if (url.length > MAX_DATAURL) { cb('Imagem grande demais mesmo reduzida. Tente aproximar só o documento.'); return; }
        cb('', url, w, hh);
      } catch (e) { cb('Este aparelho não conseguiu reduzir a imagem (memória). Tente um print da tela.'); }
    };
    try { src = URL.createObjectURL(arquivo); img.src = src; } catch (e) { cb('Não consegui abrir a imagem.'); }
  }
  /* erro de rede/HTTP -> mensagem específica (nunca "sem conexão" quando o aparelho está online) */
  function erroLeitura(st, j, abortou) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Você está sem internet agora. Conecte e tente de novo.';
    if (abortou) return 'A leitura demorou demais. Tente de novo com a foto mais próxima do documento.';
    if (st === 413) return 'Imagem grande demais para enviar. Tente aproximar só o documento.';
    if (st === 429) return (j && j.erro) || 'Limite de leituras atingido. Espere alguns minutos e tente de novo.';
    if (st === 422) return (j && j.erro) || 'Não consegui ler o documento. Tente uma foto mais nítida e com boa luz.';
    if (st === 404 || st === 405) return 'A leitura de fotos está indisponível no servidor agora. Tente mais tarde.';
    if (st >= 500) return 'O serviço de leitura falhou (' + st + '). Tente de novo em instantes.';
    if (st) return 'Falha na leitura (' + st + ')' + (j && j.erro ? ': ' + j.erro : '.');
    return 'Não consegui falar com o serviço de leitura (bloqueio de rede ou servidor indisponível). Tente de novo.';
  }

  function balao(m, i, desenhar) {
    var filhos = [h('p', { class: 'ass-autor' }, m.papel === 'user' ? 'Você' : 'Ajudante'), h('div', { class: 'ass-texto' }, m.papel === 'user' ? m.texto : C.textoFinal(C.extrairSugestoes(m.texto).texto, m.leituras || m.sugestao ? ' ' : ''))];
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
      btn.disabled = enviando; arquivo.disabled = galeria.disabled = enviando; if (!enviando) status.textContent = ''; else if (!status.textContent) status.textContent = 'Pensando…';
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
    /* rapida=true: pergunta pronta, respondida 100% pelo app, sem modelo.
       Texto livre: Gemini com ferramentas que rodam AQUI (dados reais, sem exemplo); se o Gemini falhar, resposta determinística com aviso. */
    function enviar(texto, rapida) {
      texto = String(texto || '').trim(); if (!texto || enviando) return;
      var memo = G.memoria(conversa);
      conversa.push({ papel: 'user', texto: texto }); campo.value = '';
      var hj = U.hoje(), dd = dadosConsulta();
      if (rapida) { var q = C.classificar(texto, hj), fechada = q ? C.responder(q, dd) : null; if (fechada) { responderLocal(fechada.texto); desenhar(); return; } }
      enviando = true; desenhar();
      var turnos = memo.concat([{ r: 'user', t: texto }]), resultados = [], sug = null, rodada = 0;
      var pedidos = [texto].concat(memo.filter(function (m) { return m.r === 'user'; }).slice(-1).map(function (m) { return m.t; }));
      function reserva(motivo) { responderLocal(G.reserva(texto, dd, hj, motivo)); }
      function fim() { enviando = false; desenhar(); campo.focus(); }
      function passo() {
        rodada++;
        fetch(URL_CONVERSA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnos: turnos, hoje: hojeTexto() }) })
          .then(function (r) { return r.json().catch(function () { return { erro: 'Resposta inválida.', fallback: true }; }); })
          .then(function (j) {
            if (j && j.chamadas && j.chamadas.length && rodada < 5) {
              var fr = j.chamadas.map(function (c) {
                var res;
                if (c.n === 'criar_sugestao') { var o = G.sugestao(c.a, pedidos, hj); if (o.sugestao) sug = o.sugestao; res = o.resultado || { erro: o.erro }; }
                else res = G.executar(c.n, c.a, dd, hj, agoraHHMM());
                resultados.push(res); return { n: c.n, res: res };
              });
              turnos.push({ r: 'model', fc: j.chamadas }); turnos.push({ r: 'tool', fr: fr });
              status.textContent = 'Consultando os dados do app…'; passo(); return;
            }
            if (j && j.resposta) {
              var perm = G.permitido(resultados.concat(sug ? [sug] : [], memo), hj), f = G.finalizar(j.resposta, perm);
              if (f.fiel) conversa.push({ papel: 'assistant', texto: C.textoFinal(f.texto, sug ? 'Posso anotar isto:' : ''), sugestao: sug });
              else reserva('citou algo que não está nos seus dados, então descartei a resposta');
            } else reserva(j && j.erro ? (/limite/i.test(j.erro) ? 'atingiu o limite gratuito agora' : 'está indisponível agora') : 'não respondeu');
            fim();
          })
          .catch(function () { if (navigator.onLine === false) responderLocal('Você está sem internet agora. ' + G.reserva(texto, dd, hj, 'precisa de internet')); else reserva('não respondeu (falha de conexão)'); fim(); });
      }
      passo();
    }
    function agoraHHMM() { var d = new Date(); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
    /* câmera (capture) e galeria/prints (sem capture: no celular, capture abre só a câmera) */
    var arquivo = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'ass-arquivo', id: 'ass-foto', 'data-fid': 'ass-foto', 'aria-label': 'Tirar foto de boleto, comprovante, convite, lista ou cupom' });
    var galeria = h('input', { type: 'file', accept: 'image/*', class: 'ass-arquivo', id: 'ass-print', 'data-fid': 'ass-print', 'aria-label': 'Escolher print ou imagem da galeria' });
    function lerArquivo(inp) {
      var f = inp.files && inp.files[0]; inp.value = '';
      if (!f || enviando) return;
      enviando = true; status.textContent = 'Reduzindo a imagem…';
      conversa.push({ papel: 'user', texto: 'Foto/print enviado para leitura (a imagem não é guardada).' }); desenhar(); status.textContent = 'Lendo a imagem…';
      reduzir(f, function (erro, url) {
        if (erro) { conversa.push({ papel: 'assistant', texto: erro }); enviando = false; desenhar(); return; }
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, abortou = false, st = 0;
        var tm = setTimeout(function () { abortou = true; if (ctl) ctl.abort(); }, 60000);
        status.textContent = 'Lendo a imagem…';
        fetch(URL_LER, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagem: url, hoje: U.hoje() }), signal: ctl ? ctl.signal : undefined })
          .then(function (r) { st = r.status; return r.json().catch(function () { return null; }); })
          .then(function (j) {
            url = ''; clearTimeout(tm);
            if (abortou) { conversa.push({ papel: 'assistant', texto: erroLeitura(0, null, true) }); return; }
            if (!j || !j.leitura) { conversa.push({ papel: 'assistant', texto: erroLeitura(st, j, false) }); return; }
            var abertas = [], st2 = S.get(), ex = {}; (st2.contas || []).forEach(function (c) { if (c.exemplo) ex[c.id] = 1; });
            try { abertas = PS.fin.listas(st2, U.hoje()).abertas.filter(function (x) { return !ex[x.id]; }); } catch (e) { abertas = []; }
            var sugs = PS.leitura.normalizar(j.leitura, U.hoje(), abertas);
            conversa.push({ papel: 'assistant', texto: sugs.length ? 'Li a imagem. Confira e confirme o que deve ir para o app:' : 'Não reconheci esse documento. Tente boleto, comprovante, convite, acordo, lista ou cupom fiscal.', leituras: sugs });
          })
          .catch(function () { clearTimeout(tm); conversa.push({ papel: 'assistant', texto: erroLeitura(0, null, abortou) }); })
          .then(function () { enviando = false; desenhar(); });
      });
    }
    arquivo.addEventListener('change', function () { lerArquivo(arquivo); });
    galeria.addEventListener('change', function () { lerArquivo(galeria); });
    var btnFoto = h('label', { class: 'btn ass-btn-foto', for: 'ass-foto', 'data-fid': 'ass-btn-foto' }, I('camera'), h('span', null, 'Tirar foto'));
    var btnPrint = h('label', { class: 'btn ass-btn-foto', for: 'ass-print', 'data-fid': 'ass-btn-print' }, I('enviar'), h('span', null, 'Ler print ou imagem'));
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
    var form = h('form', { class: 'ass-form', onsubmit: function (e) { e.preventDefault(); enviar(campo.value); } },
      h('label', { class: 'campo', 'for': 'ass-pergunta' }, h('span', null, 'Sua pergunta')), h('div', { class: 'ass-linha-campo' }, campo, mic), h('div', { class: 'acoes' }, btn, arquivo, btnFoto, galeria, btnPrint,
        h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-limpar', onclick: function () { conversa = []; desenhar(); } }, 'Limpar conversa')));
    campo.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(campo.value); } });
    var atalhos = h('div', { class: 'ass-atalhos', role: 'group', 'aria-label': 'Perguntas rápidas' },
      ['O que vence essa semana?', 'Tem conta atrasada?', 'Quais tarefas são prioridade alta?', 'O que tenho na agenda amanhã?', 'Quais são minhas tarefas?'].map(function (q, i) {
        return h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-rapida-' + i, onclick: function () { enviar(q, true); } }, q);
      }));
    raiz.appendChild(h('section', { class: 'cartao' }, h('h2', null, I('estrela'), h('span', null, 'Ajudante da casa')), h('p', { class: 'ass-intro' }, 'Oi! Sou o ajudante geral do app. Posso ajudar com contas e vencimentos, agenda, tarefas e lembretes: pergunte o que vence, o que está atrasado ou o que tem para amanhã. Também leio foto ou print de boleto, comprovante, acordo, convite, lista ou cupom fiscal. Se você pedir para anotar algo, eu sugiro e você confirma antes de gravar.'), atalhos, lista, status, form,
      h('p', { class: 'ass-nota' }, 'As perguntas são respondidas pelo Gemini (Google), no plano gratuito: o Google pode usar o que é enviado para melhorar os modelos dele. Vão só a sua pergunta, as últimas mensagens e os itens de contas, tarefas e agenda que ele consultar; faturas detalhadas e cartões não são enviados. Não pergunte nada sigiloso. Fotos e prints são lidos pelo LFM3-VL-2B: a imagem é reduzida neste aparelho, enviada só para a leitura e não é guardada. Respostas podem errar: confira antes de pagar.')));
    desenhar();
    return raiz;
  }
  PS.views.assistente = { reativo: false, titulo: 'Ajudante', render: render };
  PS.assistente = { contexto: contexto, separar: separar, gravarLeitura: gravarLeitura };
})(window);
