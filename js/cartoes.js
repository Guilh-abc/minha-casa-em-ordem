/* Tela #/cartoes: faturas (manual ou PDF lido no aparelho), painel visual, revisão, categorias, CSV. ES5.
   O PDF NUNCA é enviado nem guardado: só os lançamentos extraídos (cifrados na sincronização). */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, h = U.h, I = PS.icone, S = PS.store, F = PS.fin, C = PS.cartoesCalc, P = PS.fatura, G = PS.graf;
  var BASE = (document.currentScript && document.currentScript.src || g.location.href).replace(/[?#].*$/, '').replace(/[^\/]*$/, '');
  var sel = '', rev = null, filtro = { q: '', cat: '', dono: '' }, regrasPadrao = null, pdfLib = null;
  var STATUS = [['aberta', 'Aberta'], ['fechada', 'Fechada'], ['paga', 'Paga']];
  var MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function brl(v) { return v == null ? '' : U.valorBRL(v); }
  function dataBR(d) { return d ? d.split('-').reverse().join('/') : ''; }
  function mesRot(m) { return m ? MES[+m.slice(5) - 1] + '/' + m.slice(2, 4) : ''; }
  function donoRot(d) { var e = S.get().config.esposa || 'Esposa'; return d === 'gui' ? 'Gui' : d === 'esposa' ? e : d === 'casal' ? 'Casal' : ''; }
  var DONOS = function () { return [['casal', 'Casal'], ['gui', 'Gui'], ['esposa', S.get().config.esposa || 'Esposa']]; };
  function cartaoDe(s, f) { return (s.cartoes || []).filter(function (c) { return c.id === f.cartao; })[0] || null; }
  function nomeCartao(s, f) { var c = cartaoDe(s, f); return c ? c.apelido + (c.final ? ' ••' + c.final : '') : (f.cartao || 'Cartão'); }
  function selo(cls, ic, txt) { return h('span', { class: 'selo ' + cls }, I(ic), txt); }
  function opt(v, t, sel0) { var o = h('option', { value: v }, t); if (sel0) o.selected = true; return o; }

  function carregarRegras() {
    if (regrasPadrao) return Promise.resolve(regrasPadrao);
    return fetch('dados.json').then(function (r) { return r.json(); }).then(function (d) { regrasPadrao = d.regrasCategoria || {}; return regrasPadrao; }, function () { regrasPadrao = {}; return regrasPadrao; });
  }
  function carregarPdfJs() {
    if (pdfLib) return Promise.resolve(pdfLib);
    if (!PS.importarModulo) return Promise.reject(new Error('Este navegador é antigo demais para ler PDF.'));
    return PS.importarModulo(BASE + 'vendor/pdfjs/pdf.min.mjs').then(function (lib) { lib.GlobalWorkerOptions.workerSrc = BASE + 'vendor/pdfjs/pdf.worker.min.mjs'; pdfLib = lib; return lib; });
  }

  /* ---------- entrada manual: cartão e fatura ---------- */
  function erroSensivel(campos) { for (var i = 0; i < campos.length; i++) { var m = P.rejeitaSensivel(campos[i]); if (m) return m; } return ''; }
  function campoTxt(rot, atrib, aviso) { var inp = h('input', atrib); var av = h('small', { class: 'aviso-campo', role: 'alert' }); inp.addEventListener('input', function () { var m = P.rejeitaSensivel(inp.value); av.textContent = m; inp.setAttribute('aria-invalid', m ? 'true' : 'false'); }); return { el: h('label', { class: 'campo' }, h('span', null, rot), inp, av, aviso ? h('small', { class: 'nota' }, aviso) : null), inp: inp }; }
  function editarCartao(c) {
    var novo = !c; c = c || { id: U.uid(), apelido: '', final: '', diaFecha: 0, diaVenc: 0, dono: 'casal' };
    var ap = campoTxt('Apelido do cartão', { type: 'text', maxlength: 30, value: c.apelido, placeholder: 'Ex.: Roxinho', 'data-fid': 'ct:ap' }),
      fi = campoTxt('Últimos 4 dígitos (opcional)', { type: 'text', inputmode: 'numeric', maxlength: 4, value: c.final, placeholder: '0000', 'data-fid': 'ct:fi' }, 'Nunca digite o número completo nem o CVV.'),
      df = h('input', { type: 'number', min: 1, max: 31, value: c.diaFecha || '', 'data-fid': 'ct:df' }), dv = h('input', { type: 'number', min: 1, max: 31, value: c.diaVenc || '', 'data-fid': 'ct:dv' }),
      dn = h('select', { 'data-fid': 'ct:dn' }, DONOS().map(function (d) { return opt(d[0], d[1], c.dono === d[0]); }));
    var err = h('p', { class: 'aviso-campo', role: 'alert' });
    PS.modal.abrir(novo ? 'Novo cartão' : 'Editar cartão', h('div', { class: 'campos' }, ap.el, fi.el, h('label', { class: 'campo' }, h('span', null, 'Dia do fechamento'), df), h('label', { class: 'campo' }, h('span', null, 'Dia do vencimento'), dv), h('label', { class: 'campo' }, h('span', null, 'De quem'), dn), err),
      [{ rotulo: 'Salvar', tipo: 'primario', acao: function () {
        var m = erroSensivel([ap.inp.value, fi.inp.value]);
        if (!m && fi.inp.value && !/^\d{4}$/.test(fi.inp.value.trim())) m = 'Use só os 4 últimos dígitos.';
        if (m) { PS.aviso(m); setTimeout(function () { editarCartao(Object.assign({}, c, { apelido: '', final: '' })); }, 50); return; }
        S.alterar(function (st) {
          var x = novo ? { id: c.id } : st.cartoes.filter(function (y) { return y.id === c.id; })[0]; if (!x) return;
          x.apelido = ap.inp.value.trim().slice(0, 30) || 'Cartão'; x.final = fi.inp.value.trim(); x.diaFecha = +df.value || 0; x.diaVenc = +dv.value || 0; x.dono = dn.value; x.exemplo = false;
          if (novo) st.cartoes.push(x);
        }); PS.aviso('Cartão salvo');
      } }, { rotulo: 'Cancelar' }]);
  }
  function editarFatura() {
    var s = S.get();
    if (!s.cartoes.length) { PS.aviso('Cadastre um cartão primeiro'); editarCartao(); return; }
    var hoje = U.hoje(), m0 = U.ym(hoje);
    var cs = h('select', { 'data-fid': 'fm:cartao' }, s.cartoes.map(function (c) { return opt(c.id, c.apelido + (c.final ? ' ••' + c.final : ''), false); }));
    var mes = h('input', { type: 'month', value: m0, 'data-fid': 'fm:mes' }), val = h('input', { type: 'number', step: '0.01', min: 0, placeholder: '0,00', 'data-fid': 'fm:valor' }),
      fe = h('input', { type: 'date', 'data-fid': 'fm:fecha' }), ve = h('input', { type: 'date', 'data-fid': 'fm:venc' }), st = h('select', { 'data-fid': 'fm:status' }, STATUS.map(function (x) { return opt(x[0], x[1], false); }));
    var pa = campoTxt('Parcelamentos (texto livre, opcional)', { type: 'text', maxlength: 160, placeholder: 'Ex.: TV 4/10 R$ 300', 'data-fid': 'fm:parc' });
    function sugerir() { var c = s.cartoes.filter(function (x) { return x.id === cs.value; })[0]; if (!c) return; if (c.diaVenc && !ve.value) ve.value = U.dataNoMes(mes.value || m0, c.diaVenc); if (c.diaFecha && !fe.value) fe.value = U.dataNoMes(mes.value || m0, c.diaFecha); }
    cs.addEventListener('change', function () { ve.value = ''; fe.value = ''; sugerir(); }); mes.addEventListener('change', function () { ve.value = ''; fe.value = ''; sugerir(); }); sugerir();
    PS.modal.abrir('Nova fatura (manual)', h('div', { class: 'campos' }, h('label', { class: 'campo' }, h('span', null, 'Cartão'), cs), h('label', { class: 'campo' }, h('span', null, 'Mês da fatura'), mes), h('label', { class: 'campo' }, h('span', null, 'Valor total (R$)'), val),
      h('label', { class: 'campo' }, h('span', null, 'Fechamento'), fe), h('label', { class: 'campo' }, h('span', null, 'Vencimento'), ve), h('label', { class: 'campo' }, h('span', null, 'Situação'), st), pa.el),
      [{ rotulo: 'Salvar fatura', tipo: 'primario', acao: function () {
        var m = erroSensivel([pa.inp.value]); if (m) { PS.aviso(m); return; }
        if (!U.dataValida(ve.value)) { PS.aviso('Informe o vencimento'); return; }
        var id = U.uid();
        S.alterar(function (x) { x.faturas.unshift({ id: id, cartao: cs.value, mes: mes.value || U.ym(ve.value), valor: val.value === '' ? null : Math.max(0, Number(val.value)), fechamento: U.dataValida(fe.value) ? fe.value : '', vencimento: ve.value, status: st.value, origem: 'manual', periodo: '', parcelas: pa.inp.value.trim(), pagaEm: st.value === 'paga' ? hoje : '', dono: '', teste: false }); });
        sel = id; PS.aviso('Fatura salva');
      } }, { rotulo: 'Cancelar' }]);
  }

  /* ---------- leitura de PDF ---------- */
  function pedirSenha(motivo) {
    return new Promise(function (ok) {
      var inp = h('input', { type: 'password', autocomplete: 'off', 'data-fid': 'pdf:senha', 'aria-label': 'Senha do PDF' }), feito = false;
      function fim(v) { if (feito) return; feito = true; ok(v); }
      PS.modal.abrir('PDF protegido por senha', h('div', null, h('p', null, motivo === 'errada' ? 'Senha incorreta. Tente de novo.' : 'Este PDF pede senha para abrir (geralmente os primeiros dígitos do CPF; veja as instruções do seu banco).'), h('label', { class: 'campo' }, h('span', null, 'Senha'), inp), h('p', { class: 'nota' }, 'A senha é usada só agora, para abrir o arquivo neste aparelho. Não é salva nem enviada.')),
        [{ rotulo: 'Abrir', tipo: 'primario', acao: function () { fim(inp.value); inp.value = ''; } }, { rotulo: 'Cancelar', acao: function () { fim(null); } }]);
    });
  }
  function erroPdf(e) {
    var t = e && e.tipo, msg = t === 'imagem' ? 'Este PDF é só imagem (foto ou digitalização). Não consigo ler sem OCR. Baixe a fatura em PDF direto do app ou site do banco, ou cadastre a fatura manualmente.' : t === 'senha' ? 'Senha não informada ou incorreta. Nada foi lido.' : t === 'invalido' ? 'Não consegui abrir este arquivo como PDF.' : ((e && e.message) || 'Não consegui ler este PDF.');
    PS.modal.abrir('Não foi possível ler a fatura', h('p', null, msg), [{ rotulo: 'Entendi' }]);
  }
  function lerArquivo(arq, teste) {
    if (!arq) return;
    if (arq.size > 15 * 1024 * 1024) { PS.aviso('PDF muito grande (máx. 15 MB)'); return; }
    PS.aviso('Lendo o PDF neste aparelho…');
    Promise.all([carregarRegras(), carregarPdfJs(), arq.arrayBuffer()]).then(function (r) {
      return P.lerPdf(r[1], new Uint8Array(r[2]), pedirSenha).then(function (pdf) { return { pdf: pdf, regras: r[0] }; });
    }).then(function (r) { abrirRevisao(P.analisar(r.pdf.linhas, { hoje: U.hoje(), regras: S.get().regras, regrasPadrao: r.regras, itens: r.pdf.itens }), r.pdf.linhas, !!teste, arq.name); }, erroPdf);
  }
  var EXEMPLO = ['Nubank - FATURA DE EXEMPLO (dados inventados)', 'Valor total da fatura R$ 545,30', 'Data de vencimento: 10 NOV 2026', 'Fechamento: 03 NOV 2026', 'Cartão final 4321',
    '05 OUT Mercado Bom Preço R$ 250,40', '07 OUT Uber *Viagem R$ 32,90', '12 OUT Netflix.com R$ 55,90', '15 OUT Loja XYZ - Parcela 03/10 R$ 189,90', '20 OUT Estorno Loja ABC -R$ 45,00', '22 OUT Farmácia Saúde Total R$ 61,20', '02 OUT Pagamento recebido -R$ 300,00'];
  function usarExemplo() { carregarRegras().then(function (rp) { abrirRevisao(P.analisar(EXEMPLO, { hoje: U.hoje(), regras: S.get().regras, regrasPadrao: rp }), EXEMPLO, true, 'exemplo'); }); }

  /* ---------- revisão antes de salvar ---------- */
  function abrirRevisao(a, linhas, teste, nome) {
    var s = S.get(), ct = s.cartoes.filter(function (c) { return a.resumo.final && c.final === a.resumo.final; })[0];
    var venc = a.resumo.vencimento || '';
    rev = { a: a, linhas: linhas, nome: nome, teste: !!teste, cartao: ct ? ct.id : '__novo', apelido: ct ? '' : (a.bancoNome !== 'Genérico' ? a.bancoNome + (a.resumo.produto ? ' ' + a.resumo.produto : '') : 'Cartão'), final: a.resumo.final || '', venc: venc, fecha: a.resumo.fechamento || '', mes: venc ? U.ym(venc) : U.ym(U.hoje()),
      total: a.resumo.total != null ? a.resumo.total : a.soma, dono: ct ? ct.dono : 'casal', itens: a.lancs.map(function (x) { return { inc: true, data: x.data, desc: x.desc, valor: x.valor, pa: x.pa, pt: x.pt, cat: x.cat, catBanco: x.catBanco || '', cidade: x.cidade || '' }; }).concat(a.ignoradas.map(function (x) { return { inc: false, data: x.data, desc: x.desc, valor: x.valor, pa: x.pa, pt: x.pt, cat: x.cat, motivo: x.motivo }; })) };
    PS.redesenhar(); setTimeout(function () { var e = document.querySelector('[data-fid="rv:salvar"]'); if (e) e.focus(); }, 60);
  }
  function somaRev() { var t = 0; rev.itens.forEach(function (x) { if (x.inc) t += x.valor; }); return Math.round(t * 100) / 100; }
  function anonimo() {
    return rev.linhas.slice(0, 60).map(function (l) { return l.replace(/\d/g, '9').replace(/[A-Za-zÀ-ÿ]/g, function (c) { return c === c.toUpperCase() ? 'X' : 'x'; }); }).join('\n');
  }
  function salvarRev() {
    var r = rev, soma = somaRev(), itens = r.itens.filter(function (x) { return x.inc && U.dataValida(x.data); });
    if (r.teste) { PS.modal.abrir('Teste concluído', h('div', null, h('p', null, 'Banco detectado: ' + r.a.bancoNome + '. Confiança: ' + r.a.confianca + '.'), h('p', null, itens.length + ' lançamentos · soma ' + brl(soma) + (r.a.resumo.total != null ? ' · total no PDF ' + brl(r.a.resumo.total) : '')), h('p', { class: 'nota' }, 'Nada foi salvo (modo teste).')), [{ rotulo: 'Fechar' }]); return; }
    if (!U.dataValida(r.venc)) { PS.aviso('Informe o vencimento da fatura'); return; }
    var msg = erroSensivel([r.apelido, r.final]); if (msg) { PS.aviso(msg); return; }
    if (r.cartao === '__novo' && r.final && !/^\d{4}$/.test(r.final)) { PS.aviso('Use só os 4 últimos dígitos do cartão'); return; }
    var dup = duplicada(r);
    if (dup) {
      PS.modal.abrir('Esta fatura já foi enviada', h('div', null, h('p', null, 'Já existe a fatura deste cartão com vencimento em ' + dataBR(dup.vencimento) + ' (' + brl(C.faturaTotal(S.get(), dup)) + '). Enviar de novo não duplica: posso substituir pelos dados deste PDF.'),
        h('p', { class: 'nota' }, 'Substituir mantém a situação (paga ou em aberto) e troca só os lançamentos e valores.')),
        [{ rotulo: 'Substituir', tipo: 'primario', acao: function () { gravar(r, itens, dup); } }, { rotulo: 'Cancelar' }]);
      return;
    }
    gravar(r, itens, null);
  }
  /* mesma fatura (mesmo cartão + mesmo vencimento ou mesmo mês)? */
  function duplicada(r) {
    if (r.cartao === '__novo') return null;
    return S.get().faturas.filter(function (f) { return !f.teste && f.cartao === r.cartao && ((f.vencimento && f.vencimento === r.venc) || (f.mes && f.mes === (r.mes || U.ym(r.venc)))); })[0] || null;
  }
  function gravar(r, itens, dup) {
    var fid = dup ? dup.id : U.uid(), cid = r.cartao, R = r.a.resumo, fu = R.futuras || {};
    S.alterar(function (st) {
      if (cid === '__novo') { cid = U.uid(); st.cartoes.push({ id: cid, apelido: (r.apelido || 'Cartão').slice(0, 30), final: r.final, diaFecha: r.fecha ? +r.fecha.slice(8) : 0, diaVenc: +r.venc.slice(8), dono: r.dono, exemplo: false }); }
      var antiga = dup ? st.faturas.filter(function (y) { return y.id === dup.id; })[0] : null;
      var reg = { id: fid, cartao: cid, mes: r.mes || U.ym(r.venc), valor: Math.round(Number(r.total) * 100) / 100, fechamento: U.dataValida(r.fecha) ? r.fecha : '', vencimento: r.venc, status: antiga ? antiga.status : 'aberta', origem: 'pdf', periodo: R.periodo || '', parcelas: '', pagaEm: antiga ? antiga.pagaEm : '', dono: r.dono, teste: false,
        emissao: R.emissao || '', proxFechamento: R.proxFechamento || '', pagamentoMinimo: R.pagamentoMinimo, totalAnterior: R.totalAnterior, limiteTotal: R.limiteTotal, limiteDisponivel: R.limiteDisponivel,
        futuroProxima: fu.proxima, futuroDemais: fu.demais, futuroTotal: fu.total, futuras: fu.lista || [] };
      if (antiga) { st.faturas = st.faturas.map(function (y) { return y.id === dup.id ? reg : y; }); st.lancs = st.lancs.filter(function (l) { return l.fatura !== dup.id; }); } else st.faturas.unshift(reg);
      itens.forEach(function (x) { st.lancs.push({ id: U.uid(), fatura: fid, data: x.data, desc: P.limpar(x.desc).slice(0, 80), valor: x.valor, pa: x.pa || 0, pt: x.pt || 0, cat: x.cat, dono: r.dono, catBanco: x.catBanco || '', cidade: x.cidade || '' }); });
    });
    sel = fid; rev = null; PS.aviso((dup ? 'Fatura atualizada: ' : 'Fatura salva: ') + itens.length + ' lançamentos'); PS.redesenhar();
  }
  /* conferência dos valores lidos × o que o banco declara (só leitor com subtotais, hoje o Itaú em colunas) */
  function confereValores(a) {
    var V = a.validacao, R = a.resumo;
    if (!V) return null;
    function lin(rot, lido, banco, ok) { return h('div', { class: 'rv-conf' }, h('span', null, rot), h('strong', null, brl(lido)), banco != null ? h('small', { class: 'nota' }, 'banco: ' + brl(banco)) : null, ok == null ? null : selo(ok ? 'ok' : 'perigo', ok ? 'check' : 'alerta', ok ? 'confere' : 'diferente')); }
    var cats = Object.keys(a.porCategoria || {}).map(function (c) { return [c, a.porCategoria[c]]; }).sort(function (x, y) { return y[1] - x[1]; });
    var fu = R.futuras || {};
    return h('section', { class: 'cartao' }, h('h2', null, I('check'), h('span', null, 'Conferência dos valores')),
      lin('Compras no cartão', V.somaCartao, V.subtotalCartao, V.okCartao),
      V.subtotalProdutos != null || V.somaProdutos ? lin('Produtos e serviços / multa e juros', V.somaProdutos, V.subtotalProdutos, V.okProdutos) : null,
      lin('Soma de todos os lançamentos (' + a.lancs.length + ')', a.soma, V.totalLancamentos, V.okLancamentos),
      lin('Total da fatura', R.total != null ? R.total : 0, null, R.total != null ? V.okTotal : null),
      R.pagamentoMinimo != null ? h('p', { class: 'nota' }, 'Pagamento mínimo: ' + brl(R.pagamentoMinimo) + (R.totalAnterior != null ? ' · fatura anterior: ' + brl(R.totalAnterior) + ' (não entra na soma)' : '')) : null,
      cats.length ? h('div', { class: 'rv-cats' }, h('small', { class: 'nota' }, 'Por categoria (como li):'), cats.map(function (c) { return h('span', { class: 'selo neutro' }, G.nomeCat(c[0]) + ' ' + brl(c[1])); })) : null,
      fu.total != null ? h('p', { class: 'nota' }, 'Parcelas futuras que o banco informa: próxima fatura ' + brl(fu.proxima || 0) + ' · demais ' + brl(fu.demais || 0) + ' · total ' + brl(fu.total) + ' (' + (fu.lista ? fu.lista.length : 0) + ' parcelas). Ficam guardadas como "Compromissos futuros"; não somam na fatura.') : null);
  }
  function telaRevisao() {
    var r = rev, a = r.a, s = S.get(), soma = somaRev();
    var conf = { alta: ['ok', 'check', 'Total confere com a soma'], media: ['aviso', 'alerta', 'Confira: soma diferente do total'], baixa: ['perigo', 'alerta', 'Baixa confiança: revise as linhas'], nenhuma: ['perigo', 'alerta', 'Nenhum lançamento encontrado'] }[a.confianca];
    var totalEl = h('strong', { class: 'rv-soma' }, brl(soma));
    function atualizaSoma() { totalEl.textContent = brl(somaRev()); }
    var cs = h('select', { 'data-fid': 'rv:cartao', 'aria-label': 'Cartão' }, s.cartoes.map(function (c) { return opt(c.id, c.apelido + (c.final ? ' ••' + c.final : ''), r.cartao === c.id); }).concat([opt('__novo', 'Novo cartão…', r.cartao === '__novo')]));
    var ap = h('input', { type: 'text', maxlength: 30, value: r.apelido, 'aria-label': 'Apelido do novo cartão', 'data-fid': 'rv:apelido' }), fi = h('input', { type: 'text', maxlength: 4, inputmode: 'numeric', value: r.final, 'aria-label': 'Últimos 4 dígitos', 'data-fid': 'rv:final' });
    var novoBox = h('div', { class: 'campos' }, h('label', { class: 'campo' }, h('span', null, 'Apelido'), ap), h('label', { class: 'campo' }, h('span', null, 'Últimos 4 dígitos'), fi));
    function mostraNovo() { novoBox.style.display = cs.value === '__novo' ? '' : 'none'; } mostraNovo();
    cs.addEventListener('change', function () { r.cartao = cs.value; mostraNovo(); }); ap.addEventListener('input', function () { r.apelido = ap.value; }); fi.addEventListener('input', function () { r.final = fi.value.replace(/\D/g, ''); fi.value = r.final; });
    function dt(rot, k, fid) { var i = h('input', { type: 'date', value: r[k] || '', 'data-fid': fid }); i.addEventListener('change', function () { r[k] = i.value; if (k === 'venc' && i.value) r.mes = U.ym(i.value); }); return h('label', { class: 'campo' }, h('span', null, rot), i); }
    var tot = h('input', { type: 'number', step: '0.01', value: r.total, 'data-fid': 'rv:total' }); tot.addEventListener('input', function () { r.total = tot.value === '' ? 0 : Number(tot.value); });
    var dn = h('select', { 'data-fid': 'rv:dono' }, DONOS().map(function (d) { return opt(d[0], d[1], r.dono === d[0]); })); dn.addEventListener('change', function () { r.dono = dn.value; });
    var teste = h('input', { type: 'checkbox', 'data-fid': 'rv:teste' }); teste.checked = r.teste; teste.addEventListener('change', function () { r.teste = teste.checked; });
    var lista = r.itens.slice(0, 400).map(function (x, i) {
      var inc = h('input', { type: 'checkbox', 'aria-label': 'Incluir linha ' + (i + 1), 'data-fid': 'rv:inc' + i }); inc.checked = x.inc; inc.addEventListener('change', function () { x.inc = inc.checked; atualizaSoma(); });
      var d = h('input', { type: 'date', value: x.data, 'aria-label': 'Data' }); d.addEventListener('change', function () { x.data = d.value; });
      var ds = h('input', { type: 'text', maxlength: 80, value: x.desc, 'aria-label': 'Descrição' }); ds.addEventListener('input', function () { x.desc = ds.value; });
      var v = h('input', { type: 'number', step: '0.01', value: x.valor, 'aria-label': 'Valor' }); v.addEventListener('input', function () { x.valor = Number(v.value) || 0; atualizaSoma(); });
      var ct = h('select', { 'aria-label': 'Categoria' }, P.CATS.map(function (c) { return opt(c, G.nomeCat(c), x.cat === c); })); ct.addEventListener('change', function () { x.cat = ct.value; });
      return h('div', { class: 'rv-linha' + (x.inc ? '' : ' fora') }, inc, d, ds, v, ct, x.pt ? h('span', { class: 'selo neutro' }, I('parcelas'), x.pa + '/' + x.pt) : null, x.motivo ? h('small', { class: 'nota' }, x.motivo) : null);
    });
    return h('div', { class: 'cartoes' }, h('h1', { class: 'titulo-tela' }, I('cartao'), 'Revisar fatura'),
      h('section', { class: 'cartao' }, h('h2', null, I('busca'), h('span', null, 'Conferência')),
        h('p', null, 'Lido de "' + r.nome + '" neste aparelho · banco detectado: ', h('strong', null, a.bancoNome), ' · ', selo(conf[0], conf[1], conf[2])),
        a.avisos.map(function (t) { return h('p', { class: 'nota' }, t); }),
        duplicada(r) ? h('p', { class: 'selo aviso' }, I('alerta'), 'Esta fatura já foi enviada: ao salvar, vou perguntar se quer substituir (não duplica).') : null,
        h('div', { class: 'campos' }, h('label', { class: 'campo' }, h('span', null, 'Cartão'), cs), h('label', { class: 'campo' }, h('span', null, 'De quem'), dn), dt('Vencimento', 'venc', 'rv:venc'), dt('Fechamento', 'fecha', 'rv:fecha'), h('label', { class: 'campo' }, h('span', null, 'Total da fatura (R$)'), tot)),
        novoBox, h('p', null, 'Soma dos lançamentos marcados: ', totalEl),
        h('label', { class: 'campo marcar' }, teste, h('span', null, 'Só testar (não salvar nada)')),
        h('p', { class: 'nota' }, 'O PDF não é enviado nem guardado. Serão salvos só data, descrição, valor, parcela e categoria. Números de cartão completos e CPF são removidos.')),
      confereValores(a),
      h('section', { class: 'cartao' }, h('h2', null, I('lista'), h('span', null, 'Lançamentos (' + r.itens.length + ')')), h('div', { class: 'rv-lista' }, lista), r.itens.length > 400 ? h('p', { class: 'nota' }, 'Mostrando 400 de ' + r.itens.length + '.') : null),
      h('div', { class: 'acoes' },
        h('button', { class: 'btn primario', type: 'button', 'data-fid': 'rv:salvar', onclick: salvarRev }, I('check'), 'Salvar fatura'),
        h('button', { class: 'btn', type: 'button', 'data-fid': 'rv:cancelar', onclick: function () { rev = null; PS.redesenhar(); } }, 'Cancelar'),
        h('button', { class: 'btn', type: 'button', 'data-fid': 'rv:amostra', onclick: function () {
          var t = anonimo(); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { PS.aviso('Amostra copiada (letras e números trocados)'); }, function () { PS.aviso('Não consegui copiar'); }); else PS.aviso('Copiar não disponível neste navegador');
        } }, I('csv'), 'Copiar amostra sem dados pessoais')));
  }

  /* ---------- painel ---------- */
  function contagem(dias, passado, futuro) { return dias < 0 ? passado + ' há ' + (-dias) + (dias === -1 ? ' dia' : ' dias') : dias === 0 ? futuro + ' hoje' : dias === 1 ? futuro + ' amanhã' : futuro + ' em ' + dias + ' dias'; }
  function faturasValidas(s) { return s.faturas.filter(function (f) { return !f.teste; }).sort(function (a, b) { return (b.vencimento || b.mes) < (a.vencimento || a.mes) ? -1 : 1; }); }
  function cabecalho(s, f, ls, hoje) {
    var total = C.faturaTotal(s, f), paga = f.status === 'paga', dv = f.vencimento ? C.diasEntre(hoje, f.vencimento) : null, dfc = f.fechamento ? C.diasEntre(hoje, f.fechamento) : null;
    var ev = C.evolucao(s, f.cartao), idx = -1; ev.forEach(function (e, i) { if (e.mes === f.mes) idx = i; });
    var ant = idx > 0 ? ev[idx - 1].total : 0, meta = s.config.orcamento, ref = meta > 0 ? meta : ant, refRot = meta > 0 ? 'meta mensal' : 'mês anterior';
    var st = paga ? selo('ok', 'pago', 'Paga' + (f.pagaEm ? ' em ' + dataBR(f.pagaEm).slice(0, 5) : '')) : dv != null && dv < 0 ? selo('perigo', 'alerta', 'Vencida') : f.status === 'fechada' ? selo('aviso', 'relogio', 'Fechada · a pagar') : selo('aviso', 'relogio', 'Aberta');
    var p = { tipo: 'fatura', id: f.id, chave: f.mes || '', titulo: 'Fatura ' + nomeCartao(s, f), valor: total, data: f.vencimento };
    var totalEl = h('strong', { class: 'fat-total' }); G.contar(totalEl, total);
    return h('section', { class: 'cartao resumo-fatura' }, h('h2', null, I('cartao'), h('span', null, nomeCartao(s, f) + ' · ' + mesRot(f.mes))),
      h('div', { class: 'resumo-topo' },
        h('div', { class: 'resumo-info' }, h('small', null, 'Total da fatura'), totalEl, h('div', { class: 'resumo-selos' }, st,
          f.vencimento ? selo(paga ? 'neutro' : dv < 0 ? 'perigo' : dv <= 3 ? 'aviso' : 'neutro', 'calendario', 'Vencimento ' + dataBR(f.vencimento).slice(0, 5) + (paga ? '' : ' · ' + contagem(dv, 'venceu', 'vence'))) : null,
          f.fechamento && dfc != null ? selo('neutro', 'relogio', 'Fecha ' + dataBR(f.fechamento).slice(0, 5) + (dfc >= 0 ? ' · ' + contagem(dfc, 'fechou', 'fecha') : ' · já fechou')) : null),
          f.origem === 'pdf' ? h('small', { class: 'nota' }, 'Lida de PDF' + (f.periodo ? ' · ' + f.periodo : '') + ' · ' + ls.length + ' lançamentos' + (f.pagamentoMinimo != null ? ' · mínimo ' + brl(f.pagamentoMinimo) : '')) : h('small', { class: 'nota' }, 'Cadastro manual' + (f.parcelas ? ' · ' + f.parcelas : ''))),
        G.anel(total, ref, { rotulo: 'Esta fatura', refRot: refRot })),
      h('div', { class: 'acoes' }, paga ? h('button', { class: 'btn', type: 'button', 'data-fid': 'ft:desfazer', onclick: function () { S.alterar(function (x) { F.desfazerPaga(x, 'fatura', f.id, f.mes || ''); }); PS.aviso('Desfeito: voltou para em aberto'); } }, I('desfazer'), 'Desfazer')
        : h('button', { class: 'btn primario', type: 'button', 'data-fid': 'ft:paga', onclick: function () { PS.finUI.marcar(p); } }, I('check'), 'Marcar fatura como paga'),
        h('button', { class: 'btn', type: 'button', 'data-fid': 'ft:excluir', onclick: function () { excluirFatura(f); } }, I('x'), 'Excluir fatura')),
      h('p', { class: 'nota' }, 'Marcar como paga só registra aqui; não paga nada nem consulta o banco.'));
  }
  function excluirFatura(f) {
    PS.modal.abrir('Excluir esta fatura?', h('p', null, 'Remove a fatura e seus lançamentos deste painel (em todos os aparelhos sincronizados). Não afeta o banco.'), [{ rotulo: 'Excluir', tipo: 'perigo', acao: function () {
      S.alterar(function (x) { x.faturas = x.faturas.filter(function (y) { return y.id !== f.id; }); x.lancs = x.lancs.filter(function (l) { return l.fatura !== f.id; }); }); sel = ''; PS.aviso('Fatura excluída');
    } }, { rotulo: 'Cancelar' }]);
  }
  /* Compromissos futuros: parcelas que o banco lista na fatura (próxima, demais, total) */
  function cardFuturos(f) {
    if (!f || (f.futuroTotal == null && !(f.futuras && f.futuras.length))) return null;
    var lista = (f.futuras || []).slice().sort(function (a, b) { return b.valor - a.valor; });
    var tot = f.futuroTotal != null ? f.futuroTotal : lista.reduce(function (t, x) { return t + x.valor; }, 0);
    function kv(r, v) { return h('div', { class: 'fut-kv' }, h('small', null, r), h('strong', null, brl(v))); }
    return h('section', { class: 'cartao fut-card' }, h('h2', null, I('parcelas'), h('span', null, 'Compromissos futuros')),
      h('div', { class: 'fut-resumo' }, f.futuroProxima != null ? kv('Próxima fatura', f.futuroProxima) : null, f.futuroDemais != null ? kv('Demais faturas', f.futuroDemais) : null, kv('Total a vencer', tot)),
      lista.length ? h('ul', { class: 'lista-simples' }, lista.slice(0, 10).map(function (x) { return h('li', null, h('span', { class: 'ls-t' }, x.desc + ' · ' + x.pa + '/' + x.pt), h('strong', null, brl(x.valor))); })) : null,
      lista.length > 10 ? h('p', { class: 'nota' }, '+ ' + (lista.length - 10) + ' parcelas menores.') : null,
      h('p', { class: 'nota' }, 'Valores informados pelo banco na fatura de ' + mesRot(f.mes) + '. Cada parcela aparece com o valor de hoje e só vale como aviso do que vem aí.'));
  }
  function cardCategorias(ls) {
    var cats = C.porCategoria(ls);
    if (!cats.length) return null;
    return h('section', { class: 'cartao' }, h('h2', null, I('grafico'), h('span', null, 'Gastos por categoria')),
      G.donut(cats.map(function (c) { return { id: c.cat, rotulo: G.nomeCat(c.cat), valor: c.total, cor: G.corDe(c.cat), icone: G.iconeCat(c.cat) }; }), { titulo: 'Gastos por categoria', centro: 'Total' }));
  }
  function cardTop(ls) {
    var t = C.top(ls, 10); if (!t.length) return null; var mx = t[0].valor;
    return h('section', { class: 'cartao' }, h('h2', null, I('sacola'), h('span', null, '10 maiores compras')),
      h('ol', { class: 'top-lista' }, t.map(function (l, i) { return h('li', null, h('span', { class: 'top-n' }, i + 1), I(G.iconeCat(l.cat)), h('span', { class: 'top-desc' }, l.desc, h('small', null, dataBR(l.data).slice(0, 5) + (l.pt ? ' · parcela ' + l.pa + '/' + l.pt : ''))), h('span', { class: 'top-barra' }, h('i', { style: 'width:' + Math.max(4, Math.round(l.valor / mx * 100)) + '%;background:' + G.corDe(l.cat) })), h('strong', null, brl(l.valor))); })));
  }
  function cardAssinaturas(s) {
    var a = C.assinaturas(s);
    return h('section', { class: 'cartao' }, h('h2', null, I('repetir'), h('span', null, 'Assinaturas e recorrentes'), a.lista.length ? h('span', { class: 'mais' }, brl(a.totalMensal) + '/mês') : null),
      a.lista.length ? h('ul', { class: 'lista-simples' }, a.lista.slice(0, 10).map(function (x) { return h('li', null, I(G.iconeCat(x.cat)), h('span', { class: 'ls-t' }, x.nome, h('small', null, x.certeza === 'recorrente' ? 'em ' + x.meses + ' faturas' : 'pela categoria')), h('strong', null, brl(x.valor))); }))
        : h('p', { class: 'vazio' }, 'Nenhuma assinatura detectada ainda. Aparecem quando o mesmo estabelecimento repete em 2 ou mais faturas.'));
  }
  function cardParcelas(s, hoje) {
    var p = C.parcelas(s, hoje);
    return h('section', { class: 'cartao' }, h('h2', null, I('parcelas'), h('span', null, 'Parcelas em andamento'), p.lista.length ? h('span', { class: 'mais' }, brl(p.totalComprometido) + ' a pagar') : null),
      p.lista.length ? [h('ul', { class: 'lista-simples' }, p.lista.slice(0, 8).map(function (x) { return h('li', null, I('parcelas'), h('span', { class: 'ls-t' }, x.desc, h('small', null, x.pa + '/' + x.pt + ' · faltam ' + x.restantes + ' · até ' + mesRot(x.ate)), h('span', { class: 'prog' }, h('i', { style: 'width:' + Math.round(x.pa / x.pt * 100) + '%' }))), h('strong', null, brl(x.valor) + '/mês')); })),
        p.proximosMeses.length ? G.barras(p.proximosMeses.map(function (m) { return { mes: m.mes, total: m.valor, vs: null }; }), { titulo: 'Parcelas comprometidas nos próximos meses' }) : null]
        : h('p', { class: 'vazio' }, 'Nenhuma compra parcelada em andamento.'));
  }
  function cardEvolucao(s, f) {
    var ev = C.evolucao(s, f.cartao);
    if (ev.length < 1) return null;
    var ls = C.lancsDe(s, f.id), mAnt = null; var i0 = -1; ev.forEach(function (e, i) { if (e.mes === f.mes) i0 = i; });
    var antF = i0 > 0 ? s.faturas.filter(function (x) { return !x.teste && x.cartao === f.cartao && x.mes === ev[i0 - 1].mes; })[0] : null;
    var catsA = {}, catsB = {}; C.porCategoria(ls).forEach(function (c) { catsA[c.cat] = c.total; }); if (antF) C.porCategoria(C.lancsDe(s, antF.id)).forEach(function (c) { catsB[c.cat] = c.total; });
    var ks = Object.keys(catsA).concat(Object.keys(catsB).filter(function (k) { return !(k in catsA); })).slice(0, 8);
    var serie = {}; ev.forEach(function (e) { var fa = s.faturas.filter(function (x) { return !x.teste && x.cartao === f.cartao && x.mes === e.mes; })[0]; if (fa) C.porCategoria(C.lancsDe(s, fa.id)).forEach(function (c) { (serie[c.cat] = serie[c.cat] || {})[e.mes] = c.total; }); });
    return h('section', { class: 'cartao' }, h('h2', null, I('grafico'), h('span', null, 'Evolução mês a mês')), G.barras(ev, { titulo: 'Total das faturas por mês' }),
      antF ? h('table', { class: 'tab-hist tab-cmp' }, h('caption', null, 'Por categoria: ' + mesRot(antF.mes) + ' → ' + mesRot(f.mes)), h('thead', null, h('tr', null, ['Categoria', 'Antes', 'Agora', 'Variação', ''].map(function (x) { return h('th', { scope: 'col' }, x); }))),
        h('tbody', null, ks.map(function (k) { var c = C.comparar(catsA[k] || 0, catsB[k] || 0); return h('tr', null, h('th', { scope: 'row' }, h('span', { class: 'tc' }, I(G.iconeCat(k)), G.nomeCat(k))), h('td', null, brl(catsB[k] || 0)), h('td', null, brl(catsA[k] || 0)),
          h('td', null, h('span', { class: 'delta ' + c.dir }, I(c.dir === 'subiu' ? 'subiu' : c.dir === 'caiu' ? 'caiu' : 'igual'), c.dir === 'igual' ? 'igual' : (c.dir === 'subiu' ? '+' : '−') + brl(Math.abs(c.dv)) + (c.pct != null ? ' (' + Math.abs(c.pct).toString().replace('.', ',') + '%)' : ''))),
          h('td', null, G.spark(ev.map(function (e) { return (serie[k] && serie[k][e.mes]) || 0; }), G.corDe(k)))); }))) : h('p', { class: 'nota' }, 'Quando houver uma fatura do mês anterior deste cartão, a comparação por categoria aparece aqui.'));
  }
  function cardLancs(s, f, ls) {
    var vis = C.filtrar(ls, filtro).sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    var q = h('input', { type: 'search', value: filtro.q, placeholder: 'Buscar compra…', 'aria-label': 'Buscar compra', 'data-fid': 'lc:busca' }); q.addEventListener('input', function () { filtro.q = q.value; clearTimeout(q._t); q._t = setTimeout(function () { PS.redesenhar(); setTimeout(function () { var e = document.querySelector('[data-fid="lc:busca"]'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }, 20); }, 250); });
    var cs = h('select', { 'aria-label': 'Filtrar categoria', 'data-fid': 'lc:cat', onchange: function () { filtro.cat = this.value; PS.redesenhar(); } }, [opt('', 'Todas as categorias', !filtro.cat)].concat(P.CATS.map(function (c) { return opt(c, G.nomeCat(c), filtro.cat === c); })));
    var dn = h('select', { 'aria-label': 'Filtrar por pessoa', 'data-fid': 'lc:dono', onchange: function () { filtro.dono = this.value; PS.redesenhar(); } }, [opt('', 'Todos', !filtro.dono)].concat(DONOS().map(function (d) { return opt(d[0], d[1], filtro.dono === d[0]); })));
    return h('section', { class: 'cartao' }, h('h2', null, I('lista'), h('span', null, 'Lançamentos'), h('span', { class: 'mais' }, vis.length + ' de ' + ls.length)),
      h('div', { class: 'filtros' }, q, cs, dn, h('button', { class: 'btn peq', type: 'button', 'data-fid': 'lc:csv', onclick: function () { PS.arq.baixar('lancamentos-' + (f.mes || 'fatura') + '.csv', C.csv(S.get(), vis), 'text/csv;charset=utf-8'); PS.aviso('CSV baixado'); } }, I('baixar'), 'Exportar CSV')),
      vis.length ? h('div', { class: 'lancs' }, vis.slice(0, 200).map(function (l) {
        var catSel = h('select', { 'aria-label': 'Categoria de ' + l.desc, onchange: function () { var v = this.value; S.alterar(function (x) { x.lancs.forEach(function (y) { if (y.id === l.id) y.cat = v; }); }); } }, P.CATS.map(function (c) { return opt(c, G.nomeCat(c), l.cat === c); }));
        return h('div', { class: 'lanc' + (l.valor < 0 ? ' credito' : '') }, h('span', { class: 'lanc-ic', style: 'color:' + G.corDe(l.cat) }, I(G.iconeCat(l.cat))),
          h('span', { class: 'lanc-t' }, l.desc, h('small', null, dataBR(l.data).slice(0, 5) + (l.pt ? ' · parcela ' + l.pa + '/' + l.pt : '') + (l.valor < 0 ? ' · crédito/estorno' : ''))),
          h('strong', { class: 'lanc-v' }, brl(l.valor)), catSel,
          h('button', { class: 'btn peq', type: 'button', title: 'Lembrar esta categoria para a loja', onclick: function () { lembrarLoja(l); } }, I('guarda'), 'Lembrar loja'));
      })) : h('p', { class: 'vazio' }, 'Nenhum lançamento com esses filtros.'),
      vis.length > 200 ? h('p', { class: 'nota' }, 'Mostrando 200; refine a busca ou exporte o CSV.') : null);
  }
  function lembrarLoja(l) {
    var termo = C.norm(l.desc).split(' ').slice(0, 2).join(' '); if (!termo) return;
    S.alterar(function (x) { x.regras = x.regras.filter(function (r) { return r.termo !== termo; }); x.regras.push({ id: U.uid(), termo: termo, cat: l.cat, exemplo: false }); x.lancs.forEach(function (y) { if (C.norm(y.desc).indexOf(termo) === 0) y.cat = l.cat; }); });
    PS.aviso('Pronto: "' + termo + '" será ' + G.nomeCat(l.cat) + ' nas próximas faturas');
  }
  function cardCartoes(s) {
    return h('section', { class: 'cartao' }, h('h2', null, I('cartao'), h('span', null, 'Meus cartões')),
      s.cartoes.length ? h('ul', { class: 'lista-simples' }, s.cartoes.map(function (c) { return h('li', null, I('cartao'), h('span', { class: 'ls-t' }, c.apelido + (c.final ? ' ••' + c.final : ''), h('small', null, (c.diaFecha ? 'fecha dia ' + c.diaFecha : '') + (c.diaVenc ? ' · vence dia ' + c.diaVenc : '') + ' · ' + donoRot(c.dono))),
        h('button', { class: 'btn peq', type: 'button', 'data-fid': 'ca:ed' + c.id, onclick: function () { editarCartao(c); } }, 'Editar')); })) : h('p', { class: 'vazio' }, 'Nenhum cartão cadastrado.'),
      h('div', { class: 'acoes' }, h('button', { class: 'btn', type: 'button', 'data-fid': 'ca:novo', onclick: function () { editarCartao(); } }, '+ Novo cartão')),
      h('p', { class: 'nota' }, 'Guarde só o apelido e os 4 últimos dígitos. O painel recusa números completos e CVV.'));
  }

  PS.views.cartoes = { reativo: true, titulo: 'Cartões', render: function () {
    if (rev) return telaRevisao();
    var s = S.get(), hoje = U.hoje(), fs = faturasValidas(s);
    var arq = h('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'oculto', 'aria-label': 'Escolher PDF da fatura', 'data-fid': 'ct:arq', onchange: function () { var f0 = this.files && this.files[0]; this.value = ''; lerArquivo(f0, false); } });
    var acoes = h('div', { class: 'acoes' },
      h('button', { class: 'btn primario', type: 'button', 'data-fid': 'ct:enviar', onclick: function () { arq.click(); } }, I('enviar'), 'Enviar fatura (PDF)'),
      h('button', { class: 'btn', type: 'button', 'data-fid': 'ct:manual', onclick: editarFatura }, '+ Fatura manual'),
      h('button', { class: 'btn', type: 'button', 'data-fid': 'ct:exemplo', onclick: usarExemplo }, I('grafico'), 'Testar com fatura de exemplo'), arq);
    if (!fs.length) return h('div', { class: 'cartoes' }, h('h1', { class: 'titulo-tela' }, I('cartao'), 'Cartões e faturas'), acoes,
      h('section', { class: 'cartao' }, h('h2', null, I('cartao'), h('span', null, 'Comece por aqui')), h('p', { class: 'vazio' }, 'Nenhuma fatura ainda. Envie o PDF da fatura (lido só neste aparelho) ou cadastre à mão. O painel mostra categorias, maiores compras, assinaturas, parcelas e a evolução mês a mês.'),
        h('p', { class: 'nota' }, 'Para usar PDF: baixe a fatura em PDF no app/site do banco e toque em "Enviar fatura (PDF)". Se pedir senha, o painel pergunta na hora e não guarda.')), cardCartoes(s));
    var f = fs.filter(function (x) { return x.id === sel; })[0] || fs[0]; sel = f.id;
    var ls = C.lancsDe(s, f.id);
    var chips = h('div', { class: 'chips-fat', role: 'tablist', 'aria-label': 'Faturas' }, fs.slice(0, 12).map(function (x) { return h('button', { class: 'chip-fat' + (x.id === f.id ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': x.id === f.id ? 'true' : 'false', 'data-fid': 'fx:' + x.id, onclick: function () { sel = x.id; filtro = { q: '', cat: '', dono: '' }; PS.redesenhar(); } }, h('strong', null, nomeCartao(s, x)), h('small', null, mesRot(x.mes) + ' · ' + brl(C.faturaTotal(s, x)))); }));
    var metaIn = h('input', { type: 'number', min: 0, step: '10', value: s.config.orcamento == null ? '' : s.config.orcamento, placeholder: 'Meta mensal (R$)', 'aria-label': 'Meta mensal em reais', 'data-fid': 'ct:meta' });
    metaIn.addEventListener('change', function () { var v = metaIn.value === '' ? null : Math.max(0, Number(metaIn.value)); S.alterar(function (x) { x.config.orcamento = v; }); });
    return h('div', { class: 'cartoes' }, h('h1', { class: 'titulo-tela' }, I('cartao'), 'Cartões e faturas'), acoes, chips, cabecalho(s, f, ls, hoje),
      h('div', { class: 'grade-cartoes' }, cardCategorias(ls), cardTop(ls), cardAssinaturas(s), cardParcelas(s, hoje), cardFuturos(f), cardEvolucao(s, f)), cardLancs(s, f, ls),
      h('section', { class: 'cartao' }, h('h2', null, I('meta'), h('span', null, 'Meta mensal')), h('label', { class: 'campo' }, h('span', null, 'Quanto quer gastar por fatura (opcional)'), metaIn), h('p', { class: 'nota' }, 'Com meta, o anel compara a fatura com ela; sem meta, compara com o mês anterior.')),
      cardCartoes(s),
      h('p', { class: 'nota' }, 'Leitura de PDF testada só com faturas sintéticas (inventadas). Confira sempre os valores com a fatura do banco.'));
  } };
})(window);
