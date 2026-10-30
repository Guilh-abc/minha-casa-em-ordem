/* Minha Casa em Ordem — leitura de planilha da nota (Excel .xlsx ou CSV) no próprio navegador, sem enviar o arquivo.
   .xlsx: lê o zip (DecompressionStream) e o XML da primeira aba (ou a que tiver "cupom"/"nota" no nome). */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};

  function u16(d, i) { return d[i] | (d[i + 1] << 8); }
  function u32(d, i) { return (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16)) + d[i + 3] * 16777216; }
  function texto(buf) { return new TextDecoder('utf-8').decode(buf); }

  function unzip(ab) {
    var d = new Uint8Array(ab), i, fim = -1, arq = {};
    for (i = d.length - 22; i >= Math.max(0, d.length - 66000); i--) if (u32(d, i) === 0x06054b50) { fim = i; break; }
    if (fim < 0) throw new Error('zip');
    var n = u16(d, fim + 10), p = u32(d, fim + 16);
    for (i = 0; i < n; i++) {
      if (u32(d, p) !== 0x02014b50) throw new Error('zip');
      var met = u16(d, p + 10), tam = u32(d, p + 20), ln = u16(d, p + 28), le = u16(d, p + 30), lc = u16(d, p + 32), loc = u32(d, p + 42);
      var nome = texto(d.subarray(p + 46, p + 46 + ln));
      var ini = loc + 30 + u16(d, loc + 26) + u16(d, loc + 28);
      arq[nome] = { met: met, dados: d.subarray(ini, ini + tam) };
      p += 46 + ln + le + lc;
    }
    return arq;
  }
  function abrir(arq, nome) {
    var e = arq[nome]; if (!e) return Promise.resolve('');
    if (e.met === 0) return Promise.resolve(texto(e.dados));
    if (typeof g.DecompressionStream !== 'function') return Promise.reject(new Error('semdescompressao'));
    var s = new Blob([e.dados]).stream().pipeThrough(new g.DecompressionStream('deflate-raw'));
    return new Response(s).arrayBuffer().then(texto);
  }
  function xml(t) { return new DOMParser().parseFromString(t, 'application/xml'); }
  function tags(n, nome) { return n.getElementsByTagNameNS ? n.getElementsByTagNameNS('*', nome) : n.getElementsByTagName(nome); }
  function txt(n) { var ts = tags(n, 't'), s = ''; for (var i = 0; i < ts.length; i++) s += ts[i].textContent; return s; }
  function col(ref) { var m = /^([A-Z]+)/.exec(ref || ''), c = 0; if (!m) return -1; for (var i = 0; i < m[1].length; i++) c = c * 26 + m[1].charCodeAt(i) - 64; return c - 1; }

  function lerXlsx(ab) {
    var arq = unzip(ab);
    return Promise.all([abrir(arq, 'xl/workbook.xml'), abrir(arq, 'xl/_rels/workbook.xml.rels'), abrir(arq, 'xl/sharedStrings.xml')]).then(function (r) {
      var alvo = '';
      if (r[0] && r[1]) {
        var sh = tags(xml(r[0]), 'sheet'), rels = tags(xml(r[1]), 'Relationship'), mapa = {}, i, esc = null;
        for (i = 0; i < rels.length; i++) mapa[rels[i].getAttribute('Id')] = rels[i].getAttribute('Target');
        for (i = 0; i < sh.length; i++) if (/cupom|nota/i.test(sh[i].getAttribute('name') || '')) { esc = sh[i]; break; }
        esc = esc || sh[0];
        if (esc) { var id = esc.getAttribute('r:id') || esc.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); alvo = mapa[id] || ''; }
        if (alvo) alvo = alvo.charAt(0) === '/' ? alvo.slice(1) : 'xl/' + alvo;
      }
      if (!arq[alvo]) for (var k in arq) if (/^xl\/worksheets\/[^/]+\.xml$/.test(k)) { alvo = k; break; }
      var comp = [];
      if (r[2]) { var si = tags(xml(r[2]), 'si'); for (var j = 0; j < si.length; j++) comp.push(txt(si[j])); }
      return abrir(arq, alvo).then(function (t) {
        var linhas = [], rows = tags(xml(t), 'row');
        for (var a = 0; a < rows.length; a++) {
          var lin = [], cs = tags(rows[a], 'c');
          for (var b = 0; b < cs.length; b++) {
            var c = cs[b], ti = c.getAttribute('t'), v = tags(c, 'v')[0], val;
            if (ti === 's') val = v ? comp[+v.textContent] : '';
            else if (ti === 'inlineStr') val = txt(c);
            else if (ti === 'str' || ti === 'b') val = v ? v.textContent : '';
            else val = v ? Number(v.textContent) : '';
            var ci = col(c.getAttribute('r')); if (ci < 0) ci = lin.length;
            lin[ci] = val;
          }
          var ri = +rows[a].getAttribute('r') || (linhas.length + 1);
          linhas[ri - 1] = lin;
        }
        for (var z = 0; z < linhas.length; z++) if (!linhas[z]) linhas[z] = [];
        return linhas;
      });
    });
  }

  function lerCsv(t) {
    t = t.replace(/^\uFEFF/, '');
    var pri = t.split(/\r?\n/).slice(0, 12).join('\n'), sep = ';';
    var cont = { ';': (pri.match(/;/g) || []).length, '\t': (pri.match(/\t/g) || []).length, ',': (pri.match(/,/g) || []).length / 3 };
    if (cont['\t'] > cont[sep]) sep = '\t'; if (cont[','] > cont[sep]) sep = ',';
    var linhas = [], lin = [], cel = '', q = false, i, ch;
    for (i = 0; i < t.length; i++) {
      ch = t.charAt(i);
      if (q) { if (ch === '"') { if (t.charAt(i + 1) === '"') { cel += '"'; i++; } else q = false; } else cel += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { lin.push(cel); cel = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t.charAt(i + 1) === '\n') i++; lin.push(cel); linhas.push(lin); lin = []; cel = ''; }
      else cel += ch;
    }
    if (cel || lin.length) { lin.push(cel); linhas.push(lin); }
    return linhas;
  }

  function sem(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v == null ? '' : v).replace(/r\$|\s/gi, '');
    var m = /-?[\d.,]+/.exec(s); if (!m) return null; s = m[0];
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = parseFloat(s); return isFinite(n) ? n : null;
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function dataDe(s) {
    var m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (m) return m[3] + '-' + m[2] + '-' + m[1];
    m = /(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? m[0] : '';
  }
  function valorApos(t, re) { var m = re.exec(t); return m ? num(m[1]) : null; }

  /* linhas (matriz) -> { loja, data, itens, desconto, total, bruto, somaItens } ou erro */
  function paraNota(linhas) {
    var h = -1, mapa = null, i, j;
    for (i = 0; i < Math.min(linhas.length, 40) && h < 0; i++) {
      var m = { nome: -1, qtd: -1, unit: -1, total: -1, item: -1 };
      for (j = 0; j < linhas[i].length; j++) {
        var c = sem(linhas[i][j]); if (!c) continue;
        if (/descri|produto|mercadoria/.test(c) && m.nome < 0) m.nome = j;
        else if (/^(qtd|qtde|quant)/.test(c) && m.qtd < 0) m.qtd = j;
        else if (/unit/.test(c) && m.unit < 0) m.unit = j;
        else if (/total|valor|preco/.test(c) && m.total < 0) m.total = j;
        else if (/^(item|n|nº|no|#)\.?$/.test(c)) m.item = j;
      }
      if (m.nome < 0 && m.item >= 0 && m.total >= 0) { m.nome = m.item; }
      if (m.nome >= 0 && m.total >= 0) { h = i; mapa = m; }
    }
    if (h < 0) return { erro: 'Não achei o cabeçalho com Descrição e Valor total na planilha.' };
    var topo = linhas.slice(0, h).map(function (l) { return l.filter(function (x) { return x !== '' && x != null; }).join(' '); }).filter(Boolean);
    var tt = topo.join('\n'), loja = '';
    for (i = 0; i < topo.length; i++) if (!/cnpj|valor|total|desconto|pagar|^\s*data/i.test(topo[i]) && /[a-z]/i.test(topo[i])) { loja = topo[i].trim(); break; }
    var itens = [];
    for (i = h + 1; i < linhas.length; i++) {
      var l = linhas[i], nome = String(l[mapa.nome] == null ? '' : l[mapa.nome]).trim(), tot = num(l[mapa.total]);
      if (!nome) continue;
      if (/^(total|subtotal|desconto|valor a pagar|troco)/i.test(sem(nome))) continue;
      if (tot == null) continue;
      var q = mapa.qtd >= 0 ? num(String(l[mapa.qtd]).split(/\s|\(/)[0]) : null;
      if (typeof l[mapa.qtd] === 'number') q = l[mapa.qtd];
      var un = mapa.unit >= 0 ? num(l[mapa.unit]) : null;
      itens.push({ nome: nome.slice(0, 80), qtd: q, unit: un, total: r2(tot) });
    }
    if (!itens.length) return { erro: 'A planilha não tem itens com valor.' };
    var soma = r2(itens.reduce(function (t, x) { return t + x.total; }, 0));
    var bruto = valorApos(tt, /valor\s*total[^\d-]*([\d.,]+)/i), desc = valorApos(tt, /desconto[^\d-]*([\d.,]+)/i), pagar = valorApos(tt, /(?:valor\s*a\s*pagar|total\s*pago|valor\s*pago)[^\d-]*([\d.,]+)/i);
    var total = pagar != null ? pagar : (bruto != null ? r2(bruto - (desc || 0)) : null);
    var data = dataDe(tt);
    return { loja: loja.slice(0, 80), data: data, itens: itens.slice(0, 250), desconto: desc || null, total: total, bruto: bruto, somaItens: soma };
  }

  function ler(arquivo) {
    var nome = (arquivo && arquivo.name || '').toLowerCase();
    var rd = function (modo) { return new Promise(function (ok, falha) { var f = new FileReader(); f.onload = function () { ok(f.result); }; f.onerror = function () { falha(new Error('leitura')); }; if (modo) f.readAsArrayBuffer(arquivo); else f.readAsText(arquivo); }); };
    if (/\.(csv|txt)$/.test(nome) || /csv|text/.test(arquivo.type || '')) return rd(false).then(lerCsv);
    if (/\.xls$/.test(nome)) return Promise.reject(new Error('xlsantigo'));
    return rd(true).then(lerXlsx);
  }

  PS.planilha = { ler: ler, lerCsv: lerCsv, lerXlsx: lerXlsx, paraNota: paraNota, num: num };
})(typeof window !== 'undefined' ? window : this);
