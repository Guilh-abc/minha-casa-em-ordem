/* Máscaras de data e hora para campos digitados (teclado numérico do Android não tem "/" nem ":").
   30102026 -> 30/10/2026, 301026 -> 30/10/26, 1430 -> 14:30. Aceita também com barra, hífen ou ponto. byGui */
(function (raiz) {
  'use strict';
  function digitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  /* formata enquanto digita: só dígitos, barras automáticas */
  function data(txt) {
    var s = String(txt == null ? '' : txt), d;
    if (/^\s*\d{4}-\d{2}-\d{2}\s*$/.test(s)) return s.trim().slice(8, 10) + '/' + s.trim().slice(5, 7) + '/' + s.trim().slice(0, 4);
    /* "3.10.26" / "3-10" / "3/10/2026": completa o dia/mês com zero antes de juntar */
    var p = s.split(/[\/.\-\s]+/).filter(Boolean);
    if (p.length > 1) d = p.map(function (x, i) { x = digitos(x); return i < 2 && x.length === 1 ? '0' + x : x; }).join('');
    else {
      d = digitos(s);
      if (d && d.charAt(0) > '3') d = '0' + d;                       /* dia 4 a 9 -> 04 a 09 */
      if (d.length >= 3 && d.charAt(2) > '1') d = d.slice(0, 2) + '0' + d.slice(2);   /* mês 2 a 9 -> 02 a 09 */
    }
    d = d.slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return d.slice(0, 2) + '/' + d.slice(2);
    return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
  }
  function hora(txt) {
    var s = String(txt == null ? '' : txt), d, p = s.split(/[:hH.\s]+/).filter(Boolean);
    if (p.length > 1) d = p.map(function (x, i) { x = digitos(x); return i === 0 && x.length === 1 ? '0' + x : x; }).join('');
    else { d = digitos(s); if (d && d.charAt(0) > '2') d = '0' + d; }   /* 9 -> 09 (nenhuma hora começa com 3 a 9) */
    d = d.slice(0, 4);
    return d.length <= 2 ? d : d.slice(0, 2) + ':' + d.slice(2);
  }
  /* liga a máscara num <input> de texto */
  function aplicar(el, tipo) {
    if (!el) return el;
    el.type = 'text'; el.setAttribute('inputmode', 'numeric'); el.setAttribute('autocomplete', 'off');
    el.setAttribute('maxlength', tipo === 'hora' ? '5' : '10'); el.setAttribute('placeholder', tipo === 'hora' ? 'HH:MM' : 'DD/MM/AAAA');
    var f = tipo === 'hora' ? hora : data;
    if (el.value) el.value = f(el.value);
    el.addEventListener('input', function (e) {
      if (e && e.inputType === 'deleteContentBackward') return;   /* apagar não recoloca a barra */
      var v = f(el.value); if (v !== el.value) { el.value = v; try { el.setSelectionRange(v.length, v.length); } catch (x) {} }
    });
    el.addEventListener('blur', function () {
      var v = el.value; if (!v) return;
      /* "3/1" no fim vira "03/01"; "9" na hora vira "09:00" */
      if (tipo === 'hora') { var d = digitos(v); if (d.length && d.length <= 2) v = (d.length === 1 ? '0' : '') + d + ':00'; else if (d.length === 3) v = hora('0' + d); else v = hora(v); }
      else { v = data(v.replace(/^(\d)(?=\/)/, '0$1')); v = v.replace(/^(\d\d\/\d\d\/)(\d\d)$/, '$120$2'); }   /* ano 26 vira 2026 ao sair */
      if (v !== el.value) { el.value = v; try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (x) {} }
    });
    return el;
  }
  var M = { data: data, hora: hora, aplicar: aplicar };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  if (raiz) { raiz.PS = raiz.PS || {}; raiz.PS.mascara = M; }
})(typeof window !== 'undefined' ? window : null);
