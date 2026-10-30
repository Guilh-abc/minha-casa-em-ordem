/* Minha Casa em Ordem: núcleo da foto (puro, sem DOM). Datas sempre lidas em DD/MM no código, nunca confiadas ao modelo.
   Testado em Node (tools/teste-foto.js). byGui */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else { raiz.PS = raiz.PS || {}; raiz.PS.fotoNucleo = fabrica(); }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var DESTINOS = ['compras', 'tarefa', 'agenda'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function str(v, n) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : (typeof v === 'number' ? String(v) : ''); }
  function valida(a, m, d) {
    if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1) return '';
    var dt = new Date(Date.UTC(a, m - 1, d));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? a + '-' + pad(m) + '-' + pad(d) : '';
  }
  function difDias(a, b) { return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5); }
  /* aceita DD/MM/AAAA, DD/MM/AA e DD/MM (ano atual; se ficou mais de 60 dias no passado, ano seguinte) */
  function data(txt, hoje) {
    var s = str(txt, 80); if (!s) return '';
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return valida(+m[1], +m[2], +m[3]);
    m = /(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/.exec(s);
    /* só dígitos (teclado numérico): DDMMAAAA, DDMMAA ou DDMM */
    if (!m && /^\d{4}$|^\d{6}$|^\d{8}$/.test(s.trim())) { var g = s.trim(); m = [g, g.slice(0, 2), g.slice(2, 4), g.length > 4 ? g.slice(4) : undefined]; }
    if (!m) return '';
    var d = +m[1], mes = +m[2], a;
    if (m[3]) { a = +m[3]; if (m[3].length === 2) a += 2000; if (m[3].length === 3) return ''; return valida(a, mes, d); }
    a = +String(hoje || '').slice(0, 4) || new Date().getFullYear();
    var r = valida(a, mes, d);
    if (r && hoje && difDias(r, hoje) < -60) r = valida(a + 1, mes, d);
    return r;
  }
  function preco(v) {
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
    var s = str(v, 40).replace(/R\$\s*/i, ''); if (!/\d/.test(s)) return null;
    var m = /\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/.exec(s); if (!m) return null;
    var t = m[0];
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    var n = parseFloat(t); return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  function hora(v) {
    var m = /(\d{1,2})\s*[:hH.]\s*(\d{2})?/.exec(str(v, 20));
    if (!m && /^\s*\d{3,4}\s*$/.test(str(v, 20))) { var g = str(v, 20).trim(); if (g.length === 3) g = '0' + g; m = [g, g.slice(0, 2), g.slice(2)]; }
    if (!m) return '';
    var hh = +m[1], mm = m[2] ? +m[2] : 0;
    return hh < 24 && mm < 60 ? pad(hh) + ':' + pad(mm) : '';
  }
  var GENERICO = /^(loja|mercado|supermercado|local|n\/a|-|desconhecido)$/i;
  var COBRANCA = /boleto|fatura|vencimento|benefici[aá]rio|linha digit/i;
  function normalizar(o, hoje) {
    o = o && typeof o === 'object' ? o : {};
    var r = { destino: DESTINOS.indexOf(o.destino) >= 0 ? o.destino : 'tarefa',
      nome: str(o.nome, 80), preco: preco(o.preco), unidade: str(o.unidade, 20), local: str(o.local, 60),
      titulo: str(o.titulo, 120), data: data(o.data, hoje), hora: hora(o.hora), valor: preco(o.valor) };
    if (r.hora === '00:00') r.hora = '';
    if (GENERICO.test(r.local)) r.local = '';
    /* o modelo às vezes põe o nome da loja no título de uma etiqueta */
    if (r.destino === 'compras' && !r.local && r.titulo && r.titulo !== r.nome && r.titulo.length <= 40) r.local = r.titulo.slice(0, 60);
    /* cobrança (boleto, fatura) é sempre tarefa com vencimento, nunca compromisso */
    if (r.destino === 'agenda' && COBRANCA.test(r.titulo + ' ' + r.nome)) { r.destino = 'tarefa'; r.hora = ''; }
    return r;
  }
  function brl(n) { var p = n.toFixed(2).split('.'); return 'R$ ' + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + p[1]; }
  function paraCompra(c, id) { return { id: id, nome: str(c.nome, 80) || 'Item', preco: preco(c.preco), unidade: str(c.unidade, 20), local: str(c.local, 60), comprado: false }; }
  function paraTarefa(c, id, lista) {
    var v = preco(c.valor), tit = str(c.titulo, 100) || 'Tarefa';
    return { id: id, lista: lista, titulo: (v != null ? tit + ' (' + brl(v) + ')' : tit).slice(0, 120), prio: 'media', vence: /^\d{4}-\d{2}-\d{2}$/.test(c.data || '') ? c.data : '', feita: false, dono: '' };
  }
  function paraCompromisso(c, id) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.data || '')) return null;
    return { id: id, titulo: str(c.titulo, 120) || 'Compromisso', data: c.data, hora: hora(c.hora), local: str(c.local, 80), fonte: 'manual', dono: '' };
  }
  function dimensoes(w, h, max) {
    var k = Math.min(1, max / Math.max(w, h));
    return { w: Math.round(w * k), h: Math.round(h * k) };
  }
  /* texto curto do que foi lido, para a mensagem da Ajudante (só campos preenchidos) */
  var ROTULOS = { compras: 'Lista de compras', tarefa: 'Tarefa', agenda: 'Agenda' };
  function resumo(c) {
    var l = [];
    function br(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }
    if (c.destino === 'compras') {
      if (c.nome) l.push('Produto: ' + c.nome); if (c.preco != null) l.push('Preço: ' + brl(c.preco) + (c.unidade ? ' / ' + c.unidade : '')); if (c.local) l.push('Onde: ' + c.local);
    } else {
      if (c.titulo) l.push('Título: ' + c.titulo); if (c.data) l.push('Data: ' + br(c.data)); if (c.hora) l.push('Hora: ' + c.hora);
      if (c.valor != null) l.push('Valor: ' + brl(c.valor)); if (c.local) l.push('Local: ' + c.local);
    }
    return 'Li a imagem. Destino sugerido: ' + ROTULOS[c.destino] + '.\n' + (l.length ? l.join('\n') : 'Não consegui ler dados na imagem. Toque em Editar para preencher.');
  }
  return { resumo: resumo, DESTINOS: DESTINOS, data: data, preco: preco, hora: hora, normalizar: normalizar, paraCompra: paraCompra, paraTarefa: paraTarefa, paraCompromisso: paraCompromisso, dimensoes: dimensoes, brl: brl };
});
