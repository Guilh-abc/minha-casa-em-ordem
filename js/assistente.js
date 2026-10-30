/* Assistente (Liquid AI LFM3-1.7B via Worker minha-casa-assistente): perguntas sobre contas, tarefas e agenda.
   Envia um RESUMO dos dados (sem faturas detalhadas, sem cartões). Nada é gravado sem confirmação. byGui */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, h = U.h, I = PS.icone, S = PS.store, C = PS.consultas, G = PS.gemini;
  var BASE = g.MCO_ASSISTENTE_URL || 'https://minha-casa-assistente.guilhermeromionetto.workers.dev', URL_API = BASE + '/chat', URL_CONVERSA = BASE + '/conversa';
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
    var cp = PS.rep.expandir(s.compromissos || [], hoje, fim).filter(real).filter(function (c) { return c.data >= hoje && c.data <= fim; }).sort(function (a, b) { return (a.data + a.hora) < (b.data + b.hora) ? -1 : 1; }).slice(0, 40);
    l.push('AGENDA (próximos 45 dias):');
    cp.forEach(function (c) { l.push('- ' + c.data + (c.hora ? ' ' + c.hora : '') + ': ' + c.titulo + (c.local ? ' (' + c.local + ')' : '')); });
    if (!cp.length) l.push('- nada marcado');
    return l.join('\n').slice(0, 12000);
  }

  /* extrai os blocos <<SUGESTAO>> (parser tolerante) e limpa o texto; pergunta: só aceita títulos que vieram do pedido */
  function separar(txt, pergunta) {
    var r = C.lerSugestoes(txt || '', U.hoje()), sugs = r.sugestoes;
    if (pergunta != null) sugs = sugs.filter(function (x) { return C.sugestaoFiel(x, pergunta); });
    var t = String(r.texto || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,!?]|$)/g, '$1$2').replace(/^\s*-{3,}\s*$/gm, '').trim();
    return { texto: t, sugestoes: sugs, recusadas: r.sugestoes.length - sugs.length, sugestao: sugs[0] || null };
  }
  function descSug(x) {
    if (x.tipo === 'compras') return 'Lista de compras: ' + (x.itens || []).join(', ');
    if (x.tipo === 'tarefa') return 'Nova tarefa: ' + x.titulo + (x.data ? ', até ' + U.dataCurta(x.data) : '');
    if (x.tipo === 'conta') return 'Nova conta (avulsa): ' + x.titulo + ', ' + brl(x.valor) + ', vence ' + U.dataCurta(x.vence);
    return 'Novo compromisso: ' + x.titulo + ', ' + U.dataCurta(x.data) + (x.hora ? ' às ' + x.hora : '');
  }
  var ROT_GRAVOU = { compras: 'Itens salvos na Lista de compras', tarefa: 'Tarefa salva em Tarefas', conta: 'Conta salva em Contas a pagar', compromisso: 'Compromisso salvo na Agenda' };
  function gravar(x) {
    S.alterar(function (s) {
      var it;
      if (x.tipo === 'compras') { (x.itens || []).forEach(function (n) { var c = S.sanearItem('compras', null, { nome: n }); if (c) s.compras.unshift(c); }); }
      else if (x.tipo === 'tarefa') { it = S.sanearItem('tarefas', null, { titulo: x.titulo, vence: x.data, lista: s.listas[0], prio: 'media' }); if (it) { s.tarefas.push(it); PS.focarLista = it.lista; } }
      else if (x.tipo === 'conta') { it = S.sanearItem('contas', null, { titulo: x.titulo, mensal: false, data: x.vence, dia: +x.vence.slice(8, 10), valor: x.valor }); if (it) s.contas.push(it); }
      else { it = S.sanearItem('compromissos', null, { titulo: x.titulo, data: x.data, hora: x.hora, fonte: 'manual' }); if (it) s.compromissos.push(it); }
    });
    return ROT_GRAVOU[x.tipo] || ROT_GRAVOU.compromisso;
  }
  /* Editar: tarefa e compromisso usam a mesma revisão da foto (que salva no destino escolhido); conta tem formulário próprio */
  function editarSug(x, fim) {
    if (x.tipo === 'compras') {
      var ta = h('textarea', { class: 'entrada', rows: '5', 'data-fid': 'ass-compras-itens' }); ta.value = (x.itens || []).join('\n');
      return PS.modal.abrir('Itens para a Lista de compras', h('label', { class: 'campo' }, h('span', null, 'Um item por linha'), ta), [{ rotulo: 'Cancelar' },
        { rotulo: 'Salvar', tipo: 'primario', acao: function () { var its = ta.value.split('\n').map(function (z) { return z.trim().slice(0, 80); }).filter(Boolean); if (!its.length) return; var m = gravar({ tipo: 'compras', itens: its }); PS.aviso(m); fim(m); } }]);
    }
    if (x.tipo !== 'conta') return PS.foto.revisar({ destino: x.tipo === 'tarefa' ? 'tarefa' : 'agenda', titulo: x.titulo || '', data: x.data || '', hora: x.hora || '', local: '', valor: null, nome: '', preco: null, unidade: '' }, '', fim);
    var c = { titulo: x.titulo || '', vence: x.vence || U.hoje(), valor: x.valor == null ? '' : String(x.valor).replace('.', ',') };
    function entrada(rot, k, at) { var a = { class: 'entrada', 'data-fid': 'ass-conta-' + k, value: c[k], oninput: function () { c[k] = this.value; } }; Object.keys(at || {}).forEach(function (z) { a[z] = at[z]; }); return h('label', { class: 'campo' }, h('span', null, rot), h('input', a)); }
    PS.modal.abrir('Nova conta', h('div', { class: 'campos ft-revisao' }, entrada('Título', 'titulo', { maxlength: '80' }), entrada('Vence', 'vence', { type: 'date' }), entrada('Valor (R$)', 'valor', { inputmode: 'decimal', placeholder: '0,00' })), [
      { rotulo: 'Cancelar' },
      { rotulo: 'Salvar', tipo: 'primario', acao: function () {
        var y = { tipo: 'conta', titulo: String(c.titulo).trim().slice(0, 80), vence: c.vence, valor: C.valorSug(c.valor) };
        if (!y.titulo || !U.dataValida(y.vence)) { x.titulo = y.titulo; x.vence = y.vence; return editarSug(x, fim); }
        var m = gravar(y); PS.aviso(m); fim(m);
      } }]);
  }

  function balao(m, i, desenhar) {
    var filhos = [h('p', { class: 'ass-autor' }, m.papel === 'user' ? 'Você' : 'Ajudante'), h('div', { class: 'ass-texto' }, m.texto)];
    var sugs = m.sugestoes || (m.sugestao ? [m.sugestao] : []);
    if (m.lugares) filhos.push(h('ul', { class: 'ass-lugares', 'data-fid': 'ass-lugares' }, m.lugares.map(function (l, k) {
      var linha = [l.nota != null ? '★ ' + String(l.nota).replace('.', ',') + (l.avaliacoes != null ? ' (' + l.avaliacoes + ' avaliações)' : '') : 'sem nota', l.preco || l.faixa || '', l.dist != null ? C.rotDist(l.dist) : '', l.aberto === true ? 'aberto agora' : l.aberto === false ? 'fechado agora' : ''].filter(Boolean).join(' · ');
      return h('li', { class: 'ass-lugar', 'data-fid': 'ass-lugar-' + k }, h('strong', null, l.nome), h('span', { class: 'ass-lugar-info' }, linha),
        l.resumo ? h('span', { class: 'ass-lugar-resumo' }, l.resumo) : null,
        l.maps ? h('a', { class: 'btn', href: l.maps, target: '_blank', rel: 'noopener', 'data-fid': 'ass-lugar-maps-' + k }, 'Abrir no Google Maps') : null);
    })));
    if (m.link) filhos.push(h('a', { class: 'btn', href: m.link, target: '_blank', rel: 'noopener', 'data-fid': 'ass-maps' }, 'Buscar restaurantes no Google Maps'));
    sugs.forEach(function (sg, k) {
      var id = i + '-' + k;
      function pronto(msg) { sg.feito = msg; desenhar(); }
      filhos.push(h('div', { class: 'ass-sug', role: 'group', 'aria-label': 'Sugestão de lançamento', 'data-fid': 'ass-sug-' + id },
        h('p', null, I('alerta'), h('span', null, descSug(sg))),
        sg.feito ? h('p', { class: 'ass-ok' }, I('check'), h('span', null, sg.feito)) :
        h('div', { class: 'acoes' },
          h('button', { class: 'btn primario', type: 'button', 'data-fid': 'ass-confirmar-' + id, onclick: function () { pronto(gravar(sg) + '.'); } }, 'Confirmar'),
          h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-editar-' + id, onclick: function () { editarSug(sg, function (msg) { pronto(msg + '.'); }); } }, 'Editar'),
          h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-descartar-' + id, onclick: function () { pronto('Descartado. Nada foi gravado.'); } }, 'Descartar'))));
    });
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
      return { abertas: ab.filter(function (x) { return !ex[x.id]; }), compromissos: PS.rep.expandir(st.compromissos || [], U.hoje(), U.somaDias(U.hoje(), 400)), tarefas: st.tarefas || [] };
    }
    function abrirForm(tipo, fim) {
      if (tipo === 'conta') return editarSug({ tipo: 'conta', titulo: '', vence: U.hoje(), valor: null }, fim);
      editarSug({ tipo: tipo, titulo: '', data: '', hora: '' }, fim);
    }
    /* Gemini com ferramentas que rodam AQUI, sobre os dados reais; ele pergunta o que falta antes de sugerir; cartão só grava com Confirmar.
       Se o Gemini falhar, cai para a Liquid (/chat). */
    function viaGemini(texto, memo, reservaLiquid) {
      var hj = U.hoje(), dd = dadosConsulta(), turnos = memo.concat([{ r: 'user', t: texto }]), resultados = [], sugs = [], rodada = 0;
      var pedidos = [texto].concat(memo.filter(function (m) { return m.r === 'user'; }).slice(-3).map(function (m) { return m.t; }));
      function fim() { enviando = false; desenhar(); campo.focus(); }
      function passo() {
        rodada++;
        fetch(URL_CONVERSA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnos: turnos, hoje: hojeTexto() }) })
          .then(function (r) { return r.json().catch(function () { return { erro: 'Resposta inválida.', fallback: true }; }); })
          .then(function (j) {
            if (j && j.chamadas && j.chamadas.length && rodada < 5) {
              var fr = j.chamadas.map(function (c) {
                var res;
                if (c.n === 'criar_sugestao') {
                  var o = G.sugestao(c.a, pedidos, hj);
                  if (o.sugestao && !C.sugestaoFiel(o.sugestao.tipo === 'compras' ? { titulo: o.sugestao.itens.join(' ') } : o.sugestao, pedidos.join(' '))) o = { erro: 'o título não veio do que o usuário disse; pergunte o que ele quer criar' };
                  if (o.sugestao) sugs.push(o.sugestao); res = o.resultado || { erro: o.erro };
                } else res = G.executar(c.n, c.a, dd, hj, agoraHHMM());
                resultados.push(res); return { n: c.n, res: res };
              });
              turnos.push({ r: 'model', fc: j.chamadas }); turnos.push({ r: 'tool', fr: fr });
              status.textContent = 'Consultando os dados do app…'; passo(); return;
            }
            if (j && j.resposta) {
              var perm = G.permitido(resultados.concat(sugs, memo), hj), f = G.finalizar(j.resposta, perm);
              if (f.fiel || (!f.texto && sugs.length)) conversa.push({ papel: 'assistant', texto: f.texto || 'Posso anotar isto:', sugestoes: sugs });
              else responderLocal(G.reserva(texto, dd, hj, 'citou algo que não está nos seus dados, então descartei a resposta'));
              return fim();
            }
            reservaLiquid();
          })
          .catch(function () { reservaLiquid(); });
      }
      passo();
    }
    /* restaurantes perto: localização só com permissão do aparelho; dados só do Google Places (via Worker); sem chave, link de busca no Maps */
    function restaurantes() {
      var semGeo = 'Não consegui a sua localização (permissão negada ou indisponível). Você pode buscar direto no Google Maps:';
      if (!navigator.geolocation) { conversa.push({ papel: 'assistant', texto: semGeo, local: true, link: 'https://www.google.com/maps/search/restaurantes+perto+de+mim' }); return desenhar(); }
      enviando = true; desenhar(); status.textContent = 'Pedindo a sua localização…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        var eu = { lat: pos.coords.latitude, lng: pos.coords.longitude }, mapa = C.linkMaps(eu.lat, eu.lng);
        status.textContent = 'Buscando restaurantes perto…';
        fetch(BASE + '/lugares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: eu.lat, lng: eu.lng }) })
          .then(function (r) { return r.json().catch(function () { return { erro: 'Resposta inválida.' }; }); })
          .then(function (j) {
            if (j && j.lugares && j.lugares.length) {
              j.lugares.forEach(function (l) { l.dist = l.lat != null ? C.distancia(eu, l) : null; });
              j.lugares.sort(function (a, b) { return (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist); });
              conversa.push({ papel: 'assistant', texto: 'Restaurantes perto de você (dados do Google Maps):', local: true, lugares: j.lugares, link: mapa });
            } else if (j && j.lugares) conversa.push({ papel: 'assistant', texto: 'O Google Maps não achou restaurantes por perto. Busque no mapa:', local: true, link: mapa });
            else conversa.push({ papel: 'assistant', texto: (j && j.semChave ? 'A busca com nota, avaliações e preço ainda não está ligada: falta uma chave do Google Maps Platform (Places API) no servidor do Ajudante. Enquanto isso, abra a busca no Google Maps:' : 'Não consegui buscar agora (' + ((j && j.erro) || 'erro') + '). Abra a busca no Google Maps:'), local: true, link: mapa });
          })
          .catch(function () { conversa.push({ papel: 'assistant', texto: 'Não consegui falar com o servidor. Abra a busca no Google Maps:', local: true, link: mapa }); })
          .then(function () { enviando = false; desenhar(); });
      }, function () { enviando = false; conversa.push({ papel: 'assistant', texto: semGeo, local: true, link: 'https://www.google.com/maps/search/restaurantes+perto+de+mim' }); desenhar(); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
    }
    function agoraHHMM() { var d = new Date(); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
    function hojeTexto() { var hj = U.hoje(), am = U.somaDias(hj, 1); return U.DIAS[U.dowIso(hj)] + ', ' + hj.slice(8, 10) + '/' + hj.slice(5, 7) + '/' + hj.slice(0, 4) + ' (' + hj + '); amanhã é ' + U.DIAS[U.dowIso(am)] + ', ' + am.slice(8, 10) + '/' + am.slice(5, 7) + ' (' + am + ')'; }
    function responderLocal(txt) { conversa.push({ papel: 'assistant', texto: txt, local: true }); }
    /* rapida=true: pergunta pronta, respondida 100% pelo app, sem modelo */
    function enviar(texto, rapida) {
      texto = String(texto || '').trim(); if (!texto || enviando) return;
      var memo = G ? G.memoria(conversa) : [];
      conversa.push({ papel: 'user', texto: texto }); campo.value = '';
      if (C.pedeRestaurante(texto) && !C.pedeCriar(texto)) return restaurantes();
      if (/^o que falta comprar\??$/i.test(texto)) { var fc = (S.get().compras || []).filter(function (c) { return !c.exemplo && !c.comprado; }); responderLocal(fc.length ? 'Falta comprar (' + fc.length + '): ' + fc.map(function (c) { return c.nome; }).join(', ') + '.' : 'A Lista de compras está vazia.'); return desenhar(); }
      if (/^quais tarefas est[aã]o atrasadas\??$/i.test(texto)) { var hj0 = U.hoje(), ta = (S.get().tarefas || []).filter(function (t) { return !t.exemplo && !t.feita && t.vence && t.vence < hj0; }); responderLocal(ta.length ? 'Tarefas atrasadas (' + ta.length + '):\n' + ta.map(function (t) { return '• ' + t.titulo + ' (prazo ' + t.vence.slice(8, 10) + '/' + t.vence.slice(5, 7) + ')'; }).join('\n') : 'Nenhuma tarefa atrasada.'); return desenhar(); }
      var vazio = C.pedidoVazio(texto);
      if (vazio) {
        var rot = { tarefa: 'nova tarefa', compromisso: 'novo compromisso', conta: 'nova conta' }[vazio];
        var msgF = { papel: 'assistant', texto: 'Abri o formulário de ' + rot + '. Preencha e salve.', local: true, form: vazio };
        conversa.push(msgF); desenhar();
        abrirForm(vazio, function (m) { msgF.texto = m + '.'; desenhar(); });
        return;
      }
      var hj = U.hoje(), q = C.pedeCriar(texto) ? null : C.classificar(texto, hj), fechada = q ? C.responder(q, dadosConsulta()) : null;
      if (fechada && (rapida || C.soLocal(q) || !fechada.itens.length)) { responderLocal(fechada.texto); desenhar(); return; }
      enviando = true; desenhar();
      if (G && !fechada) return viaGemini(texto, memo, viaLiquid);
      viaLiquid();
      function viaLiquid() {
      var ctx = fechada ? 'LISTA FECHADA (estes são TODOS os itens; reformule só esta lista, não acrescente nada):\n' + fechada.texto : contexto();
      var permitido = fechada ? fechada.permitido : C.permitidoResposta(ctx, texto, hj);
      var hist = fechada ? [{ papel: 'user', texto: texto }] : conversa.filter(function (m) { return !m.local; }).slice(-10).map(function (m) { return { papel: m.papel, texto: m.texto.slice(0, 4000) }; });
      fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagens: hist, contexto: ctx, hoje: hojeTexto() }) })
        .then(function (r) { return r.json().catch(function () { return { erro: 'Resposta inválida.' }; }); })
        .then(function (j) {
          if (j && j.resposta) {
            var p = separar(C.textoFinal(C.limpar(j.resposta), texto), texto);
            if (p.recusadas && !p.sugestoes.length && !fechada) { responderLocal('Não sugeri nada porque o título não veio do seu pedido. Diga o que quer criar, por exemplo: crie uma tarefa pagar a luz até 10/11.'); return; }
            if (fechada) { if (C.fiel(p.texto, permitido)) conversa.push({ papel: 'assistant', texto: p.texto || fechada.texto }); else responderLocal(fechada.texto); }
            else if (C.fiel(p.texto, permitido)) conversa.push({ papel: 'assistant', texto: p.texto || (p.sugestoes.length ? 'Posso adicionar isto:' : C.SEM_RESPOSTA), sugestoes: p.sugestoes });
            else responderLocal('Não encontrei isso nos dados do app. Pergunte, por exemplo, o que vence essa semana ou o que tem na agenda amanhã.');
          }
          else conversa.push({ papel: 'assistant', texto: 'Não consegui responder: ' + ((j && j.erro) || 'erro desconhecido') });
        })
        .catch(function () { if (fechada) responderLocal(fechada.texto); else conversa.push({ papel: 'assistant', texto: 'Sem conexão com o ajudante agora. Tente de novo quando estiver online.' }); })
        .then(function () { enviando = false; desenhar(); campo.focus(); });
      }
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
    var atalhos = h('div', { class: 'ass-atalhos', role: 'group', 'aria-label': 'Sugestões' });
    function montarAtalhos() {
      U.limpar(atalhos);
      C.sugestoesDinamicas(dadosConsulta(), U.hoje(), new Date().getHours(), S.get().compras || []).forEach(function (x, i) {
        atalhos.appendChild(h('button', { class: 'btn', type: 'button', 'data-fid': 'ass-rapida-' + i, onclick: function () { enviar(x.pergunta, x.tipo === 'consulta'); montarAtalhos(); } }, x.rotulo));
      });
    }
    montarAtalhos();
    raiz.appendChild(h('section', { class: 'cartao' }, h('h2', null, I('estrela'), h('span', null, 'Ajudante da casa')), h('p', { class: 'ass-intro' }, 'Oi! Sou o ajudante geral do app. Posso ajudar com contas e vencimentos, agenda e tarefas: pergunte o que vence, o que está atrasado ou o que tem para amanhã. Se você pedir para anotar algo, eu sugiro e você confirma antes de gravar.'), atalhos, lista, status, form,
      h('p', { class: 'ass-nota' }, 'As conversas usam o Gemini (Google, plano gratuito: o Google pode usar o que é enviado para melhorar os modelos); se ele falhar, o LFM3-1.7B da Liquid AI responde. Restaurantes usam a sua localização só quando você pede. Um resumo de contas, tarefas e agenda sai deste aparelho só quando você pergunta; faturas detalhadas e cartões não são enviados. Respostas podem errar: confira antes de pagar.')));
    desenhar();
    return raiz;
  }
  PS.views.assistente = { reativo: false, titulo: 'Ajudante', render: render };
  PS.assistente = { contexto: contexto, separar: separar };
})(window);
