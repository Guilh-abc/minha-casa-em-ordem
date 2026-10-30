/* Telas financeiras: "Atenção agora" (Hoje), painel de contas/faturas (Família): Em aberto · Pagas · Histórico, e avisos. ES5. */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, h = U.h, I = PS.icone, S = PS.store, F = PS.fin;
  var NIVEL = { vencida: ['perigo', 'alerta'], hoje: ['perigo', 'sino'], amanha: ['aviso', 'sino'], semana: ['neutro', 'calendario'] };
  var aba = 'abertas', filtroForma = '';

  function brl(v) { return v == null ? '' : U.valorBRL(v); }
  function seloNivel(p) { var n = NIVEL[p.nivel], cl = (p.nivel === 'semana' && p.dias <= 5) ? 'aviso' : n[0]; var cp = p.dias < 0 ? (-p.dias) + ' d atraso' : p.dias === 0 ? 'Hoje' : p.dias === 1 ? 'Amanhã' : 'em ' + p.dias + ' d';
    return h('span', { class: 'selo ' + cl, 'aria-label': F.rotuloNivel(p.dias) }, I(n[1]), h('span', { class: 'lg' }, F.rotuloNivel(p.dias)), h('span', { class: 'cp' }, cp)); }
  /* texto de apoio da conta: data · valor (ou "sem valor", discreto) · aviso da forma de pagamento */
  function apoio(p, comData) {
    var sv = p.tipo === 'conta' && p.valor == null ? ' · sem valor' : '';
    return [(comData || '') + (p.valor != null && p.tipo !== 'lembrete' ? ' · ' + brl(p.valor) : ''), sv ? h('span', { class: 'sv' }, sv) : null, p.aviso ? ' · ' + p.aviso : ''];
  }
  function dataBR(d) { return d ? d.split('-').reverse().join('/') : ''; }

  /* ---------- Atenção agora (Hoje) ---------- */
  function atencao(s, hoje, max) {
    var pend = F.pendencias(s, hoje, 7), r = F.resumo(pend);
    var cab = h('h2', null, I(r.urgentes ? 'alerta' : 'check'), h('span', null, 'Atenção agora'),
      r.total ? h('span', { class: 'mais' }, (r.vencidas ? r.vencidas + (r.vencidas > 1 ? ' vencidas' : ' vencida') + ' · ' : '') + r.total + (r.total > 1 ? ' itens' : ' item')) : null);
    var corpo;
    if (!pend.length) {
      corpo = h('p', { class: 'tudo-em-dia' }, I('check'), h('span', null, 'Tudo em dia', h('small', null, 'Nenhuma conta, fatura ou lembrete vencendo nos próximos 7 dias.')));
    } else {
      var mostra = pend.slice(0, max || 4);
      corpo = h('div', { class: 'atencao-lista' }, mostra.map(function (p) {
        return h('a', { class: 'atencao-item ' + p.nivel + (p.destaque && p.nivel === 'semana' ? ' prox' : '') + (p.aviso ? ' com-aviso' : ''), href: p.href, 'data-fid': 'at:' + p.tipo + p.id + p.chave },
          I(p.icone), h('span', { class: 't' }, p.titulo, h('small', null, apoio(p, dataBR(p.data).slice(0, 5)))), seloNivel(p));
      }));
      if (pend.length > mostra.length) corpo.appendChild(h('a', { class: 'atencao-mais', href: '#/familia', 'data-fid': 'at:mais' }, '+' + (pend.length - mostra.length) + ' em Família'));
    }
    return h('section', { class: 'cartao atencao' + (r.urgentes ? ' urgente' : ''), 'aria-live': 'polite' }, cab, corpo);
  }

  /* ---------- marcar paga (manual; nunca implica pagamento real) ---------- */
  function marcar(p) {
    var inp = h('input', { type: 'date', value: U.hoje(), max: U.somaDias(U.hoje(), 1), 'data-fid': 'mp:data', 'aria-label': 'Data do pagamento' });
    PS.modal.abrir('Marcar como paga?', h('div', null,
      h('p', null, p.titulo + (p.valor != null ? ' · ' + brl(p.valor) : '') + ' · vence ' + dataBR(p.data)),
      h('label', { class: 'campo' }, h('span', null, 'Data em que você pagou'), inp),
      h('p', { class: 'nota' }, 'Isto só registra no painel. Não paga nada e não consulta o banco.')),
    [{ rotulo: 'Marcar como paga', acao: function () {
      S.alterar(function (st) { F.marcarPaga(st, p.tipo, p.id, p.chave, inp.value); });
      PS.aviso('Marcada como paga em ' + dataBR(inp.value));
    } }, { rotulo: 'Cancelar' }]);
  }
  function desfazer(p) {
    S.alterar(function (st) { F.desfazerPaga(st, p.tipo, p.id, p.chave); });
    PS.aviso('Desfeito: voltou para "Em aberto"');
  }

  /* ---------- detalhe da conta (toque no cartão) com Editar ---------- */
  function contaPorId(id) { var l = S.get().contas || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function detalhe(p) {
    if (p.tipo !== 'conta') { if (p.href && p.href !== '#/familia') location.hash = p.href; return; }
    var corpo = h('div', { class: 'det-conta', 'data-fid': 'dc:corpo' }), editando = false, mudou = false;
    function info(rot, v) { return v === '' || v == null ? null : h('div', { class: 'det-linha' }, h('dt', null, rot), h('dd', null, v)); }
    function desenhar() {
      var c = contaPorId(p.id); U.limpar(corpo);
      if (!c) { corpo.appendChild(h('p', { class: 'vazio' }, 'Conta não encontrada.')); return; }
      if (editando) {
        var G = PS.gerenciar, m0 = U.ym(U.hoje());
        var campos = G.camposConta(m0).filter(function (f) { return !f.mostrar || f.mostrar(c); });
        corpo.appendChild(h('div', { class: 'campos', 'data-fid': 'dc:form' }, campos.map(function (f) {
          return G.campoEl(c, f, function (item, ff, v) {
            S.alterar(function () { if (ff.set) ff.set(item, v); else if (ff.tipo === 'number') item[ff.k] = v === '' ? null : Number(v); else item[ff.k] = v; item.exemplo = false; }, true);
            mudou = true; if (ff.redesenha) desenhar();
          });
        })));
        corpo.appendChild(h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'button', 'data-fid': 'dc:concluir', onclick: function () { editando = false; desenhar(); PS.aviso('Conta atualizada'); var b = corpo.querySelector('[data-fid="dc:editar"]'); if (b) b.focus(); } }, I('check'), 'Concluir edição')));
        var pr = corpo.querySelector('input, select'); if (pr) pr.focus();
        return;
      }
      var d = F.detalheConta(c, U.hoje()), donos = { gui: 'Gui', esposa: S.get().config.esposa, casal: 'Casal' };
      corpo.appendChild(h('dl', { class: 'det-info' },
        info('Nome', c.titulo), info('Valor', c.valor != null ? brl(c.valor) : 'Sem valor'), info('Vencimento', d.proximo ? dataBR(d.proximo) : ''),
        info('Categoria', NOME_CAT[c.cat] || c.cat), info('Forma de pagamento', c.forma ? F.rotuloForma(c.forma) : 'Não definida'),
        info('Recorrência', d.recorrencia + (c.arquivada ? ' (arquivada)' : '')), info('De quem', donos[c.dono] || ''), info('Observações', c.obs || ''), info('Fatura vinculada', c.cartaoRef || '')));
      corpo.appendChild(h('h3', { class: 'det-tit' }, 'Histórico de pagamentos'));
      corpo.appendChild(d.historico.length ? h('ul', { class: 'det-hist', 'data-fid': 'dc:hist' }, d.historico.slice(0, 24).map(function (x) {
        return h('li', null, h('span', null, x.mes ? mesRot(x.mes) : 'Pagamento'), h('span', null, x.pagaEm ? 'pago em ' + dataBR(x.pagaEm) : 'pago'), h('span', null, x.valor != null ? brl(x.valor) : ''));
      })) : h('p', { class: 'vazio', 'data-fid': 'dc:hist' }, 'Nenhum pagamento registrado ainda.'));
      corpo.appendChild(h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'button', 'data-fid': 'dc:editar', onclick: function () { editando = true; desenhar(); } }, I('lapis'), 'Editar')));
    }
    desenhar();
    PS.modal.abrir(p.titulo, corpo, [{ rotulo: 'Fechar', acao: function () { if (mudou) PS.redesenhar(); } }]);
    var b = corpo.querySelector('[data-fid="dc:editar"]'); if (b) b.focus();
  }

  /* ---------- linha de conta/fatura ---------- */
  function linha(p, paga) {
    var sel = paga ? h('span', { class: 'selo ok' }, I('check'), 'Paga' + (p.pagaEm ? ' em ' + dataBR(p.pagaEm).slice(0, 5) : '')) : seloNivel(p);
    return h('div', { class: 'conta-linha' + (paga ? ' feito' : '') + (!paga && p.aviso ? ' com-aviso' : '') },
      h(p.tipo === 'conta' ? 'button' : 'span', p.tipo === 'conta' ? { class: 'cl-info cl-abrir', type: 'button', 'data-fid': 'dc:' + p.id + p.chave, 'aria-label': 'Ver detalhes de ' + p.titulo, onclick: function () { detalhe(p); } } : { class: 'cl-info' },
        I(p.icone), h('span', { class: 't' }, p.titulo, h('small', null, apoio(paga ? { tipo: 'x', valor: p.valor } : p, (paga ? 'Venceu ' : 'Vence ') + dataBR(p.data).slice(0, 5) + (p.anual ? ' (anual)' : '')), p.obs ? ' · ' + p.obs : null))),
      p.forma ? h('span', { class: 'selo neutro forma', 'data-forma': p.forma }, F.rotuloForma(p.forma)) : null,
      sel,
      paga ? h('button', { class: 'btn peq', type: 'button', 'data-fid': 'dz:' + p.tipo + p.id + p.chave, onclick: function () { desfazer(p); } }, I('desfazer'), 'Desfazer')
        : h('button', { class: 'btn peq primario', type: 'button', 'data-fid': 'mp:' + p.tipo + p.id + p.chave, onclick: function () { marcar(p); } }, I('check'), 'Marcar paga'));
  }

  /* ---------- histórico (SVG inline) ---------- */
  var MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function mesRot(m) { return MES_CURTO[+m.slice(5) - 1] + '/' + m.slice(2, 4); }
  function barras(meses) {
    var max = 1; meses.forEach(function (m) { if (m.total > max) max = m.total; });
    var W = 300, H = 110, bw = W / meses.length, ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + (H + 18)); svg.setAttribute('class', 'graf-barras'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Gasto por mês: ' + meses.map(function (m) { return mesRot(m.mes) + ' ' + brl(m.total); }).join('; '));
    meses.forEach(function (m, i) {
      var hh = Math.max(m.total > 0 ? 3 : 0, Math.round(m.total / max * (H - 14))), x = i * bw + bw * .2, w = bw * .6;
      var rc = document.createElementNS(ns, 'rect'); rc.setAttribute('x', x); rc.setAttribute('y', H - hh); rc.setAttribute('width', w); rc.setAttribute('height', hh); rc.setAttribute('rx', 3);
      rc.setAttribute('class', i === meses.length - 1 ? 'b-atual' : 'b-ant'); svg.appendChild(rc);
      var t = document.createElementNS(ns, 'text'); t.setAttribute('x', x + w / 2); t.setAttribute('y', H + 13); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'b-rot'); t.textContent = mesRot(m.mes); svg.appendChild(t);
    });
    return svg;
  }
  function deltaTxt(c) {
    if (!c) return h('span', { class: 'delta neutro' }, '—');
    var ic = c.dir === 'subiu' ? 'subiu' : c.dir === 'caiu' ? 'caiu' : 'igual';
    var txt = c.dir === 'igual' ? 'igual' : (c.dir === 'subiu' ? 'subiu ' : 'caiu ') + brl(Math.abs(c.dv)) + (c.pct != null ? ' (' + Math.abs(c.pct).toString().replace('.', ',') + '%)' : '');
    return h('span', { class: 'delta ' + c.dir }, I(ic), txt);
  }
  var NOME_CAT = { mercado: 'Mercado', restaurante: 'Restaurantes/delivery', transporte: 'Transporte', saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer/streaming', assinaturas: 'Assinaturas', casa: 'Casa/contas', compras: 'Compras', viagens: 'Viagens', outros: 'Outros' };
  PS.nomeCat = function (c) { return NOME_CAT[c] || c; };
  function historico(s, hoje) {
    var H = F.historico(s, hoje, 6), ms = H.meses.filter(function (m) { return m.temDados || true; });
    var tem = ms.some(function (m) { return m.total > 0; });
    if (!tem) return h('p', { class: 'vazio' }, 'Ainda sem valores nos meses. Cadastre o valor das contas em Gerenciar → Família e marque como paga; as faturas entram em Cartões.');
    var linhas = ms.slice().reverse().map(function (m) {
      return h('tr', null, h('th', { scope: 'row' }, mesRot(m.mes)), h('td', null, brl(m.contas)), h('td', null, brl(m.faturas)), h('td', null, h('strong', null, brl(m.total))), h('td', null, deltaTxt(m.vs)));
    });
    var cats = H.porCategoria.filter(function (c) { return c.atual || c.anterior; }).slice(0, 6).map(function (c) {
      return h('tr', null, h('th', { scope: 'row' }, NOME_CAT[c.cat] || c.cat), h('td', null, brl(c.anterior)), h('td', null, brl(c.atual)), h('td', null, deltaTxt(c)));
    });
    var catsAtual = H.porCategoria.filter(function (c) { return c.atual > 0; }).map(function (c) { return { id: c.cat, rotulo: NOME_CAT[c.cat] || c.cat, valor: c.atual, cor: PS.graf.corDe(c.cat), icone: PS.graf.iconeCat(c.cat) }; });
    return h('div', { class: 'hist' }, PS.graf.barras(ms.map(function (m) { return { mes: m.mes, total: m.total, vs: m.vs }; }), { titulo: 'Gasto por mês (contas + faturas)' }),
      catsAtual.length ? h('div', null, h('h3', null, 'Este mês por categoria'), PS.graf.donut(catsAtual, { titulo: 'Este mês por categoria', centro: 'No mês' })) : null,
      h('table', { class: 'tab-hist' }, h('caption', null, 'Mês a mês (contas de casa + faturas)'), h('thead', null, h('tr', null, ['Mês', 'Contas', 'Faturas', 'Total', 'vs. mês anterior'].map(function (x) { return h('th', { scope: 'col' }, x); }))), h('tbody', null, linhas)),
      cats.length ? h('table', { class: 'tab-hist' }, h('caption', null, 'Por categoria: mês passado → este mês'), h('thead', null, h('tr', null, ['Categoria', 'Anterior', 'Atual', 'Variação'].map(function (x) { return h('th', { scope: 'col' }, x); }))), h('tbody', null, cats)) : null);
  }

  /* ---------- avisos / calendário ---------- */
  function painelAvisos(s) {
    var L = PS.lembretes, sup = L ? L.suporte() : {}, c = s.config;
    var ligado = L && L.ativo();
    var botoes = [];
    botoes.push(h('button', { class: 'btn', type: 'button', 'data-fid': 'av:ics', onclick: function () {
      var ics = F.icsDasPendencias(S.get(), U.hoje(), S.get().config.antecedencia, new Date().toISOString());
      PS.arq.baixar('contas-minha-casa-em-ordem.ics', ics, 'text/calendar'); PS.aviso('Arquivo .ics baixado: abra no calendário do celular');
    } }, I('baixar'), 'Adicionar ao calendário (.ics)'));
    if (sup.notif) botoes.push(h('button', { class: 'btn' + (ligado ? '' : ' primario'), type: 'button', 'data-fid': 'av:notif', onclick: function () {
      if (ligado) { L.desativar(); PS.aviso('Avisos neste aparelho desligados'); PS.redesenhar(); } else L.ativar().then(function (r) { PS.aviso(r.msg); PS.redesenhar(); });
    } }, I('sino'), ligado ? 'Desligar avisos neste aparelho' : 'Ativar avisos neste aparelho'));
    var antec = [7, 3, 2, 1, 0].map(function (d) {
      var on = c.antecedencia.indexOf(d) >= 0;
      return h('button', { class: 'btn peq' + (on ? ' ativo' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', 'data-fid': 'av:a' + d, onclick: function () {
        S.alterar(function (st) { var l = st.config.antecedencia.slice(); var i = l.indexOf(d); if (i >= 0) { if (l.length > 1) l.splice(i, 1); } else l.push(d); st.config.antecedencia = l.sort(function (a, b) { return b - a; }); });
      } }, (on ? '✓ ' : '') + (d === 0 ? 'no dia' : d + (d === 1 ? ' dia antes' : ' dias antes')));
    });
    return h('div', { class: 'avisos' }, h('h3', null, 'Lembretes de vencimento'),
      h('p', { class: 'nota' }, 'Avisar com antecedência: '), h('div', { class: 'acoes' }, antec),
      h('div', { class: 'acoes' }, botoes),
      h('p', { class: 'nota' }, L ? L.textoHonesto() : ''));
  }

  function totais(s, hoje) {
    var t = F.totaisDoMes(s, hoje);
    return h('div', { class: 'totais-wrap' }, PS.graf.pagoAberto(t.pago, t.aPagar), h('div', { class: 'totais-mes', 'aria-label': 'Totais do mês' },
      h('div', null, h('small', null, 'A pagar neste mês'), h('strong', null, brl(t.aPagar))),
      h('div', { class: 'pago' }, h('small', null, 'Já pago'), h('strong', null, brl(t.pago))),
      h('div', null, h('small', null, 'Contas'), h('strong', null, t.nPagas + '/' + t.n))));
  }

  /* ---------- contas fixas sugeridas ---------- */
  function adicionarFixas() {
    var r = null;
    S.alterar(function (st) { r = F.adicionarFixas(st, U.hoje()); });
    PS.aviso(r.adicionadas ? r.adicionadas + (r.adicionadas > 1 ? ' contas fixas adicionadas' : ' conta fixa adicionada') + ' (sem valores)' : 'As contas fixas sugeridas já estão na lista');
  }
  function avisoFixas(s) {
    if (!s.config.fixasAviso) return null;
    return h('div', { class: 'aviso-fixas', role: 'status', 'data-fid': 'fx:aviso' },
      h('span', null, 'Contas fixas sugeridas carregadas (sem valores). Marque como paga as que já quitou neste mês. Edição em Gerenciar → Família.'),
      h('span', { class: 'acoes' },
        h('button', { class: 'btn peq', type: 'button', 'data-fid': 'fx:desfazer', onclick: function () { var n = 0; S.alterar(function (st) { n = F.desfazerFixas(st); }); PS.aviso(n ? 'Contas fixas removidas (' + n + ')' : 'Nada a desfazer'); } }, I('desfazer'), 'Desfazer'),
        h('button', { class: 'btn peq', type: 'button', 'data-fid': 'fx:ok', onclick: function () { S.alterar(function (st) { st.config.fixasAviso = false; }); } }, 'Ok')));
  }
  function filtroFormas(s, hoje) {
    if (!(s.contas || []).some(function (c) { return c.forma; })) return null;
    var sel = h('select', { 'data-fid': 'fx:filtro', 'aria-label': 'Filtrar por forma de pagamento' }, F.FORMAS.map(function (f, i) { return h('option', { value: f[0] }, i === 0 ? 'Todas as formas' : f[1]); }));
    sel.value = filtroForma;
    sel.addEventListener('change', function () { filtroForma = sel.value; PS.redesenhar(); });
    return h('label', { class: 'campo filtro-forma' }, h('span', null, 'Forma de pagamento'), sel);
  }

  function painel(s, hoje) {
    var lst = F.listas(s, hoje);
    if (filtroForma) { lst.abertas = lst.abertas.filter(function (p) { return p.forma === filtroForma; }); lst.pagas = lst.pagas.filter(function (p) { return p.forma === filtroForma; }); }
    var nA = lst.abertas.length, nP = lst.pagas.length;
    var abas = [['abertas', 'Em aberto', nA], ['pagas', 'Pagas', nP], ['hist', 'Histórico', null]].map(function (a) {
      return h('button', { class: 'aba', type: 'button', role: 'tab', 'aria-selected': aba === a[0] ? 'true' : 'false', 'data-fid': 'fa:' + a[0], onclick: function () { aba = a[0]; PS.redesenhar(); } }, a[1], a[2] != null ? h('small', null, a[2]) : null);
    });
    var corpo;
    if (aba === 'abertas') corpo = [avisoFixas(s), totais(s, hoje), filtroFormas(s, hoje), nA ? lst.abertas.map(function (p) { return linha(p, false); }) : h('p', { class: 'vazio' }, filtroForma ? 'Nada em aberto nesta forma de pagamento.' : 'Nada em aberto. Tudo em dia!'),
      F.fixasFaltando(s).length ? h('div', { class: 'acoes' }, h('button', { class: 'btn', type: 'button', 'data-fid': 'fx:add', onclick: adicionarFixas }, I('carteira'), 'Adicionar contas fixas sugeridas')) : null, painelAvisos(s)];
    else if (aba === 'pagas') corpo = [filtroFormas(s, hoje), nP ? lst.pagas.slice(0, 40).map(function (p) { return linha(p, true); }) : h('p', { class: 'vazio' }, 'Nenhuma conta marcada como paga ainda.')];
    else corpo = historico(s, hoje);
    return h('section', { class: 'cartao' }, h('h2', null, I('carteira'), h('span', null, 'Contas e faturas')), h('div', { class: 'abas', role: 'tablist' }, abas), corpo);
  }

  PS.finUI = { atencao: atencao, painel: painel, historico: historico, marcar: marcar, adicionarFixas: adicionarFixas };
})(window);
