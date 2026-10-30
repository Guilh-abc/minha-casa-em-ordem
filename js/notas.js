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
    corpo.appendChild(campo('Total da nota (R$)', 'nt:total', txt(n.total), function (v) { n.total = N.valor(v); n.estimado = false; }, { inputmode: 'decimal', placeholder: '0,00' }));
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
    var soma = N.somaItens(n), est = !!(n.estimado && n.total === soma), avisoSalvo = '';
    if (n.total === null || n.total === undefined || n.total === 0) {
      if (soma > 0) { n.total = soma; est = true; avisoSalvo = ' com o total pela soma dos itens (' + N.brl(soma) + '), confira na nota'; }
      else return editar(n, 'Não há nenhum valor nesta compra. Preencha o total da nota ou os valores dos itens.');
    }
    var novo = !n.id; if (novo) n.id = U.uid();
    var reg = { id: n.id, loja: n.loja, data: n.data, desconto: n.desconto, total: n.total, estimado: est, origem: n.origem === 'foto' ? 'foto' : 'mao',
      itens: n.itens.map(function (x) { return { nome: String(x.nome || '').trim(), qtd: x.qtd, unit: x.unit, total: x.total }; }) };
    S.alterar(function (s) {
      if (!s.notas) s.notas = [];
      var i = -1; s.notas.forEach(function (x, k) { if (x.id === reg.id) i = k; });
      if (i >= 0) s.notas[i] = reg; else s.notas.unshift(reg);
    });
    mesSel = reg.data.slice(0, 7);
    PS.aviso((novo ? 'Compra salva' : 'Compra atualizada') + avisoSalvo);
  }

  /* ---------- foto da nota ---------- */
  /* Nota longa: várias fotos (partes) da mesma compra. Cada parte vai ao Worker em modo nota;
     o app junta tudo numa compra só (N.juntar tira os itens repetidos na emenda). As fotos são descartadas. */
  var partes = [];
  function lerFoto(camera) { partes = []; pegarParte(camera); }
  function pegarParte(camera) {
    PS.foto.escolher(camera, { modo: 'nota', arquivos: function (fs) { fila(fs, 0); } });
  }
  function fila(fs, i) {
    if (i >= fs.length) return painel('');
    var tot = fs.length, n0 = partes.length + 1;
    PS.foto.enviar(fs[i], { modo: 'nota',
      inicio: function () { PS.modal.abrir('Lendo a nota', h('p', { role: 'status', 'data-fid': 'nt:lendo' }, 'Lendo a parte ' + n0 + (tot > 1 ? ' (' + (i + 1) + ' de ' + tot + ')' : '') + '… isso leva alguns segundos.'), []); },
      sucesso: function (bruto) { fs[i] = null; partes.push(bruto); fila(fs, i + 1); },
      erro: function (msg) { fs[i] = null; painel('A parte ' + n0 + ' não foi lida: ' + msg); } });
  }
  function painel(erro) {
    var j = N.juntar(partes, U.hoje());
    var corpo = h('div', { class: 'nt-partes', 'data-fid': 'nt:partes' },
      erro ? h('p', { class: 'aviso-campo', role: 'alert', 'data-fid': 'nt:parte-erro' }, erro) : null,
      partes.length ? h('ul', { class: 'nt-partes-lista', 'data-fid': 'nt:partes-lista' }, partes.map(function (p, k) {
        var n = N.normalizar(p, U.hoje());
        return h('li', null, 'Parte ' + (k + 1) + ': ' + n.itens.length + (n.itens.length === 1 ? ' item' : ' itens') + (n.loja ? ' · ' + n.loja : '') + (n.total !== null ? ' · total ' + N.brl(n.total) : ''));
      })) : h('p', { class: 'nota' }, 'Nenhuma parte lida ainda.'),
      partes.length ? h('p', { class: 'nota', 'data-fid': 'nt:partes-resumo' }, 'Juntas: ' + j.itens.length + ' itens' + (j.repetidos ? ' (' + j.repetidos + ' repetido' + (j.repetidos > 1 ? 's' : '') + ' na emenda, contado' + (j.repetidos > 1 ? 's' : '') + ' uma vez)' : '') + '.') : null,
      h('p', { class: 'nota' }, 'Nota comprida? Fotografe de cima para baixo, deixando um ou dois itens repetidos entre uma foto e a próxima. As fotos são descartadas.'),
      h('div', { class: 'acoes ft-acoes' },
        h('button', { class: 'btn primario btn-foto', type: 'button', 'data-fid': 'nt:parte-camera', onclick: function () { PS.modal.fechar(true); pegarParte(true); } }, I('camera'), partes.length ? '+ Adicionar outra parte' : 'Tirar foto'),
        h('button', { class: 'btn btn-foto', type: 'button', 'data-fid': 'nt:parte-galeria', onclick: function () { PS.modal.fechar(true); pegarParte(false); } }, I('baixar'), 'Galeria (várias fotos)')));
    var bt = [{ rotulo: 'Cancelar', acao: function () { partes = []; } }];
    if (partes.length) bt.unshift({ rotulo: 'Terminei', tipo: 'primario', acao: function () {
      var n = N.juntar(partes, U.hoje()); partes = []; n.origem = 'foto';
      var av = [];
      if (!n.data) av.push('Não achei a data na nota. Preencha conferindo.');
      if (n.total === null) av.push('Não achei o total da nota. Se ficar vazio, uso a soma dos itens.');
      editar({ loja: n.loja, data: n.data, itens: n.itens, desconto: n.desconto, total: n.total, origem: 'foto' }, av.join(' '));
    } });
    PS.modal.abrir(partes.length ? 'Nota em partes (' + partes.length + ')' : 'Registrar nota', corpo, bt);
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
      h('p', { class: 'cp-total' }, 'Total: ' + (N.semValor(c) ? 'sem valor, toque em Editar para corrigir' : N.brl(N.totalDe(c)) + (c.total === null || c.total === 0 || c.estimado ? ' (soma dos itens, total da nota não lido)' : ''))),
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
            h('span', { class: 't' }, (c.loja || 'Sem loja') + ' · ' + dbr(c.data), h('small', null, (N.semValor(c) ? 'sem valor · corrigir' : N.brl(N.totalDe(c)) + (c.total === null || c.total === 0 || c.estimado ? ' (soma)' : '')) + ' · ' + c.itens.length + (c.itens.length === 1 ? ' item' : ' itens')))));
        })))
        : h('p', { class: 'vazio', 'data-fid': 'nt:vazio' }, 'Nenhuma compra neste mês. Registre uma nota ou lance à mão.'));
    return raiz;
  }

  PS.notas = { secao: secao, editar: editar, detalhe: detalhe };
})(window);
