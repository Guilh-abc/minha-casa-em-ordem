/* Telas: Hoje, Rotina, Tarefas, Agenda, Família, Relaxar, Importar, Instalar. */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, h = U.h, I = PS.icone, S = PS.store, D = PS.dom;
  var views = PS.views = {};
  var listaAtual = null, climaMem = null;

  function cartao(titulo, icone, filhos, mais) {
    return h('section', { class: 'cartao' },
      h('h2', null, I(icone), h('span', null, titulo), mais ? h('span', { class: 'mais' }, mais) : null), filhos);
  }
  function tagExemplo(x) { return x.exemplo ? h('span', { class: 'exemplo' }, 'exemplo') : null; }
  function nada() { return null; }
  function caixa(on) { return h('span', { class: 'caixa' + (on ? ' on' : ''), 'aria-hidden': 'true' }, I('check')); }
  function selo(tipo, icone, texto) { return h('span', { class: 'selo ' + tipo }, I(icone), texto); }

  function relogio() {
    return h('div', { class: 'relogio', 'aria-label': 'Hora atual' }, h('span', { class: 'rh' }, '--'), h('span', { class: 'dp' }, ':'), h('span', { class: 'rm' }, '--'));
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function seloVenc(estado, data, hoje, paga, rotuloPaga, curto) {
    if (paga) return selo('ok', 'check', rotuloPaga || 'Paga');
    var n = U.difDias(data, hoje), txt = cap(U.rotuloRelativo(data, hoje));
    if (n < 0) return selo('perigo', 'alerta', curto ? txt : 'Atrasada · ' + txt.toLowerCase());
    if (n <= 3) return selo('aviso', 'sino', txt);
    return selo('neutro', 'calendario', txt);
  }

  /* ---------- HOJE ---------- */
  function climaConteudo(box, d, erro) {
    U.limpar(box);
    if (!d) { box.appendChild(h('p', { class: 'vazio' }, erro ? 'Sem conexão com o clima agora.' : 'Carregando clima…')); return; }
    var info = PS.clima.descricao(d.cod);
    box.appendChild(h('div', { class: 'clima' }, I(info[1], 'grande'),
      h('div', null, h('div', { class: 'temp' }, d.temp + '°'), h('div', { class: 'desc' }, info[0])),
      h('div', { class: 'det' }, h('div', null, 'Sensação ' + d.sens + '°'), h('div', null, d.min + '° / ' + d.max + '°'), h('div', null, 'Chuva ' + (d.chuva == null ? '–' : d.chuva + '%') + (d.offline ? ' (offline)' : '')))));
  }
  function chipSync() {
    var a = h('a', { class: 'sync-chip', href: '#/sincronizar', 'data-fid': 'sync-chip' });
    if (PS.atualizarChipSync) PS.atualizarChipSync(a);
    return a;
  }
  views.hoje = { reativo: true, titulo: 'Hoje', render: function () {
    var s = S.get(), ag = U.agora(), hoje = ag.iso, nome = s.config.nome;
    var boxClima = h('div');
    climaConteudo(boxClima, climaMem, false);
    PS.clima.obter(s.config).then(function (d) { climaMem = d; if (boxClima.isConnected !== false) climaConteudo(boxClima, d); }, function () { if (!climaMem) climaConteudo(boxClima, null, true); });

    var comp = D.proximosCompromissos(s, ag, 7), nComp = comp.length;
    var listaComp = comp.slice(0, 3).map(function (c) {
      return h('a', { class: 'item', href: '#/agenda', 'data-fid': 'cp:' + c.id },
        h('span', { class: 'hora' }, c.hora || 'Dia'), h('span', { class: 't' }, c.titulo, nada()), h('span', { class: 'meta' }, c.data === hoje ? 'hoje' : U.dataCurta(c.data).split(',')[0]));
    });
    var tars = D.itensDoDia(s, hoje), nT = tars.length;
    var listaT = tars.slice(0, 2).map(function (it) {
      if (it.tipo === 'lembrete') {
        return h('button', { class: 'item', type: 'button', 'data-fid': 'lp:' + it.l.id, onclick: function () { S.alterar(function (st) { st.lembretes.forEach(function (x) { if (x.id === it.l.id) x.feito = true; }); }); } },
          caixa(false), it.l.icone ? I(it.l.icone, 'ic-fam') : null, h('span', { class: 't' }, it.l.titulo, nada()));
      }
      var t = it.t;
      return h('button', { class: 'item', type: 'button', 'data-fid': 'tr:' + t.id, onclick: function () { S.alterar(function (st) { st.tarefas.forEach(function (x) { if (x.id === t.id) x.feita = true; }); }); } },
        caixa(false), h('span', { class: 't' }, t.titulo, nada()));
    });
    var frase = D.fraseDoDia(s, hoje);

    return h('div', { class: 'hoje-wrap' }, PS.finUI.atencao(s, hoje, 2), h('div', { class: 'hoje' },
      h('div', { class: 'coluna' },
        h('section', { class: 'cartao relogio-cartao' }, relogio(), h('div', { class: 'data-grande' }, cap(U.dataLonga(hoje))), h('div', { class: 'saudacao' }, D.saudacao(ag.h) + (nome ? ', ' + nome : '') + ' · ' + s.config.cidade), chipSync()),
        cartao('Clima', 'sol', boxClima)),
      h('div', { class: 'coluna' },
        cartao('Compromissos', 'calendario', listaComp.length ? listaComp : h('p', { class: 'vazio' }, 'Nada marcado nos próximos 7 dias.'), nComp > 3 ? '+' + (nComp - 3) : null),
        cartao('Tarefas do dia', 'lista', listaT.length ? listaT : h('p', { class: 'vazio' }, 'Nenhuma tarefa para hoje. Tudo em dia!'), nT > 2 ? '+' + (nT - 2) : null)),
      h('div', { class: 'coluna' },
        frase ? cartao('Foco do dia', 'alvo', h('p', { class: 'foco' }, frase)) : null)));
  } };

  /* ---------- ROTINA ---------- */
  views.rotina = { reativo: true, titulo: 'Rotina', render: function () {
    var s = S.get(), hoje = U.hoje(), seg = U.somaDias(hoje, -((U.dowIso(hoje) + 6) % 7));
    var feitos = s.habitos.filter(function (x) { return S.habitoFeito(x.id, hoje); }).length, tot = s.habitos.length, pct = tot ? Math.round(feitos * 100 / tot) : 0;
    var lista = s.habitos.map(function (x) {
      var on = S.habitoFeito(x.id, hoje), seq = S.sequencia(x.id), dias = [];
      for (var i = 0; i < 7; i++) {
        var d = U.somaDias(seg, i), f = S.habitoFeito(x.id, d);
        dias.push(h('span', { class: 'dia' + (f ? ' on' : '') + (d === hoje ? ' hoje-d' : '') + (d > hoje ? ' futuro' : ''), title: U.dataCurta(d) }, h('span', null, U.DIAS_CURTOS[U.dowIso(d)].charAt(0)), h('i')));
      }
      return h('button', { class: 'habito', type: 'button', role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'data-fid': 'hb:' + x.id, onclick: function () { S.alternarHabito(x.id, hoje); } },
        I(x.icone, 'icone'),
        h('span', null, h('span', { class: 'nome' }, x.nome, tagExemplo(x)), h('span', { class: 'seq' }, seq ? [I('chama'), seq + (seq === 1 ? ' dia seguido' : ' dias seguidos')] : 'Sem sequência ainda')),
        h('span', { class: 'semana' }, dias), caixa(on));
    });
    return h('div', null,
      h('h1', { class: 'titulo-tela' }, 'Rotina', h('small', null, U.dataLonga(hoje))),
      tot ? h('div', { class: 'cartao resumo-rotina' }, h('div', { class: 'progresso-txt' }, h('strong', null, feitos + ' de ' + tot), h('span', null, pct + '% dos hábitos de hoje')),
        h('div', { class: 'barra' }, h('i', { style: 'width:' + pct + '%' }))) : null,
      lista.length ? lista : h('p', { class: 'vazio' }, 'Nenhum hábito cadastrado. Abra Gerenciar → Hábitos.'));
  } };

  /* ---------- TAREFAS ---------- */
  var TODOS = '__todos', modoTarefas = 'lista';
  function seloPrio(p) { return selo(p === 'alta' ? 'perigo' : p === 'media' ? 'aviso' : 'neutro', p === 'alta' ? 'alerta' : 'estrela', D.ROTULO_PRIO[p]); }
  function tagLista(t) { return h('span', { class: 'tag-lista' }, t.lista); }
  function alternarFeita(id) { S.alterar(function (st) { st.tarefas.forEach(function (x) { if (x.id === id) x.feita = !x.feita; }); }); }
  function moverPara(id, col) {
    var ok = false, hoje = U.hoje();
    S.alterar(function (st) { st.tarefas.forEach(function (x) { if (x.id === id) ok = D.moverTarefa(x, col, hoje); }); });
    if (ok) PS.aviso(col === 'semdata' ? 'Tarefa sem data' : 'Prazo: ' + U.dataCurta(D.dataDaColuna(col, hoje)));
  }
  function quadro(s, hoje, lista) {
    var cols = D.quadroPrazo(s.tarefas, hoje, lista);
    return h('div', { class: 'quadro', role: 'list', 'aria-label': 'Quadro de tarefas por prazo' }, cols.map(function (c) {
      var col = h('section', { class: 'coluna-prazo cp-' + c.id, role: 'listitem', 'data-col': c.id, 'data-fid': 'qc:' + c.id, 'aria-label': c.rotulo + ', ' + c.itens.length + (c.itens.length === 1 ? ' tarefa' : ' tarefas') },
        h('h3', null, c.rotulo, h('small', null, String(c.itens.length))),
        c.itens.length ? c.itens.map(function (t) {
          var sel = h('select', { class: 'mover', 'data-fid': 'mv:' + t.id, 'aria-label': 'Mover "' + t.titulo + '" para' },
            [h('option', { value: '' }, 'Mover para…')].concat(D.COLUNAS_PRAZO.filter(function (x) { return x[0] !== 'atrasadas' && x[0] !== c.id; }).map(function (x) { return h('option', { value: x[0] }, x[1]); })));
          sel.addEventListener('change', function () { if (sel.value) moverPara(t.id, sel.value); });
          var card = h('div', { class: 'cartao-tarefa', draggable: 'true', 'data-id': t.id, 'data-fid': 'qt:' + t.id },
            h('span', { class: 't' }, t.titulo || '(sem título)', tagExemplo(t)),
            h('span', { class: 'meta-tarefa' }, seloPrio(t.prio), tagLista(t), t.vence ? h('span', { class: 'data' }, U.dataCurta(t.vence)) : null),
            h('span', { class: 'acoes-tarefa' }, sel,
              h('button', { class: 'btn peq', type: 'button', 'data-fid': 'qf:' + t.id, 'aria-label': 'Concluir "' + t.titulo + '"', onclick: function () { alternarFeita(t.id); } }, I('check'), 'Concluir')));
          card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('arrastando'); });
          card.addEventListener('dragend', function () { card.classList.remove('arrastando'); });
          return card;
        }) : h('p', { class: 'vazio' }, 'Nada aqui'));
      if (c.id !== 'atrasadas') {
        col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('alvo'); });
        col.addEventListener('dragleave', function () { col.classList.remove('alvo'); });
        col.addEventListener('drop', function (e) { e.preventDefault(); col.classList.remove('alvo'); var id = e.dataTransfer.getData('text/plain'); if (id) moverPara(id, c.id); });
      }
      return col;
    }));
  }
  views.tarefas = { reativo: true, titulo: 'Tarefas', render: function () {
    var s = S.get(), hoje = U.hoje(), nomes = D.listasComTarefas(s);
    if (!listaAtual || (listaAtual !== TODOS && nomes.indexOf(listaAtual) < 0)) listaAtual = nomes[0] || TODOS;
    var todos = listaAtual === TODOS;
    function aba(id, rot, pend) {
      return h('button', { class: 'aba', type: 'button', role: 'tab', 'aria-selected': id === listaAtual ? 'true' : 'false', 'data-fid': 'aba:' + id, onclick: function () { listaAtual = id; PS.redesenhar(); } }, rot, h('small', null, pend));
    }
    var abas = [aba(TODOS, 'Todos', s.tarefas.filter(function (t) { return !t.feita; }).length)].concat(nomes.map(function (n) {
      return aba(n, n, s.tarefas.filter(function (t) { return t.lista === n && !t.feita; }).length);
    }));
    var modos = h('div', { class: 'alternador', role: 'group', 'aria-label': 'Modo de exibição' }, [['lista', 'Lista'], ['quadro', 'Quadro']].map(function (m) {
      return h('button', { class: 'btn peq' + (modoTarefas === m[0] ? ' ativo' : ''), type: 'button', 'aria-pressed': modoTarefas === m[0] ? 'true' : 'false', 'data-fid': 'tm:' + m[0], onclick: function () { modoTarefas = m[0]; PS.redesenhar(); } }, m[1]);
    }));
    var corpo;
    if (modoTarefas === 'quadro') corpo = [quadro(s, hoje, todos ? '' : listaAtual), h('p', { class: 'nota' }, 'Arraste um cartão para outra coluna ou use "Mover para". Hoje = hoje; Esta semana = domingo; Depois = daqui a 14 dias; Sem data = tira o prazo. Concluídas ficam na Lista.')];
    else {
      var ts = D.ordenarTarefas(s.tarefas.filter(function (t) { return todos || t.lista === listaAtual; }));
      corpo = ts.length ? ts.map(function (t) {
        var venc = t.vence ? (t.feita ? selo('neutro', 'calendario', U.dataCurta(t.vence)) : seloVenc('', t.vence, hoje, false)) : null;
        return h('button', { class: 'item tarefa' + (t.feita ? ' feito' : ''), type: 'button', role: 'checkbox', 'aria-checked': t.feita ? 'true' : 'false', 'data-fid': 'tr:' + t.id, onclick: function () { alternarFeita(t.id); } },
          caixa(t.feita), h('span', { class: 't' }, t.titulo, tagExemplo(t), todos ? tagLista(t) : null), seloPrio(t.prio), venc);
      }) : h('p', { class: 'vazio' }, 'Lista vazia. Adicione tarefas em Gerenciar → Tarefas.');
    }
    return h('div', null, h('h1', { class: 'titulo-tela' }, 'Tarefas'),
      h('div', { class: 'tarefas-topo' }, h('div', { class: 'abas', role: 'tablist' }, abas), modos), corpo);
  } };

  /* ---------- AGENDA ---------- */
  function detalheCompromisso(c) {
    PS.modal.abrir(c.titulo, h('div', null, h('p', null, U.dataLonga(c.data) + (c.hora ? ' às ' + c.hora : ' (dia todo)')), c.local ? h('p', null, 'Local: ' + c.local) : null, c.fonte === 'ics' ? h('p', { class: 'nota' }, 'Importado de arquivo .ics') : null), [{ rotulo: 'Fechar', tipo: 'primario' }]);
  }
  var calMes = null, calSel = null; /* mes mostrado (AAAA-MM) e dia selecionado */
  views.agenda = { reativo: true, titulo: 'Agenda', render: function () {
    var s = S.get(), ag = U.agora(), hoje = ag.iso;
    if (!calMes) calMes = U.ym(hoje);
    if (!calSel) calSel = hoje;
    var y = +calMes.slice(0, 4), m = +calMes.slice(5, 7), nDias = U.diasNoMes(y, m);
    var primeiro = calMes + '-01', desloc = U.dowIso(primeiro); /* 0 = domingo */
    var porDia = {};
    s.compromissos.forEach(function (c) { if (c.data && c.data.slice(0, 7) === calMes) (porDia[c.data] = porDia[c.data] || []).push(c); });
    function ir(n) { calMes = U.somaMes(calMes, n); calSel = U.dataNoMes(calMes, +calSel.slice(8, 10)); PS.redesenhar(); }
    var cab = U.DIAS_CURTOS.map(function (d) { return h('span', { class: 'cal-dow' }, d); });
    var celulas = [];
    for (var i = 0; i < desloc; i++) celulas.push(h('span', { class: 'cal-vazio', 'aria-hidden': 'true' }));
    for (var dia = 1; dia <= nDias; dia++) {
      (function (iso, dnum) {
        var n = (porDia[iso] || []).length;
        celulas.push(h('button', { class: 'cal-dia' + (iso === hoje ? ' hoje' : '') + (iso === calSel ? ' sel' : ''), type: 'button', 'data-fid': 'cd:' + iso, 'aria-pressed': iso === calSel ? 'true' : 'false',
          'aria-label': U.dataLonga(iso) + (n ? ', ' + n + ' compromisso' + (n > 1 ? 's' : '') : ''), onclick: function () { calSel = iso; PS.redesenhar(); } },
          h('span', { class: 'cal-num' }, String(dnum)), n ? h('span', { class: 'cal-pt' }, n > 1 ? String(n) : '') : null));
      })(calMes + '-' + U.pad(dia), dia);
    }
    var evs = D.ordenarCompromissos(porDia[calSel] || []);
    var lista = evs.length ? evs.map(function (c) {
      var passou = c.data === hoje && c.hora && (+c.hora.slice(0, 2) * 60 + +c.hora.slice(3)) < ag.h * 60 + ag.mi - 30;
      return h('button', { class: 'item' + (passou ? ' passado' : ''), type: 'button', 'data-fid': 'cp:' + c.id, onclick: function () { detalheCompromisso(c); } },
        h('span', { class: 'hora' }, c.hora || 'Dia todo'), h('span', { class: 't' }, c.titulo, tagExemplo(c)), c.local ? h('span', { class: 'meta' }, [I('pin'), ' ' + c.local]) : null);
    }) : h('p', { class: 'vazio' }, 'Sem compromissos neste dia');
    return h('div', null,
      h('h1', { class: 'titulo-tela' }, 'Agenda', h('small', null, 'mês inteiro')),
      h('div', { class: 'cal-nav' },
        h('button', { class: 'btn', type: 'button', 'data-fid': 'cal-ant', 'aria-label': 'Mês anterior', onclick: function () { ir(-1); } }, '‹'),
        h('strong', null, cap(U.MESES[m - 1]) + ' ' + y),
        h('button', { class: 'btn', type: 'button', 'data-fid': 'cal-hoje', onclick: function () { calMes = U.ym(hoje); calSel = hoje; PS.redesenhar(); } }, 'Hoje'),
        h('button', { class: 'btn', type: 'button', 'data-fid': 'cal-prox', 'aria-label': 'Próximo mês', onclick: function () { ir(1); } }, '›')),
      h('div', { class: 'cal-grade', role: 'group', 'aria-label': 'Calendário do mês' }, cab, celulas),
      h('section', { class: 'dia-agenda' }, h('h3', null, cap(U.dataLonga(calSel))), lista),
      h('p', { class: 'nota' }, 'Para cadastrar ou importar um arquivo .ics, use Gerenciar → Agenda.'));
  } };

  /* ---------- FAMÍLIA ---------- */
  views.familia = { reativo: true, titulo: 'Família', render: function () {
    var s = S.get(), hoje = U.hoje(), m0 = U.ym(hoje);
    var lems = s.lembretes.map(function (l) { var o = D.ocorrenciaVisivel(D.ocorrenciasLembrete(l, hoje), hoje); return { l: l, data: o.data, chave: o.chave, feito: o.feito }; }).sort(function (a, b) {
      if (!a.data !== !b.data) return a.data ? 1 : -1;                    /* pendências sem data primeiro */
      if (!a.data) return a.feito !== b.feito ? (a.feito ? 1 : -1) : 0;
      return a.data < b.data ? -1 : 1;
    });
    var li = lems.map(function (x) {
      return h('button', { class: 'item dupla' + (x.feito ? ' feito' : ''), type: 'button', role: 'checkbox', 'aria-checked': x.feito ? 'true' : 'false', 'data-fid': 'lm:' + x.l.id,
        onclick: function () { S.alterar(function (st) { st.lembretes.forEach(function (y) { if (y.id === x.l.id) { if (!y.dia) { y.feito = !y.feito; return; } y.feitos = y.feitos || {}; if (y.feitos[x.chave]) delete y.feitos[x.chave]; else y.feitos[x.chave] = true; } }); }); } },
        caixa(x.feito), x.l.icone ? I(x.l.icone, 'ic-fam') : null, h('span', { class: 't' }, x.l.titulo, tagExemplo(x.l), x.l.obs ? h('small', null, x.l.obs) : null),
        x.feito ? selo('ok', 'check', 'Feito') : (x.data ? seloVenc('', x.data, hoje, false) : selo(x.l.prio === 'alta' ? 'aviso' : 'neutro', x.l.prio === 'alta' ? 'alerta' : 'sino', x.l.prio === 'alta' ? 'Pendente · alta' : 'Pendente')));
    });
    return h('div', null, h('h1', { class: 'titulo-tela' }, 'Família e contas', h('small', null, 'toque OK para marcar')),
      h('div', { class: 'duas-colunas' },
        cartao('Lembretes', 'sino', li.length ? li : h('p', { class: 'vazio' }, 'Nenhum lembrete. Cadastre em Gerenciar → Família.')),
        PS.finUI.painel(s, hoje)));
  } };

  /* ---------- RELAXAR ---------- */
  views.relaxar = { reativo: true, titulo: 'Relaxar', render: function () {
    var s = S.get();
    var tiles = s.links.map(function (l, i) {
      var host = ''; try { host = new URL(l.url).host.replace(/^www\./, ''); } catch (e) { /* ok */ }
      return h('a', { class: 'tile' + (l.url.indexOf('youtube.com/tv') >= 0 ? ' destaque' : ''), href: l.url, target: '_self', rel: 'noopener', 'data-fid': 'lk:' + l.id },
        I(l.icone), h('span', null, h('strong', null, l.titulo, tagExemplo(l)), h('small', null, host)));
    });
    return h('div', null, h('h1', { class: 'titulo-tela' }, 'Relaxar', h('small', null, 'abre no mesmo navegador')),
      tiles.length ? h('div', { class: 'tiles' }, tiles) : h('p', { class: 'vazio' }, 'Nenhum atalho. Adicione em Gerenciar → Links.'),
      h('p', { class: 'nota' }, 'Dica: para voltar do YouTube ao painel, use o botão Voltar do controle.'));
  } };

  /* ---------- IMPORTAR (link de configuração) ---------- */
  views.importar = { reativo: false, titulo: 'Importar', render: function (param) {
    var dados = null, erro = null;
    try { dados = S.sanear(S.lerLink(param || '')); } catch (e) { erro = 'Link inválido ou incompleto.'; }
    if (erro) return h('div', null, h('h1', { class: 'titulo-tela' }, 'Importar configuração'), h('p', { class: 'nota aviso' }, erro + ' Peça um novo link em Gerenciar → Backup, ou use o arquivo JSON.'), h('div', { class: 'acoes' }, h('a', { class: 'btn primario', href: '#/' }, 'Voltar ao Hoje')));
    var resumo = [dados.habitos.length + ' hábitos', dados.tarefas.length + ' tarefas', dados.compromissos.length + ' compromissos', dados.lembretes.length + ' lembretes', dados.contas.length + ' contas', dados.links.length + ' links', 'cidade ' + dados.config.cidade];
    return h('div', null, h('h1', { class: 'titulo-tela' }, 'Importar configuração'),
      h('div', { class: 'cartao' }, h('p', null, 'Este link traz:'), h('p', { class: 'foco', style: 'margin-top:.4rem' }, resumo.join(' · ')),
        h('p', { class: 'nota aviso' }, 'Importar SUBSTITUI os dados atuais deste aparelho (o histórico de hábitos é mantido).')),
      h('div', { class: 'acoes' },
        h('button', { class: 'btn primario', type: 'button', onclick: function () { S.substituir(dados, true); PS.aplicarConfig(); PS.aviso('Configuração importada'); g.location.hash = '#/'; } }, 'Importar e substituir'),
        h('a', { class: 'btn', href: '#/' }, 'Cancelar')));
  } };

  /* ---------- INSTALAR (PWA no celular) ---------- */
  var promptInstalar = null;
  g.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); promptInstalar = e; });
  g.addEventListener('appinstalled', function () { promptInstalar = null; });
  views.instalar = { reativo: false, titulo: 'Instalar', render: function () {
    var base = g.location.href.split('#')[0].replace(/index\.html$/, '');
    var jaInstalado = g.matchMedia && g.matchMedia('(display-mode: standalone)').matches || g.navigator.standalone === true;
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var passosAndroid = [['Abra no Chrome', base.replace(/^https?:\/\//, '')], ['Toque nos três pontinhos ⋮', 'canto superior direito do Chrome.'], ['Toque em “Instalar app” (ou “Adicionar à tela inicial”)', 'O ícone “Casa em Ordem” aparece junto dos seus apps.'], ['Abra pelo ícone', 'Abre em tela cheia, como um app, e funciona sem internet depois da primeira vez.']];
    var passosIos = [['Abra no Safari', 'No iPhone precisa ser o Safari (não o Chrome).'], ['Toque em Compartilhar', 'o quadradinho com a seta para cima, na barra de baixo.'], ['Role e toque em “Adicionar à Tela de Início”', 'Confirme o nome “Casa em Ordem” e toque em Adicionar.'], ['Abra pelo ícone', 'Avisos de vencimento no iPhone só funcionam depois de instalar na Tela de Início (iOS 16.4 ou mais novo).']];
    function lista(ps) { return ps.map(function (p, i) { return h('div', { class: 'item dupla', style: 'min-height:2.2rem' }, h('span', { class: 'selo mag' }, String(i + 1)), h('span', { class: 't' }, p[0], h('small', null, p[1]))); }); }
    return h('div', null, h('h1', { class: 'titulo-tela' }, 'Instalar no celular'),
      jaInstalado ? h('p', { class: 'nota' }, 'Você já está usando o app instalado.') : null,
      !jaInstalado && promptInstalar ? h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'button', 'data-fid': 'in:instalar', onclick: function () { var p = promptInstalar; promptInstalar = null; p.prompt(); p.userChoice.then(function () { PS.redesenhar(); }); } }, I('baixar'), 'Instalar agora')) : null,
      h('div', { class: 'cartao' }, h('h2', null, I('globo'), h('span', null, ios ? 'iPhone (Safari)' : 'Android (Chrome)')), lista(ios ? passosIos : passosAndroid)),
      h('div', { class: 'cartao', style: 'margin-top:.6rem' }, h('h2', null, I('globo'), h('span', null, ios ? 'Android (Chrome)' : 'iPhone (Safari)')), lista(ios ? passosAndroid : passosIos)),
      h('div', { class: 'cartao', style: 'margin-top:.6rem' }, h('h2', null, I('globo'), h('span', null, 'Só no navegador')), h('p', { class: 'nota' }, 'Também funciona sem instalar: abra o endereço no navegador do celular ou do computador e salve nos favoritos. Os dados ficam salvos neste aparelho; para ter os mesmos dados nos dois celulares use Gerenciar → Sincronizar.')),
      h('div', { class: 'acoes' }, h('a', { class: 'btn', href: '#/' }, 'Voltar')));
  } };

  PS.limparClima = function () { climaMem = null; };
})(window);
