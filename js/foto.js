/* Foto ou print: reduz em memória, envia UMA vez ao assistente (/foto), revisa e grava só os dados.
   A imagem nunca é guardada: nem no aparelho, nem no cache, nem no backup, nem na sincronização. byGui */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, h = U.h, I = PS.icone, S = PS.store, F = PS.fotoNucleo;
  var URL_FOTO = (g.MCO_ASSISTENTE_URL || 'https://minha-casa-assistente.guilhermeromionetto.workers.dev') + '/foto';
  var MAX = 1280, ocupado = false;

  function dataBR(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  function precoTxt(n) { return n == null ? '' : n.toFixed(2).replace('.', ','); }
  function hojeBR() { return dataBR(U.hoje()); }

  /* lê o arquivo, desenha reduzido num canvas e devolve um data URL JPEG; tudo é solto logo depois */
  function reduzir(arquivo) {
    return new Promise(function (ok, falha) {
      function desenhar(fonte, w0, h0, soltar) {
        try {
          var d = F.dimensoes(w0, h0, MAX), cv = document.createElement('canvas');
          cv.width = d.w; cv.height = d.h; cv.getContext('2d').drawImage(fonte, 0, 0, d.w, d.h);
          var url = cv.toDataURL('image/jpeg', 0.82);
          cv.width = cv.height = 0; soltar(); ok(url);
        } catch (e) { soltar(); falha(e); }
      }
      if (g.createImageBitmap) {
        g.createImageBitmap(arquivo).then(function (b) { desenhar(b, b.width, b.height, function () { if (b.close) b.close(); }); }, falha);
        return;
      }
      var link = URL.createObjectURL(arquivo), im = new Image();
      im.onload = function () { desenhar(im, im.naturalWidth, im.naturalHeight, function () { URL.revokeObjectURL(link); im.src = ''; }); };
      im.onerror = function () { URL.revokeObjectURL(link); falha(new Error('imagem')); };
      im.src = link;
    });
  }

  /* o (opcional, Ajudante): { inicio(), sucesso(campos), erro(msg) } no lugar do modal */
  function enviar(arquivo, o) {
    if (ocupado) return; ocupado = true;
    var cancelado = false;
    if (o) o.inicio(); else PS.modal.abrir('Lendo a imagem', h('p', { role: 'status', 'data-fid': 'ft:lendo' }, 'Lendo a imagem… isso leva alguns segundos.'), [{ rotulo: 'Cancelar', acao: function () { ocupado = false; cancelado = true; } }]);
    reduzir(arquivo).then(function (img) {
      arquivo = null;
      var env = { imagem: img, hoje: hojeBR() }; if (o && o.modo) env.modo = o.modo;
      var corpo = JSON.stringify(env); img = null; env = null;
      var p = fetch(URL_FOTO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, cache: 'no-store', credentials: 'omit' });
      corpo = null;
      return p;
    }).then(function (r) { return r.json().then(function (j) { var v = o && o.modo === 'nota' ? j.nota : j.campos; if (!r.ok || !v) throw new Error(j.erro || 'erro'); return v; }); })
      .then(function (campos) { ocupado = false; if (cancelado) return; if (o) return o.sucesso(o.modo ? campos : F.normalizar(campos, U.hoje())); PS.modal.fechar(true); revisar(F.normalizar(campos, U.hoje())); },
        function (e) { ocupado = false; arquivo = null; if (cancelado) return; var msg = (e && e.message && e.message !== 'erro' && e.message.length < 120 ? e.message : 'Tente outra foto ou confira a conexão.') + ' A imagem foi descartada.'; if (o) return o.erro(msg); PS.modal.abrir('Não consegui ler a imagem', h('p', null, msg), [{ rotulo: 'Entendi' }]); });
  }

  /* Tirar foto abre a câmera traseira direto (capture=environment); Escolher da galeria abre o seletor de imagens */
  function escolher(camera, o) {
    var at = { type: 'file', accept: 'image/*', style: 'position:fixed;left:-9999px', 'aria-hidden': 'true', tabindex: '-1', 'data-fid': 'ft:arquivo' };
    if (camera) at.capture = 'environment';
    var inp = h('input', at);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      inp.value = ''; if (inp.parentNode) inp.parentNode.removeChild(inp);
      if (f) enviar(f, o);
    });
    document.body.appendChild(inp); inp.click();
  }
  function botao(o) {
    return [h('button', { class: 'btn primario btn-foto', type: 'button', 'data-fid': 'ft:camera', onclick: function () { escolher(true, o); } }, I('camera'), 'Tirar foto'),
      h('button', { class: 'btn btn-foto', type: 'button', 'data-fid': 'ft:galeria', onclick: function () { escolher(false, o); } }, I('baixar'), 'Escolher da galeria')];
  }

  var ROT = { compras: 'Lista de compras', tarefa: 'Tarefa', agenda: 'Agenda' };
  function revisar(c, erro, aoSalvar) {
    var corpo = h('div', { class: 'campos ft-revisao', 'data-fid': 'ft:revisao' });
    function campo(rot, k, attrs, valor) {
      var a = { class: 'entrada', 'data-fid': 'ft:' + k, value: valor, oninput: function () { c['_' + k] = this.value; } };
      Object.keys(attrs || {}).forEach(function (x) { a[x] = attrs[x]; });
      c['_' + k] = valor;
      return h('label', { class: 'campo' }, h('span', null, rot), h('input', a));
    }
    function desenhar() {
      U.limpar(corpo);
      if (erro) corpo.appendChild(h('p', { class: 'aviso-campo', role: 'alert' }, erro));
      var sel = h('select', { class: 'entrada', 'data-fid': 'ft:destino', onchange: function () { lerCampos(); c.destino = this.value; erro = ''; desenhar(); } },
        F.DESTINOS.map(function (d) { return h('option', { value: d, selected: d === c.destino ? 'selected' : null }, ROT[d]); }));
      corpo.appendChild(h('label', { class: 'campo' }, h('span', null, 'Salvar em'), sel));
      if (c.destino === 'compras') {
        corpo.appendChild(campo('Produto', 'nome', { maxlength: '80' }, c.nome));
        corpo.appendChild(campo('Preço (R$)', 'preco', { inputmode: 'decimal', placeholder: '0,00' }, precoTxt(c.preco)));
        corpo.appendChild(campo('Unidade', 'unidade', { maxlength: '20', placeholder: 'kg, un, pct' }, c.unidade));
        corpo.appendChild(campo('Local', 'local', { maxlength: '60', placeholder: 'Mercado ou loja' }, c.local));
      } else {
        corpo.appendChild(campo('Título', 'titulo', { maxlength: '100' }, c.titulo || c.nome));
        corpo.appendChild(campo(c.destino === 'agenda' ? 'Data (DD/MM/AAAA)' : 'Vence (DD/MM/AAAA)', 'data', { inputmode: 'numeric', placeholder: 'DD/MM/AAAA' }, dataBR(c.data)));
        if (c.destino === 'agenda') { corpo.appendChild(campo('Hora', 'hora', { inputmode: 'numeric', placeholder: 'HH:MM' }, c.hora)); corpo.appendChild(campo('Local', 'local', { maxlength: '80' }, c.local)); }
        else corpo.appendChild(campo('Valor (R$)', 'valor', { inputmode: 'decimal', placeholder: '0,00' }, precoTxt(c.valor)));
      }
    }
    function lerCampos() {
      ['nome', 'unidade', 'local', 'titulo', 'hora'].forEach(function (k) { if (c['_' + k] != null) c[k] = String(c['_' + k]).trim(); });
      if (c._preco != null) c.preco = F.preco(c._preco);
      if (c._valor != null) c.valor = F.preco(c._valor);
      if (c._data != null) c.data = F.data(c._data, U.hoje());
      if (c._hora != null) c.hora = F.hora(c._hora);
    }
    desenhar();
    PS.modal.abrir('Revisar antes de salvar', corpo, [
      { rotulo: 'Cancelar' },
      { rotulo: 'Salvar', tipo: 'primario', acao: function () {
        var bruto = c._data; lerCampos();
        if (bruto && !c.data) return revisar(c, 'Data inválida. Use DD/MM/AAAA.', aoSalvar);
        salvar(c, aoSalvar);
      } }]);
    var pr = corpo.querySelector('[data-fid="ft:destino"]'); if (pr) pr.focus();
  }

  function salvar(c, aoSalvar) {
    function fim(m) { PS.aviso(m); if (aoSalvar) aoSalvar(m); return m; }
    if (c.destino === 'compras') {
      if (!c.nome) return revisar(c, 'Informe o produto.', aoSalvar);
      S.alterar(function (s) { s.compras.unshift(F.paraCompra(c, U.uid())); });
      return fim('Item salvo na lista de compras');
    }
    if (!c.titulo) return revisar(c, 'Informe o título.', aoSalvar);
    if (c.destino === 'agenda') {
      var cp = F.paraCompromisso(c, U.uid());
      if (!cp) return revisar(c, 'A agenda precisa de uma data.', aoSalvar);
      S.alterar(function (s) { s.compromissos.push(cp); });
      return fim('Compromisso salvo na agenda');
    }
    S.alterar(function (s) { var t = F.paraTarefa(c, U.uid(), s.listas[0]); s.tarefas.unshift(t); PS.focarLista = t.lista; });
    return fim('Tarefa salva');
  }

  /* ---------- tela Lista de compras ---------- */
  PS.views.compras = { reativo: true, titulo: 'Lista de compras', render: function () {
    var s = S.get(), itens = s.compras.slice().sort(function (a, b) { return a.comprado === b.comprado ? 0 : (a.comprado ? 1 : -1); });
    var total = itens.reduce(function (t, x) { return t + (!x.comprado && x.preco != null ? x.preco : 0); }, 0);
    function alternar(id) { S.alterar(function (st) { st.compras.forEach(function (y) { if (y.id === id) y.comprado = !y.comprado; }); }); }
    function remover(id) { S.alterar(function (st) { st.compras = st.compras.filter(function (y) { return y.id !== id; }); }); }
    var li = itens.map(function (x) {
      var det = [x.preco != null ? F.brl(x.preco) + (x.unidade ? ' / ' + x.unidade : '') : (x.unidade || ''), x.local].filter(Boolean).join(' · ');
      return h('li', { class: 'compra' + (x.comprado ? ' feito' : '') },
        h('button', { class: 'item dupla', type: 'button', role: 'checkbox', 'aria-checked': x.comprado ? 'true' : 'false', 'data-fid': 'cp:' + x.id, onclick: function () { alternar(x.id); } },
          h('span', { class: 'caixa' + (x.comprado ? ' on' : ''), 'aria-hidden': 'true' }, I('check')), h('span', { class: 't' }, x.nome, det ? h('small', null, det) : null)),
        h('button', { class: 'btn btn-icone', type: 'button', 'data-fid': 'cp-rm:' + x.id, 'aria-label': 'Remover ' + x.nome, onclick: function () { remover(x.id); } }, I('x')));
    });
    var feitos = itens.some(function (x) { return x.comprado; });
    return h('div', null, h('h1', { class: 'titulo-tela' }, 'Lista de compras', h('small', null, itens.length ? itens.length + (itens.length === 1 ? ' item' : ' itens') : '')),
      h('section', { class: 'cartao' },
        h('div', { class: 'acoes ft-acoes' }, botao(), h('button', { class: 'btn', type: 'button', 'data-fid': 'cp:manual', onclick: function () { revisar(F.normalizar({ destino: 'compras' }, U.hoje())); } }, I('mais'), 'Adicionar à mão')),
        h('p', { class: 'dica' }, 'A foto só é usada para ler os dados e é descartada em seguida.'),
        li.length ? h('ul', { class: 'lista-compras', 'data-fid': 'cp:lista' }, li) : h('p', { class: 'vazio' }, 'Lista vazia. Fotografe uma etiqueta ou adicione à mão.'),
        total > 0 ? h('p', { class: 'cp-total', 'data-fid': 'cp:total' }, 'Total estimado: ' + F.brl(Math.round(total * 100) / 100)) : null,
        feitos ? h('div', { class: 'acoes' }, h('button', { class: 'btn', type: 'button', 'data-fid': 'cp:limpar', onclick: function () { S.alterar(function (st) { st.compras = st.compras.filter(function (y) { return !y.comprado; }); }); } }, 'Limpar comprados')) : null),
      PS.notas ? PS.notas.secao() : null);
  } };

  PS.foto = { salvar: salvar, escolher: escolher, botao: botao, revisar: revisar, reduzir: reduzir };
})(window);
