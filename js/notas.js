/* Compras feitas: área dentro da Lista de compras. Registrar nota (foto lida pelo Worker em modo nota fiscal, foto descartada),
   lançar à mão, visão mês a mês com total, quantidade e total por loja, detalhe com Editar e Excluir. ES5.  byGui */
(function (global) {
  'use strict';
  var PS = global.PS, U = PS.u, h = U.h, S = PS.store, N = PS.notasN, I = PS.icone || function () { return null; };
  var mesSel = '';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function rotMes(ym) { return MESES[+ym.slice(5, 7) - 1] + ' de ' + ym.slice(0, 4); }
  function somaMes(ym, d) { var a = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + d; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return a + '-' + (m < 9 ? '0' : '') + (m + 1); }
  function txt(v) { return v === null || v === undefined ? '' : N.brl(v).replace('R$ ', ''); }
  function qtxt(v) { return v === null || v === undefined ? '' : String(v).replace('.', ','); }
  function dbr(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- editor (revisão da nota lida ou lançamento à mão) ---------- */
  function editar(n, erro) {
    n = copia(n);
    if (!n.itens) n.itens = [];
    var corpo = h('div', { class: 'campos nt-editor', 'data-fid': 'nt:editor' });
    var aviso = h('p', { class: 'aviso-campo', role: 'status', 'data-fid': 'nt:aviso' });
    function conferir() {
      var c = N.conferir(n);
      aviso.textContent = c.aviso; aviso.style.display = c.aviso ? '' : 'none';
      somaEl.textContent = 'Soma dos itens' + (n.desconto ? ' menos desconto' : '') + ': ' + N.brl(c.soma);
    }
    function campo(rot, fid, valor, set, at) {
      var a = { class: 'entrada', 'data-fid': fid, value: valor, oninput: function () { set(this.value); conferir(); } };
      Object.keys(at || {}).forEach(function (k) { a[k] = at[k]; });
      return h('label', { class: 'campo' }, h('span', null, rot), h('input', a));
    }
    var somaEl = h('p', { class: 'dica', 'data-fid': 'nt:soma' });
    var lista = h('div', { 'data-fid': 'nt:itens' });
    function desenharItens() {
      while (lista.firstChild) lista.removeChild(lista.firstChild);
      n.itens.forEach(function (it, i) {
        lista.appendChild(h('div', { class: 'form-linha nt-item', 'data-fid': 'nt:item:' + i },
          campo('Item', 'nt:i-nome:' + i, it.nome, function (v) { it.nome = v; }, { maxlength: '80' }),
          h('div', { class: 'nt-nums' },
            campo('Qtd', 'nt:i-qtd:' + i, qtxt(it.qtd), function (v) { it.qtd = N.qtd(v); }, { inputmode: 'decimal' }),
            campo('Unit. (R$)', 'nt:i-unit:' + i, txt(it.unit), function (v) { it.unit = N.valor(v); }, { inputmode: 'decimal' }),
            campo('Total (R$)', 'nt:i-total:' + i, txt(it.total), function (v) { it.total = N.valor(v); }, { inputmode: 'decimal' })),
          h('button', { class: 'btn', type: 'button', 'data-fid': 'nt:i-rm:' + i, 'aria-label': 'Remover item ' + (i + 1), onclick: function () { n.itens.splice(i, 1); desenharItens(); conferir(); } }, 'Remover item')));
      });
    }
    if (erro) corpo.appendChild(h('p', { class: 'aviso-campo', role: 'alert' }, erro));
    corpo.appendChild(campo('Loja', 'nt:loja', n.loja || '', function (v) { n.loja = v; }, { maxlength: '80' }));
    corpo.appendChild(campo('Data', 'nt:data', n.data || '', function (v) { n.data = v; }, { type: 'date' }));
    corpo.appendChild(lista);
    corpo.appendChild(h('button', { class: 'btn', type: 'button', 'data-fid': 'nt:i-mais', onclick: function () { n.itens.push({ nome: '', qtd: null, unit: null, total: null }); desenharItens(); conferir(); var e = lista.querySelector('[data-fid="nt:i-nome:' + (n.itens.length - 1) + '"]'); if (e) e.focus(); } }, I('mais'), 'Adicionar item'));
    corpo.appendChild(campo('Desconto (R$)', 'nt:desconto', txt(n.desconto), function (v) { n.desconto = N.valor(v); }, { inputmode: 'decimal', placeholder: '0,00' }));
    corpo.appendChild(campo('Total da nota (R$)', 'nt:total', txt(n.total), function (v) { n.total = N.valor(v); }, { inputmode: 'decimal', placeholder: '0,00' }));
    corpo.appendChild(somaEl); corpo.appendChild(aviso);
    desenharItens(); conferir();
    PS.modal.abrir(n.id ? 'Editar compra' : 'Conferir compra', corpo, [
      { rotulo: 'Salvar', tipo: 'primario', acao: function () { salvar(n); } },
      { rotulo: 'Cancelar' }]);
  }
  function salvar(n) {
    n.itens = n.itens.filter(function (x) { return String(x.nome || '').trim() || x.total !== null; });
    n.loja = String(n.loja || '').trim();
    if (!U.dataValida(n.data)) return editar(n, 'Informe a data da compra.');
    if (!n.loja && !n.itens.length && n.total === null) return editar(n, 'Informe a loja, um item ou o total.');
    var novo = !n.id; if (novo) n.id = U.uid();
    var reg = { id: n.id, loja: n.loja, data: n.data, desconto: n.desconto, total: n.total, origem: n.origem === 'foto' ? 'foto' : 'mao',
      itens: n.itens.map(function (x) { return { nome: String(x.nome || '').trim(), qtd: x.qtd, unit: x.unit, total: x.total }; }) };
    S.alterar(function (s) {
      if (!s.notas) s.notas = [];
      var i = -1; s.notas.forEach(function (x, k) { if (x.id === reg.id) i = k; });
      if (i >= 0) s.notas[i] = reg; else s.notas.unshift(reg);
    });
    mesSel = reg.data.slice(0, 7);
    PS.aviso(novo ? 'Compra salva' : 'Compra atualizada');
  }

  /* ---------- foto da nota ---------- */
  function lerFoto(camera) {
    PS.foto.escolher(camera, { modo: 'nota',
      inicio: function () { PS.modal.abrir('Lendo a nota', h('p', { role: 'status', 'data-fid': 'nt:lendo' }, 'Lendo a nota… isso leva alguns segundos.'), []); },
      sucesso: function (bruto) { PS.modal.fechar(true); var n = N.normalizar(bruto, U.hoje()); n.origem = 'foto'; if (!n.data) n.data = ''; editar(n, n.data ? '' : 'Não achei a data na nota. Preencha conferindo.'); },
      erro: function (msg) { PS.modal.abrir('Não consegui ler a nota', h('p', null, msg), [{ rotulo: 'Entendi' }]); } });
  }

  /* ---------- detalhe ---------- */
  function detalhe(c) {
    var conf = N.conferir(c);
    var corpo = h('div', { 'data-fid': 'nt:detalhe' },
      h('p', null, (c.loja || 'Sem loja') + ' · ' + dbr(c.data) + (c.por ? ' · por ' + c.por : '')),
      c.itens.length ? h('ul', { class: 'lista-compras nt-det-itens' }, c.itens.map(function (x) {
        var d = [x.qtd !== null ? qtxt(x.qtd) + ' x ' + (x.unit !== null ? N.brl(x.unit) : '') : '', x.total !== null ? N.brl(x.total) : 'sem total'].filter(Boolean).join(' · ');
        return h('li', { class: 'compra' }, h('span', { class: 't' }, x.nome || 'Item', h('small', null, d)));
      })) : h('p', { class: 'vazio' }, 'Sem itens lançados.'),
      c.desconto ? h('p', null, 'Desconto: ' + N.brl(c.desconto)) : null,
      h('p', { class: 'cp-total' }, 'Total: ' + (c.total !== null ? N.brl(c.total) : N.brl(N.totalDe(c)) + ' (soma dos itens)')),
      conf.aviso && c.itens.length ? h('p', { class: 'aviso-campo' }, conf.aviso) : null);
    PS.modal.abrir('Compra', corpo, [
      { rotulo: 'Editar', tipo: 'primario', acao: function () { editar(c); } },
      { rotulo: 'Excluir', acao: function () {
        PS.modal.abrir('Excluir compra?', h('p', null, 'Excluir a compra de ' + (c.loja || 'sem loja') + ' em ' + dbr(c.data) + '?'), [
          { rotulo: 'Excluir', tipo: 'perigo', acao: function () { S.alterar(function (s) { s.notas = (s.notas || []).filter(function (x) { return x.id !== c.id; }); }); PS.aviso('Compra excluída'); } },
          { rotulo: 'Cancelar' }]); } },
      { rotulo: 'Fechar' }]);
  }

  /* ---------- seção na tela Lista de compras ---------- */
  function secao() {
    var lista = S.get().notas || [];
    if (!mesSel) mesSel = U.hoje().slice(0, 7);
    var r = N.resumoMes(lista, mesSel);
    var fotoBox = h('div', { class: 'acoes ft-acoes', 'data-fid': 'nt:foto-opcoes', hidden: 'hidden' },
      h('button', { class: 'btn primario btn-foto', type: 'button', 'data-fid': 'nt:camera', onclick: function () { lerFoto(true); } }, I('camera'), 'Tirar foto'),
      h('button', { class: 'btn btn-foto', type: 'button', 'data-fid': 'nt:galeria', onclick: function () { lerFoto(false); } }, I('baixar'), 'Escolher da galeria'));
    function ir(d, fid) { mesSel = somaMes(mesSel, d); var novo = secao(); if (raiz.parentNode) raiz.parentNode.replaceChild(novo, raiz); var b = novo.querySelector('[data-fid="' + fid + '"]'); if (b) b.focus(); }
    var raiz = h('section', { class: 'cartao nt-secao', 'data-fid': 'nt:secao' },
      h('h2', null, 'Compras feitas'),
      h('div', { class: 'acoes ft-acoes' },
        h('button', { class: 'btn primario', type: 'button', 'data-fid': 'nt:registrar', 'aria-expanded': 'false', onclick: function () { var ab = fotoBox.hasAttribute('hidden'); if (ab) fotoBox.removeAttribute('hidden'); else fotoBox.setAttribute('hidden', 'hidden'); this.setAttribute('aria-expanded', ab ? 'true' : 'false'); } }, I('camera'), 'Registrar nota'),
        h('button', { class: 'btn', type: 'button', 'data-fid': 'nt:manual', onclick: function () { editar({ loja: '', data: U.hoje(), itens: [{ nome: '', qtd: null, unit: null, total: null }], desconto: null, total: null, origem: 'mao' }); } }, I('mais'), 'Lançar à mão')),
      fotoBox,
      h('div', { class: 'acoes nt-mes', 'data-fid': 'nt:mes' },
        h('button', { class: 'btn btn-icone', type: 'button', 'data-fid': 'nt:mes-ant', 'aria-label': 'Mês anterior', onclick: function () { ir(-1, 'nt:mes-ant'); } }, '‹'),
        h('strong', { 'data-fid': 'nt:mes-rot', 'aria-live': 'polite' }, rotMes(mesSel)),
        h('button', { class: 'btn btn-icone', type: 'button', 'data-fid': 'nt:mes-prox', 'aria-label': 'Próximo mês', onclick: function () { ir(1, 'nt:mes-prox'); } }, '›')),
      r.n ? h('div', null,
        h('p', { class: 'cp-total', 'data-fid': 'nt:total-mes' }, 'Total gasto: ' + N.brl(r.total) + ' em ' + r.n + (r.n === 1 ? ' compra' : ' compras')),
        h('ul', { class: 'nt-lojas', 'data-fid': 'nt:lojas', 'aria-label': 'Total por loja' }, r.porLoja.map(function (l) {
          return h('li', null, h('span', null, l.loja), h('small', null, N.brl(l.total) + ' · ' + l.n + (l.n === 1 ? ' compra' : ' compras')));
        })),
        h('h3', null, 'Compras do mês'),
        h('ul', { class: 'lista-compras', 'data-fid': 'nt:lista' }, r.compras.map(function (c) {
          return h('li', { class: 'compra' }, h('button', { class: 'item dupla', type: 'button', 'data-fid': 'nt:c:' + c.id, onclick: function () { detalhe(c); } },
            h('span', { class: 't' }, (c.loja || 'Sem loja') + ' · ' + dbr(c.data), h('small', null, N.brl(N.totalDe(c)) + ' · ' + c.itens.length + (c.itens.length === 1 ? ' item' : ' itens')))));
        })))
        : h('p', { class: 'vazio', 'data-fid': 'nt:vazio' }, 'Nenhuma compra neste mês. Registre uma nota ou lance à mão.'));
    return raiz;
  }

  PS.notas = { secao: secao, editar: editar, detalhe: detalhe };
})(window);
