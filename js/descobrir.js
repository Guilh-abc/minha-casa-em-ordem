/* Descobrir (Filmes e Séries): cartões estilo arrastar. Direita ou coração vai para Quero ver, esquerda ou X descarta,
   Já assistimos vai para Assistidos, Desfazer volta o último. Dados da TMDB via Worker do Ajudante (/tmdb, chave só no servidor).
   Sugestões partem do que vocês aprovaram, assistiram e avaliaram bem, e de gêneros favoritos; sem animação nem musical. ES5.  byGui */
(function (g) {
  'use strict';
  var PS = g.PS, U = PS.u, h = U.h, S = PS.store, I = PS.icone || function () { return null; };
  var BASE = (g.MCO_ASSISTENTE_URL || 'https://minha-casa-assistente.guilhermeromionetto.workers.dev') + '/tmdb';
  var IMG = 'https://image.tmdb.org/t/p/w500';
  var GEN = { 28: 'Ação', 12: 'Aventura', 16: 'Animação', 35: 'Comédia', 80: 'Crime', 99: 'Documentário', 18: 'Drama', 10751: 'Família', 14: 'Fantasia', 36: 'História', 27: 'Terror', 10402: 'Música', 9648: 'Mistério', 10749: 'Romance', 878: 'Ficção científica', 10770: 'Filme de TV', 53: 'Suspense', 10752: 'Guerra', 37: 'Faroeste',
    10759: 'Ação e aventura', 10762: 'Infantil', 10763: 'Notícias', 10764: 'Reality', 10765: 'Ficção científica e fantasia', 10766: 'Novela', 10767: 'Talk show', 10768: 'Guerra e política' };
  var FORA = [16, 10402, 10751, 10762, 10764, 10767, 10763, 10766, 99];   /* nada de animação, musical, infantil, reality */
  var BASE_GOSTO = [{ tm: 'movie', id: 497, t: 'À Espera de um Milagre' }, { tm: 'movie', id: 9357, t: 'Retratos de uma Obsessão' }];
  var DISCOVER = [
    { tm: 'movie', g: '53', m: 'Suspense, como vocês curtem' }, { tm: 'movie', g: '28,53', m: 'Suspense com ação' }, { tm: 'movie', g: '878', m: 'Ficção científica bem avaliada' },
    { tm: 'movie', g: '36', m: 'Baseado em história real' }, { tm: 'movie', g: '18', m: 'Drama com grandes atuações' }, { tm: 'movie', g: '18', k: '10617', m: 'Desastre natural' },
    { tm: 'tv', g: '80', m: 'Série de suspense e crime' }, { tm: 'tv', g: '10765', m: 'Série de ficção científica' }, { tm: 'tv', g: '18', m: 'Série de drama bem avaliada' }, { tm: 'tv', g: '9648', m: 'Série de mistério' }];
  var fila = [], vistos = {}, carregando = false, erro = '', historico = [], det = {}, ctx = null, iniciado = false;

  function chave(tm, id) { return tm + ':' + id; }
  function api(p, q) {
    var u = BASE + '?p=' + encodeURIComponent(p);
    Object.keys(q || {}).forEach(function (k) { u += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); });
    return fetch(u, { method: 'GET', credentials: 'omit' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.erro || ('Erro ' + r.status)); return j; });
    });
  }
  function conhecidos(l) {
    var k = {};
    l.forEach(function (f) { if (f.tmdb) k[chave(f.tm || 'movie', f.tmdb)] = 1; });
    BASE_GOSTO.forEach(function (b) { k[chave(b.tm, b.id)] = 1; });
    return k;
  }
  function sementes(l) {
    var s = BASE_GOSTO.map(function (b) { return { tm: b.tm, id: b.id, t: b.t, peso: 3, assistido: true }; });
    l.forEach(function (f) {
      if (!f.tmdb || f.status === 'nao') return;
      var bom = f.status === 'visto' && !((f.notaG && f.notaG < 3) || (f.notaE && f.notaE < 3));
      var otimo = f.status === 'visto' && ((f.notaG || 0) >= 4 || (f.notaE || 0) >= 4);
      if (f.status === 'quero' || f.status === 'sugestao' || bom) s.push({ tm: f.tm || 'movie', id: f.tmdb, t: f.titulo, peso: otimo ? 4 : bom ? 3 : f.status === 'quero' ? 2 : 1, assistido: f.status === 'visto' });
    });
    return s;
  }
  function sortear(a, n) { a = a.slice(); var o = []; while (a.length && o.length < n) { var tot = a.reduce(function (s, x) { return s + (x.peso || 1); }, 0), r = Math.random() * tot, i = 0; while (i < a.length - 1 && (r -= (a[i].peso || 1)) > 0) i++; o.push(a.splice(i, 1)[0]); } return o; }
  function ok(x) { return x && x.id && x.poster_path && (x.genre_ids || []).every(function (gid) { return FORA.indexOf(gid) < 0; }) && (x.vote_count || 0) >= 50 && !x.adult; }
  function cand(x, tm, motivo) {
    var data = x.release_date || x.first_air_date || '';
    return { tm: tm, tmdb: x.id, titulo: x.title || x.name || 'Título', ano: data ? +data.slice(0, 4) : null, poster: x.poster_path, nota: x.vote_average || null, generos: (x.genre_ids || []).map(function (i) { return GEN[i]; }).filter(Boolean).slice(0, 3), sinopse: x.overview || '', motivo: motivo };
  }
  function abastecer() {
    if (carregando || !ctx) return;
    carregando = true; erro = '';
    var l = ctx.todos, ja = conhecidos(l), sem = sortear(sementes(l), 4), disc = sortear(DISCOVER, 2), pedidos = [];
    sem.forEach(function (s) {
      pedidos.push(api(s.tm + '/' + s.id + '/recommendations', { page: 1 }).then(function (j) { return (j.results || []).map(function (x) { return [x, s.tm, (s.assistido ? 'Porque vocês gostaram de ' : 'Parecido com ') + s.t]; }); }).catch(function (e) { erro = e.message; return []; }));
    });
    disc.forEach(function (d) {
      var q = { with_genres: d.g, without_genres: '16,10402,10751', sort_by: 'vote_average.desc', 'vote_count.gte': d.tm === 'tv' ? 300 : 1000, page: 1 + Math.floor(Math.random() * 3) };
      if (d.k) q.with_keywords = d.k;
      pedidos.push(api('discover/' + d.tm, q).then(function (j) { return (j.results || []).map(function (x) { return [x, d.tm, d.m]; }); }).catch(function (e) { erro = e.message; return []; }));
    });
    Promise.all(pedidos).then(function (grupos) {
      var novos = [], fl = {}; fila.forEach(function (c) { fl[chave(c.tm, c.tmdb)] = 1; });
      var max = 0; grupos.forEach(function (gr) { max = Math.max(max, gr.length); });
      for (var i = 0; i < max; i++) grupos.forEach(function (gr) {   /* intercala as fontes */
        var it = gr[i]; if (!it || !ok(it[0])) return;
        var k = chave(it[1], it[0].id); if (ja[k] || vistos[k] || fl[k]) return;
        fl[k] = 1; novos.push(cand(it[0], it[1], it[2]));
      });
      fila = fila.concat(novos.slice(0, 40));
      if (novos.length) erro = '';
      carregando = false; PS.redesenhar();
    });
  }
  function detalhes(c) {
    var k = chave(c.tm, c.tmdb);
    if (det[k]) return det[k];
    det[k] = { carregando: true };
    api(c.tm + '/' + c.tmdb, { append_to_response: 'credits,watch/providers' }).then(function (j) {
      var cr = j.credits || {}, dir = [];
      if (c.tm === 'tv') dir = (j.created_by || []).map(function (p) { return p.name; });
      else dir = (cr.crew || []).filter(function (p) { return p.job === 'Director'; }).map(function (p) { return p.name; });
      var pr = ((j['watch/providers'] || {}).results || {}).BR || {};
      function nomes(a) { var o = []; (a || []).forEach(function (p) { var n = p.provider_name || ''; if (n && !o.some(function (x) { return n.indexOf(x) === 0; })) o.push(n); }); return o.slice(0, 4); }
      det[k] = { dir: dir.slice(0, 2), atores: (cr.cast || []).slice(0, 3).map(function (p) { return p.name; }), assinatura: nomes(pr.flatrate), aluguel: nomes(pr.rent).length ? nomes(pr.rent) : nomes(pr.buy), temporadas: j.number_of_seasons || null, duracao: j.runtime || null,
        generos: (j.genres || []).map(function (x) { return x.name; }).slice(0, 3) };
      PS.redesenhar();
    }).catch(function () { det[k] = { falhou: true }; PS.redesenhar(); });
    return det[k];
  }
  function decidir(st) {
    var c = fila[0]; if (!c || !ctx) return;
    var id = 'tm-' + c.tm + '-' + c.tmdb, antes = null;
    (S.get().filmes || []).forEach(function (f) { if (f.id === id) antes = JSON.parse(JSON.stringify(f)); });
    historico.push({ c: c, id: id, antes: antes });
    if (historico.length > 30) historico.shift();
    vistos[chave(c.tm, c.tmdb)] = 1;
    fila.shift();
    ctx.mudar({ id: id, titulo: c.titulo, ano: c.ano, tipo: c.tm === 'tv' ? 'serie' : 'filme', motivo: c.motivo, status: st, data: '', notaG: null, notaE: null, coment: '', tmdb: c.tmdb, tm: c.tm, poster: c.poster },
      function (x) { x.status = st; if (st === 'visto' && !x.data) x.data = U.hoje(); });
    PS.aviso && PS.aviso(st === 'quero' ? 'Foi para Quero ver' : st === 'visto' ? 'Foi para Assistidos' : 'Descartado');
    if (fila.length < 4) abastecer();
  }
  function desfazer() {
    var u = historico.pop(); if (!u) return;
    delete vistos[chave(u.c.tm, u.c.tmdb)];
    fila.unshift(u.c);
    S.alterar(function (s) {
      s.filmes = (s.filmes || []).filter(function (f) { return f.id !== u.id; });
      if (u.antes) s.filmes.push(u.antes);
    });
    PS.aviso && PS.aviso('Desfeito');
  }
  function arrastar(el) {
    var x0 = null, dx = 0, id = null;
    function fim() {
      if (x0 === null) return;
      x0 = null; el.classList.remove('arrastando');
      if (dx > 90) { el.style.transform = 'translateX(120%) rotate(18deg)'; setTimeout(function () { decidir('quero'); }, 120); }
      else if (dx < -90) { el.style.transform = 'translateX(-120%) rotate(-18deg)'; setTimeout(function () { decidir('nao'); }, 120); }
      else { el.style.transform = ''; el.removeAttribute('data-dir'); }
    }
    el.addEventListener('pointerdown', function (e) { if (e.target.closest('button,a')) return; x0 = e.clientX; dx = 0; id = e.pointerId; try { el.setPointerCapture(id); } catch (er) { /* ok */ } el.classList.add('arrastando'); });
    el.addEventListener('pointermove', function (e) {
      if (x0 === null) return; dx = e.clientX - x0;
      el.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 20) + 'deg)';
      el.setAttribute('data-dir', dx > 40 ? 'quero' : dx < -40 ? 'nao' : '');
    });
    el.addEventListener('pointerup', fim); el.addEventListener('pointercancel', fim);
  }
  function lista(rot, a) { return a && a.length ? h('p', { class: 'ds-linha' }, h('span', null, rot + ': '), a.join(', ')) : null; }
  function cartao(c) {
    var d = detalhes(c), gen = (d.generos && d.generos.length ? d.generos : c.generos).join(', ');
    var sin = c.sinopse.length > 240 ? c.sinopse.slice(0, 237).replace(/\s+\S*$/, '') + '...' : c.sinopse;
    var onde = d.carregando ? h('p', { class: 'ds-linha' }, 'Carregando onde assistir...') : d.falhou ? null
      : d.assinatura && d.assinatura.length ? lista('Onde assistir', d.assinatura)
      : d.aluguel && d.aluguel.length ? lista('Para alugar ou comprar', d.aluguel) : h('p', { class: 'ds-linha' }, 'Sem streaming informado no Brasil.');
    var el = h('article', { class: 'ds-cartao', 'data-fid': 'ds:cartao', 'data-tmdb': c.tm + ':' + c.tmdb },
      h('div', { class: 'ds-poster' }, h('img', { src: IMG + c.poster, alt: 'Pôster de ' + c.titulo, loading: 'eager', draggable: 'false' }),
        h('span', { class: 'ds-selo quero' }, 'QUERO VER'), h('span', { class: 'ds-selo nao' }, 'NÃO')),
      h('div', { class: 'ds-info' },
        h('strong', { class: 'ds-titulo' }, c.titulo),
        h('p', { class: 'ds-meta' }, [c.ano ? String(c.ano) : '', c.tm === 'tv' ? 'Série' : 'Filme', c.nota ? 'TMDB ' + c.nota.toFixed(1).replace('.', ',') : '', d.duracao ? d.duracao + ' min' : '', d.temporadas ? d.temporadas + (d.temporadas > 1 ? ' temporadas' : ' temporada') : ''].filter(Boolean).join(' · ')),
        gen ? h('p', { class: 'ds-linha' }, gen) : null,
        h('p', { class: 'ds-motivo' }, I('estrela'), c.motivo),
        lista(c.tm === 'tv' ? 'Criação' : 'Direção', d.dir), lista('Com', d.atores),
        sin ? h('p', { class: 'ds-sinopse' }, sin) : null,
        onde));
    arrastar(el);
    return el;
  }
  function render(c) {
    ctx = c;
    if (!iniciado) { iniciado = true; abastecer(); }
    var atual = fila[0];
    var corpo = atual ? cartao(atual)
      : carregando ? h('p', { class: 'vazio', 'data-fid': 'ds:carregando' }, 'Buscando sugestões para vocês...')
      : h('div', null, h('p', { class: 'vazio' }, erro ? 'Não consegui buscar sugestões agora (' + erro + ').' : 'Acabaram as sugestões desta rodada.'),
        h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'button', 'data-fid': 'ds:mais', onclick: function () { abastecer(); PS.redesenhar(); } }, 'Buscar mais')));
    if (atual && fila[1]) { var pre = new Image(); pre.src = IMG + fila[1].poster; }
    return h('div', { class: 'ds', 'data-fid': 'ds:area' },
      h('p', { class: 'nota' }, 'Arraste para a direita para Quero ver, para a esquerda para descartar.'),
      corpo,
      h('div', { class: 'ds-botoes' },
        h('button', { class: 'ds-bt nao', type: 'button', 'aria-label': 'Descartar', 'data-fid': 'ds:nao', disabled: atual ? null : 'disabled', onclick: function () { decidir('nao'); } }, I('x')),
        h('button', { class: 'ds-bt desfazer', type: 'button', 'aria-label': 'Desfazer', 'data-fid': 'ds:desfazer', disabled: historico.length ? null : 'disabled', onclick: desfazer }, I('desfazer')),
        h('button', { class: 'ds-bt visto', type: 'button', 'aria-label': 'Já assistimos', 'data-fid': 'ds:visto', disabled: atual ? null : 'disabled', onclick: function () { decidir('visto'); } }, I('check'), h('span', null, 'Já assistimos')),
        h('button', { class: 'ds-bt quero', type: 'button', 'aria-label': 'Quero ver', 'data-fid': 'ds:quero', disabled: atual ? null : 'disabled', onclick: function () { decidir('quero'); } }, I('coracao'))),
      h('p', { class: 'ds-tmdb', 'data-fid': 'ds:tmdb' }, 'Dados e imagens de ', h('a', { href: 'https://www.themoviedb.org/', target: '_blank', rel: 'noopener' }, 'TMDB'),
        '. Este produto usa a API da TMDB, mas não é endossado nem certificado pela TMDB. Onde assistir: JustWatch, via TMDB.'));
  }
  PS.descobrir = { render: render, _fila: function () { return fila; }, _reiniciar: function () { fila = []; vistos = {}; historico = []; det = {}; iniciado = false; carregando = false; } };
})(window);
