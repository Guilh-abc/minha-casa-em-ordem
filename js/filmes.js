/* Filmes e Séries: área dentro do Relaxar. Sugestões (Quero ver, Assistimos, Não interessa), lista Quero ver com sorteio,
   Assistidos com data, nota de cada um (1 a 5) e comentário, e título adicionado à mão. Coleção "filmes" entra na sincronização. ES5.  byGui */
(function (global) {
  'use strict';
  var PS = global.PS, U = PS.u, h = U.h, S = PS.store, I = PS.icone || function () { return null; };
  var SEMENTES = [
    { id: 'fs-sonho-liberdade', titulo: 'Um Sonho de Liberdade', ano: 1994, tipo: 'filme', motivo: 'Mesmo diretor de À Espera de um Milagre (Frank Darabont) e também baseado em Stephen King.' },
    { id: 'fs-nevoeiro', titulo: 'O Nevoeiro', ano: 2007, tipo: 'filme', motivo: 'De Frank Darabont, com suspense e clima de catástrofe.' },
    { id: 'fs-insonia', titulo: 'Insônia', ano: 2002, tipo: 'filme', motivo: 'Robin Williams num papel sombrio, como em Retratos de uma Obsessão.' },
    { id: 'fs-impossivel', titulo: 'O Impossível', ano: 2012, tipo: 'filme', motivo: 'O tsunami de 2004: desastre natural e história real.' },
    { id: 'fs-suspeitos', titulo: 'Os Suspeitos', ano: 2013, tipo: 'filme', motivo: 'Suspense pesado com grandes atuações.' },
    { id: 'fs-capitao-phillips', titulo: 'Capitão Phillips', ano: 2013, tipo: 'filme', motivo: 'História real, com Tom Hanks num sequestro em alto-mar.' },
    { id: 'fs-apollo-13', titulo: 'Apollo 13', ano: 1995, tipo: 'filme', motivo: 'Missão espacial real que dá errado: ficção científica com pé no chão.' },
    { id: 'fs-contato', titulo: 'Contato', ano: 1997, tipo: 'filme', motivo: 'Ficção científica inteligente, com Jodie Foster.' },
    { id: 'fs-genio-indomavel', titulo: 'Gênio Indomável', ano: 1997, tipo: 'filme', motivo: 'Grandes atuações, com Robin Williams premiado.' },
    { id: 'fs-sully', titulo: 'Sully: O Herói do Rio Hudson', ano: 2016, tipo: 'filme', motivo: 'História real com Tom Hanks.', status: 'visto', coment: 'Muito bom' }
  ];
  var aba = 'sugestao', sorteado = null, abrirNovo = false, verDescartados = false;

  function agora() { return new Date().toISOString(); }
  function todos(s) {
    var l = (s.filmes || []).slice(), tem = {};
    l.forEach(function (f) { tem[f.id] = 1; });
    SEMENTES.forEach(function (x) {
      if (tem[x.id]) return;
      l.push({ id: x.id, titulo: x.titulo, ano: x.ano, tipo: x.tipo, motivo: x.motivo, status: x.status || 'sugestao', data: '', notaG: null, notaE: null, coment: x.coment || '', semente: true });
    });
    return l;
  }
  /* grava (cria a partir da sugestão padrão, se preciso) e aplica a mudança */
  function mudar(f, fn, silencioso) {
    S.alterar(function (s) {
      if (!s.filmes) s.filmes = [];
      var x = null;
      s.filmes.forEach(function (y) { if (y.id === f.id) x = y; });
      if (!x) { x = { id: f.id, titulo: f.titulo, ano: f.ano, tipo: f.tipo, motivo: f.motivo, status: f.status, data: f.data, notaG: f.notaG, notaE: f.notaE, coment: f.coment }; s.filmes.push(x); }
      fn(x); x.atualizado = agora();
    }, silencioso);
  }
  function status(f, st) {
    mudar(f, function (x) { x.status = st; if (st === 'visto' && !x.data) x.data = U.hoje(); });
    if (sorteado === f.id) sorteado = null;
    PS.aviso && PS.aviso(st === 'quero' ? 'Foi para Quero ver' : st === 'visto' ? 'Foi para Assistidos' : st === 'nao' ? 'Não vamos mais sugerir' : 'Voltou para Sugestões');
  }
  function linhaInfo(f) {
    return h('small', { class: 'fs-info' }, [f.ano ? String(f.ano) : '', f.tipo === 'serie' ? 'Série' : 'Filme'].filter(Boolean).join(' · '));
  }
  function botao(rot, fid, fn, cls) { return h('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button', 'data-fid': fid, onclick: fn }, rot); }

  function cartaoSugestao(f) {
    return h('div', { class: 'fs-item', 'data-fid': 'fs:sug:' + f.id },
      h('strong', null, f.titulo), linhaInfo(f),
      f.motivo ? h('p', { class: 'nota fs-motivo' }, f.motivo) : null,
      h('div', { class: 'acoes fs-acoes' },
        botao('Quero ver', 'fs:quero:' + f.id, function () { status(f, 'quero'); }, 'primario'),
        botao('Assistimos', 'fs:visto:' + f.id, function () { status(f, 'visto'); }),
        botao('Não interessa', 'fs:nao:' + f.id, function () { status(f, 'nao'); })));
  }
  function estrelas(f, campo, nome) {
    var v = f[campo] || 0, bs = [];
    for (var i = 1; i <= 5; i++) (function (n) {
      bs.push(h('button', { class: 'fs-estrela' + (n <= v ? ' on' : ''), type: 'button', 'aria-label': nome + ': ' + n + ' de 5', 'aria-pressed': n <= v ? 'true' : 'false', 'data-fid': 'fs:' + campo + ':' + f.id + ':' + n,
        onclick: function () { mudar(f, function (x) { x[campo] = x[campo] === n ? null : n; }); } }, '★'));
    })(i);
    return h('div', { class: 'fs-nota' }, h('span', null, nome), h('span', { class: 'fs-estrelas' }, bs), h('small', null, v ? v + '/5' : 'sem nota'));
  }
  function cartaoVisto(f, cfg) {
    return h('div', { class: 'fs-item', 'data-fid': 'fs:visto-item:' + f.id },
      h('strong', null, f.titulo), linhaInfo(f),
      h('label', { class: 'campo' }, h('span', null, 'Assistimos em'), h('input', { type: 'date', class: 'entrada', value: f.data || '', 'data-fid': 'fs:data:' + f.id, onchange: function () { var v = this.value; mudar(f, function (x) { x.data = v; }, true); } })),
      estrelas(f, 'notaG', cfg.nome || 'Guilherme'),
      estrelas(f, 'notaE', cfg.esposa || 'Esposa'),
      h('label', { class: 'campo' }, h('span', null, 'Comentário'), h('input', { type: 'text', class: 'entrada', maxlength: '200', value: f.coment || '', placeholder: 'Ex.: vale rever', 'data-fid': 'fs:coment:' + f.id, onchange: function () { var v = this.value; mudar(f, function (x) { x.coment = v; }, true); } })),
      h('div', { class: 'acoes fs-acoes' }, botao('Voltar para Quero ver', 'fs:desver:' + f.id, function () { status(f, 'quero'); })));
  }
  function formNovo() {
    var t = h('input', { type: 'text', class: 'entrada', maxlength: '100', 'data-fid': 'fs:n-titulo', placeholder: 'Nome do filme ou série' });
    var a = h('input', { type: 'number', class: 'entrada', min: '1880', max: '2100', 'data-fid': 'fs:n-ano', placeholder: 'Ex.: 2010' });
    var tp = h('select', { class: 'entrada', 'data-fid': 'fs:n-tipo' }, h('option', { value: 'filme' }, 'Filme'), h('option', { value: 'serie' }, 'Série'));
    var m = h('input', { type: 'text', class: 'entrada', maxlength: '200', 'data-fid': 'fs:n-motivo', placeholder: 'Ex.: indicação de amigos' });
    var st = h('select', { class: 'entrada', 'data-fid': 'fs:n-status' }, h('option', { value: 'quero' }, 'Quero ver'), h('option', { value: 'sugestao' }, 'Sugestões'), h('option', { value: 'visto' }, 'Assistidos'));
    function salvar() {
      var tit = String(t.value || '').trim();
      if (!tit) { PS.aviso && PS.aviso('Escreva o nome do título'); t.focus(); return; }
      var stv = st.value;
      S.alterar(function (s) {
        if (!s.filmes) s.filmes = [];
        s.filmes.push({ id: U.uid(), titulo: tit.slice(0, 100), ano: +a.value || null, tipo: tp.value, motivo: String(m.value || '').trim(), status: stv, data: stv === 'visto' ? U.hoje() : '', notaG: null, notaE: null, coment: '', atualizado: agora() });
      }, true);
      abrirNovo = false; aba = stv; PS.aviso && PS.aviso('Título adicionado'); PS.redesenhar();
    }
    return h('div', { class: 'fs-item fs-novo', 'data-fid': 'fs:novo' },
      h('strong', null, 'Adicionar título à mão'),
      h('label', { class: 'campo' }, h('span', null, 'Título'), t),
      h('div', { class: 'fs-dupla' }, h('label', { class: 'campo' }, h('span', null, 'Ano'), a), h('label', { class: 'campo' }, h('span', null, 'Tipo'), tp)),
      h('label', { class: 'campo' }, h('span', null, 'Por que ver (opcional)'), m),
      h('label', { class: 'campo' }, h('span', null, 'Colocar em'), st),
      h('div', { class: 'acoes' }, botao('Salvar', 'fs:n-salvar', salvar, 'primario'), botao('Cancelar', 'fs:n-cancelar', function () { abrirNovo = false; PS.redesenhar(); })));
  }

  function secao() {
    var s = S.get(), cfg = s.config || {}, l = todos(s);
    function de(st) { return l.filter(function (f) { return f.status === st; }); }
    var sug = de('sugestao'), quero = de('quero'), vistos = de('visto'), nao = de('nao');
    vistos.sort(function (a, b) { return (b.data || '').localeCompare(a.data || ''); });
    var abas = [['sugestao', 'Sugestões', sug.length], ['quero', 'Quero ver', quero.length], ['visto', 'Assistidos', vistos.length]].map(function (x) {
      return h('button', { class: 'aba', type: 'button', role: 'tab', 'aria-selected': aba === x[0] ? 'true' : 'false', 'data-fid': 'fs:aba:' + x[0], onclick: function () { aba = x[0]; PS.redesenhar(); } }, x[1], h('small', null, String(x[2])));
    });
    var corpo;
    if (aba === 'quero') {
      var sor = null; quero.forEach(function (f) { if (f.id === sorteado) sor = f; });
      corpo = [
        quero.length ? h('div', { class: 'acoes' }, botao('Sortear um', 'fs:sortear', function () {
          var op = quero.length > 1 ? quero.filter(function (f) { return f.id !== sorteado; }) : quero;
          sorteado = op[Math.floor(Math.random() * op.length)].id; PS.redesenhar();
        }, 'primario')) : null,
        sor ? h('div', { class: 'fs-item fs-sorteado', 'data-fid': 'fs:sorteado' }, h('small', { class: 'selo mag' }, 'Hoje à noite'), h('strong', null, sor.titulo), linhaInfo(sor),
          sor.motivo ? h('p', { class: 'nota fs-motivo' }, sor.motivo) : null,
          h('div', { class: 'acoes fs-acoes' }, botao('Assistimos', 'fs:sor-visto', function () { status(sor, 'visto'); aba = 'visto'; }, 'primario'), botao('Sortear outro', 'fs:sor-outro', function () { var op = quero.filter(function (f) { return f.id !== sorteado; }); if (op.length) sorteado = op[Math.floor(Math.random() * op.length)].id; PS.redesenhar(); }))) : null,
        quero.length ? quero.map(function (f) {
          return h('div', { class: 'fs-item', 'data-fid': 'fs:quero-item:' + f.id }, h('strong', null, f.titulo), linhaInfo(f), f.motivo ? h('p', { class: 'nota fs-motivo' }, f.motivo) : null,
            h('div', { class: 'acoes fs-acoes' }, botao('Assistimos', 'fs:q-visto:' + f.id, function () { status(f, 'visto'); }, 'primario'), botao('Tirar da lista', 'fs:q-tirar:' + f.id, function () { status(f, 'sugestao'); })));
        }) : h('p', { class: 'vazio' }, 'Nada na lista ainda. Em Sugestões, toque em Quero ver.')];
    } else if (aba === 'visto') {
      corpo = vistos.length ? vistos.map(function (f) { return cartaoVisto(f, cfg); }) : h('p', { class: 'vazio' }, 'Nenhum assistido ainda.');
    } else {
      corpo = [sug.length ? sug.map(cartaoSugestao) : h('p', { class: 'vazio' }, 'Sem sugestões no momento. Adicione um título à mão.'),
        nao.length ? h('div', { class: 'acoes' }, botao((verDescartados ? 'Esconder' : 'Ver') + ' os que não interessam (' + nao.length + ')', 'fs:ver-nao', function () { verDescartados = !verDescartados; PS.redesenhar(); })) : null,
        verDescartados ? nao.map(function (f) { return h('div', { class: 'fs-item fs-descartado' }, h('strong', null, f.titulo), linhaInfo(f), h('div', { class: 'acoes fs-acoes' }, botao('Voltar para Sugestões', 'fs:volta:' + f.id, function () { status(f, 'sugestao'); }))); }) : null];
    }
    return h('section', { class: 'cartao fs', 'data-fid': 'fs:area', style: 'margin-top:.8rem' },
      h('h2', null, I('filme'), h('span', null, 'Filmes e Séries')),
      h('p', { class: 'nota' }, 'Para escolher o que ver à noite. Sugestões pensadas no gosto de vocês: suspense com ação, desastres naturais, histórias reais, ficção científica e grandes atuações.'),
      h('div', { class: 'abas', role: 'tablist' }, abas),
      abrirNovo ? formNovo() : h('div', { class: 'acoes', style: 'margin-top:0;margin-bottom:.5rem' }, botao('Adicionar título', 'fs:adicionar', function () { abrirNovo = true; PS.redesenhar(); })),
      h('div', { class: 'fs-lista' }, corpo));
  }

  var rel = PS.views && PS.views.relaxar;
  if (rel) {
    var orig = rel.render;
    rel.render = function (p) { var el = orig.call(this, p); try { el.appendChild(secao()); } catch (e) { console.error(e); } return el; };
  }
  PS.filmes = { SEMENTES: SEMENTES, todos: todos };
})(window);
