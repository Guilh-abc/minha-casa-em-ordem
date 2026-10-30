/* Leitura por câmera/print: normaliza o JSON que o modelo de visão devolve e valida linha digitável. PURO (sem DOM), testável em Node.
   Nada é gravado aqui: devolve sugestões { acao, dados, resumo, avisos } que a tela mostra para confirmação. byGui */
(function (raiz) {
  'use strict';
  var CATS = ['mercado', 'restaurante', 'transporte', 'saude', 'educacao', 'lazer', 'assinaturas', 'casa', 'compras', 'viagens', 'encargos', 'outros'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
    return y + '-' + pad(m) + '-' + pad(d);
  }
  function somaDiasIso(base, n) { var p = base.split('-'), dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate()); }
  function difDias(a, b) { var pa = a.split('-'), pb = b.split('-'); return Math.round((Date.UTC(+pa[0], +pa[1] - 1, +pa[2]) - Date.UTC(+pb[0], +pb[1] - 1, +pb[2])) / 864e5); }
  function somaMes(dataIso, n) {
    var p = dataIso.split('-'), y = +p[0], m = +p[1] + n, d = +p[2];
    y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
    var ult = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return iso(y, m, Math.min(d, ult));
  }
  function txt(v, n) { return v == null ? '' : String(v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 120); }

  function valorBR(v) {
    if (typeof v === 'number') return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
    var s = txt(v, 40).replace(/R\$\s*/i, '').replace(/\s/g, '');
    if (!/^\d[\d.,]*$/.test(s)) return null;
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else s = s.replace(/,/g, '');
    var n = Number(s);
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  function dataBR(v) {
    var s = txt(v, 20), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return iso(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(s))) { var y = +m[3]; if (y < 100) y += 2000; return iso(y, +m[2], +m[1]); }
    return '';
  }
  function hora(v) { var m = /^(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(txt(v, 10)); if (!m) return ''; var hh = +m[1], mm = m[2] ? +m[2] : 0; return hh < 24 && mm < 60 ? pad(hh) + ':' + pad(mm) : ''; }

  /* módulo 10 (FEBRABAN) e módulo 11 (código de barras bancário / arrecadação) */
  function mod10(s) { var t = 0, w = 2; for (var i = s.length - 1; i >= 0; i--) { var p = +s[i] * w; t += Math.floor(p / 10) + p % 10; w = w === 2 ? 1 : 2; } return (10 - t % 10) % 10; }
  function mod11(s, banco) { var t = 0, w = 2; for (var i = s.length - 1; i >= 0; i--) { t += +s[i] * w; w = w < 9 ? w + 1 : 2; } var r = t % 11;
    if (banco) { var d = 11 - r; return d === 0 || d === 10 || d === 11 ? 1 : d; }
    return r === 0 || r === 1 ? 0 : 11 - r; }
  /* fator de vencimento: base 07/10/1997; a partir de 22/02/2025 o fator recomeça em 1000 */
  function vencFator(f) { if (!f) return ''; var a = somaDiasIso('1997-10-07', f), b = somaDiasIso('2025-02-22', f - 1000); return a >= '2025-02-22' ? a : b; }
  function linhaDigitavel(v) {
    var d = txt(v, 80).replace(/\D/g, ''), r = { ok: false, tipo: '', valor: null, vencimento: '', digitos: d };
    if (d.length === 47) {
      var c1 = d.slice(0, 9), c2 = d.slice(10, 20), c3 = d.slice(21, 31);
      if (mod10(c1) !== +d[9] || mod10(c2) !== +d[20] || mod10(c3) !== +d[31]) return r;
      var bar = d.slice(0, 4) + d[32] + d.slice(33, 47) + c1.slice(4) + c2 + c3;
      if (mod11(bar.slice(0, 4) + bar.slice(5), true) !== +bar[4]) return r;
      var f = +bar.slice(5, 9), val = +bar.slice(9, 19) / 100;
      r.ok = true; r.tipo = 'bancario'; r.valor = val > 0 ? val : null; r.vencimento = vencFator(f); return r;
    }
    if (d.length === 48 && d[0] === '8') {
      var blocos = [0, 1, 2, 3].map(function (i) { return d.slice(i * 12, i * 12 + 11); }), dvs = [0, 1, 2, 3].map(function (i) { return +d[i * 12 + 11]; });
      var usa10 = d[2] === '6' || d[2] === '7';
      for (var i = 0; i < 4; i++) if ((usa10 ? mod10(blocos[i]) : mod11(blocos[i], false)) !== dvs[i]) return r;
      var b = blocos.join('');
      if ((usa10 ? mod10(b.slice(0, 3) + b.slice(4)) : mod11(b.slice(0, 3) + b.slice(4), false)) !== +b[3]) return r;
      r.ok = true; r.tipo = 'arrecadacao';
      if (d[2] === '6' || d[2] === '8') { var vv = +b.slice(4, 15) / 100; r.valor = vv > 0 ? vv : null; }
      return r;
    }
    return r;
  }

  function palavras(s) { return txt(s, 120).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3 && ['ltda', 'para', 'com', 'distribuicao', 'pagamento', 'conta'].indexOf(w) < 0; }); }
  function casarComprovante(abertas, c) {
    if (!c || c.valor == null) return null;
    var pc = palavras(c.beneficiario), cand = (abertas || []).filter(function (x) { return x.valor != null && Math.abs(x.valor - c.valor) < 0.011; });
    if (!cand.length) return null;
    var ref = c.data || '';
    cand.sort(function (a, b) {
      var na = palavras(a.titulo).filter(function (w) { return pc.indexOf(w) >= 0; }).length, nb = palavras(b.titulo).filter(function (w) { return pc.indexOf(w) >= 0; }).length;
      if (na !== nb) return nb - na;
      return ref ? Math.abs(difDias(a.data, ref)) - Math.abs(difDias(b.data, ref)) : 0;
    });
    return cand[0];
  }
  function brl(v) { return v == null ? 'sem valor' : 'R$ ' + v.toFixed(2).replace('.', ','); }

  function normalizar(o, hoje, abertas) {
    o = o || {}; var tipo = txt(o.tipo, 20).toLowerCase(), out = [];
    if (tipo === 'boleto' || tipo === 'fatura') {
      var av = [], valor = valorBR(o.valor), venc = dataBR(o.vencimento), ld = o.linha_digitavel ? linhaDigitavel(o.linha_digitavel) : null;
      if (ld && ld.ok) {
        if (ld.valor != null && valor !== ld.valor) { if (valor != null) av.push('Valor lido (' + brl(valor) + ') diferente do da linha digitável; usei o da linha.'); valor = ld.valor; }
        if (ld.vencimento && venc !== ld.vencimento) { if (venc) av.push('Vencimento lido diferente do da linha digitável; usei o da linha.'); venc = ld.vencimento; }
        av.push('Linha digitável conferida (dígitos verificadores ok).');
      } else if (o.linha_digitavel) av.push('A linha digitável lida não confere (dígito verificador). Confira no papel.');
      if (!venc) av.push('Sem vencimento: confira a data.');
      var tit = txt(o.beneficiario, 80) || 'Boleto';
      out.push({ acao: 'conta', dados: { titulo: tit, valor: valor, data: venc || hoje, linha: ld && ld.ok ? ld.digitos : '' }, resumo: 'Nova conta: ' + tit + ', ' + brl(valor) + ', vence ' + (venc || hoje), avisos: av });
    } else if (tipo === 'comprovante') {
      var cv = { valor: valorBR(o.valor), beneficiario: o.beneficiario, data: dataBR(o.data_pagamento) || hoje }, m = casarComprovante(abertas, cv);
      if (m) out.push({ acao: 'pagar', dados: { tipo: m.tipo, id: m.id, chave: m.chave, pagaEm: cv.data }, resumo: 'Marcar como paga: ' + m.titulo + ' (' + brl(m.valor) + ', vence ' + m.data + '), paga em ' + cv.data, avisos: [] });
      else out.push({ acao: 'nada', dados: {}, resumo: 'Comprovante de ' + brl(cv.valor) + (o.beneficiario ? ' para ' + txt(o.beneficiario, 60) : ''), avisos: ['Não encontrei conta em aberto com esse valor. Nada será marcado.'] });
    } else if (tipo === 'acordo' || tipo === 'parcelamento') {
      var n = Math.min(60, Math.max(1, Math.round(Number(o.parcelas) || 0))), at = Math.max(1, Math.round(Number(o.parcela_atual) || 1)), vp = valorBR(o.valor_parcela), d0 = dataBR(o.primeiro_vencimento) || dataBR(o.vencimento);
      var nome = txt(o.beneficiario, 60) || 'Acordo';
      if (!d0 || !n) return [{ acao: 'nada', dados: {}, resumo: 'Acordo de ' + nome, avisos: ['Não consegui ler parcelas e vencimento.'] }];
      for (var k = at; k <= n; k++) { var dk = somaMes(d0, k - at); out.push({ acao: 'conta', dados: { titulo: nome + ' (parcela ' + k + '/' + n + ')', valor: vp, data: dk }, resumo: nome + ' parcela ' + k + '/' + n + ': ' + brl(vp) + ', vence ' + dk, avisos: [] }); }
    } else if (tipo === 'compromisso' || tipo === 'convite' || tipo === 'aviso' || tipo === 'receita' || tipo === 'conversa') {
      var ti = txt(o.titulo, 120) || 'Compromisso', dc = dataBR(o.data);
      if (dc) out.push({ acao: 'compromisso', dados: { titulo: ti, data: dc, hora: hora(o.hora), local: txt(o.local, 80) }, resumo: 'Agenda: ' + ti + ', ' + dc + (hora(o.hora) ? ' às ' + hora(o.hora) : '') + (o.local ? ' (' + txt(o.local, 80) + ')' : ''), avisos: [] });
      else out.push({ acao: 'lembrete', dados: { titulo: ti.slice(0, 100), dia: 0, obs: txt(o.obs, 160) }, resumo: 'Lembrete (sem data): ' + ti, avisos: [] });
    } else if (tipo === 'lista') {
      var vistos = [];
      (Array.isArray(o.itens) ? o.itens : []).slice(0, 40).forEach(function (it) { var s = txt(it, 120), k = s.toLowerCase(); if (!s || vistos.indexOf(k) >= 0) return; vistos.push(k); s = s.charAt(0).toUpperCase() + s.slice(1); out.push({ acao: 'tarefa', dados: { titulo: s }, resumo: 'Tarefa: ' + s, avisos: [] }); });
    } else if (tipo === 'cupom') {
      var cat = CATS.indexOf(txt(o.categoria, 20).toLowerCase()) >= 0 ? txt(o.categoria, 20).toLowerCase() : 'outros', tv = valorBR(o.total), dd = dataBR(o.data) || hoje, est = txt(o.estabelecimento, 80) || 'Compra';
      out.push({ acao: 'gasto', dados: { titulo: est, valor: tv, data: dd, cat: cat, paga: true }, resumo: 'Gasto pago: ' + est + ', ' + brl(tv) + ' em ' + dd + ' (' + cat + ')', avisos: tv == null ? ['Sem total legível.'] : [] });
    }
    return out;
  }

  var L = { valorBR: valorBR, dataBR: dataBR, hora: hora, linhaDigitavel: linhaDigitavel, casarComprovante: casarComprovante, normalizar: normalizar, CATS: CATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  if (raiz && raiz.PS) raiz.PS.leitura = L; else if (raiz) { raiz.PS = raiz.PS || {}; raiz.PS.leitura = L; }
})(typeof window !== 'undefined' ? window : null);
