/* Navegação espacial por controle remoto (D-pad), teclado e botão Voltar. Sem bibliotecas. */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u;
  var SEL = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-f]';
  var DIRS = { 37: 'esq', 38: 'cima', 39: 'dir', 40: 'baixo', ArrowLeft: 'esq', ArrowUp: 'cima', ArrowRight: 'dir', ArrowDown: 'baixo', Left: 'esq', Up: 'cima', Right: 'dir', Down: 'baixo' };
  var OK = { Enter: 1, NumpadEnter: 1, Select: 1, 13: 1, 23: 1, 66: 1, 109: 1 };
  var VOLTAR = { Escape: 1, Esc: 1, GoBack: 1, BrowserBack: 1, Backspace: 1, 27: 1, 8: 1, 4: 1, 461: 1, 10009: 1 };
  var MENU = { ContextMenu: 1, Menu: 1, 93: 1, 82: 1 };
  var saidaPendente = 0;
  var ROTAS_ATALHO = ['', 'rotina', 'tarefas', 'agenda', 'familia', 'relaxar', 'gerenciar'];

  function visivel(el) {
    if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var cs = g.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function raizAtiva() { var m = document.querySelector('.modal'); return m || document; }
  function candidatos(raiz) { return Array.prototype.filter.call(raiz.querySelectorAll(SEL), visivel); }
  function editavel(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName;
    if (t === 'TEXTAREA') return true;
    if (t === 'INPUT') return ['checkbox', 'radio', 'button', 'file', 'submit', 'range'].indexOf((el.type || '').toLowerCase()) < 0;
    return el.isContentEditable === true;
  }

  function garantirVisivel(el) {
    var main = document.getElementById('app');
    if (!main || el.closest('.modal') || !main.contains(el)) return;
    var r = el.getBoundingClientRect(), m = main.getBoundingClientRect(), folga = 16;
    if (r.top < m.top + folga) main.scrollTop -= (m.top + folga - r.top);
    else if (r.bottom > m.bottom - folga) main.scrollTop += (r.bottom - (m.bottom - folga));
    if (main.firstElementChild && !candidatos(main).some(function (c) { return c.getBoundingClientRect().top < r.top - 4; })) main.scrollTop = 0;
    /* telas rolando a página (celular) */
    if (g.innerWidth < 800) { try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ok */ } }
  }
  function focar(el) {
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    garantirVisivel(el);
  }

  /* escolhe o melhor vizinho na direção pedida */
  function vizinho(atual, dir, lista) {
    var r = atual.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var melhor = null, melhorPts = Infinity;
    lista.forEach(function (c) {
      if (c === atual || atual.contains(c) || c.contains(atual)) return;
      var q = c.getBoundingClientRect(), qx = q.left + q.width / 2, qy = q.top + q.height / 2, prim, sec, sobrepoe;
      if (dir === 'dir') { if (qx <= cx + 1 || q.right <= r.right - 1) return; prim = Math.max(0, q.left - r.right); sec = Math.abs(qy - cy); sobrepoe = q.top < r.bottom && q.bottom > r.top; }
      else if (dir === 'esq') { if (qx >= cx - 1 || q.left >= r.left + 1) return; prim = Math.max(0, r.left - q.right); sec = Math.abs(qy - cy); sobrepoe = q.top < r.bottom && q.bottom > r.top; }
      else if (dir === 'baixo') { if (qy <= cy + 1 || q.bottom <= r.bottom - 1) return; prim = Math.max(0, q.top - r.bottom); sec = Math.abs(qx - cx); sobrepoe = q.left < r.right && q.right > r.left; }
      else { if (qy >= cy - 1 || q.top >= r.top + 1) return; prim = Math.max(0, r.top - q.bottom); sec = Math.abs(qx - cx); sobrepoe = q.left < r.right && q.right > r.left; }
      var pts = prim + sec * (sobrepoe ? 1.5 : 5);
      if (pts < melhorPts) { melhorPts = pts; melhor = c; }
    });
    return melhor;
  }
  function mover(dir) {
    var raiz = raizAtiva(), lista = candidatos(raiz), atual = document.activeElement;
    if (!atual || atual === document.body || !raiz.contains(atual) || lista.indexOf(atual) < 0) {
      var ini = lista.filter(function (e) { return !e.closest('.topo'); })[0] || lista[0];
      if (ini) { focar(ini); return true; }
      return false;
    }
    var v = vizinho(atual, dir, lista);
    if (v) { focar(v); return true; }
    return false;
  }
  function focarPrimeiro() {
    var main = document.getElementById('app'), l = candidatos(main);
    if (l.length) { focar(l[0]); return true; }
    var a = document.querySelector('.menu a[aria-current="page"]') || document.querySelector('.menu a');
    if (a) { focar(a); return true; }
    return false;
  }
  function focarMenu() { var a = document.querySelector('.menu a[aria-current="page"]') || document.querySelector('.menu a'); if (a) focar(a); }

  /* Voltar: fecha modal -> volta ao Hoje -> (no Hoje) aperte 2x para sair. Retorna 'sair' quando é para sair. */
  function voltar(nativo) {
    if (PS.bloqueio && PS.bloqueio.aberto()) return 'ok';
    if (PS.modal && PS.modal.aberto()) { PS.modal.fechar(); return 'ok'; }
    var rota = PS.rotaAtual || '';
    if (rota !== '') { saidaPendente = 0; g.location.hash = '#/'; return 'ok'; }
    var agora = Date.now();
    if (agora - saidaPendente < 2200) {
      saidaPendente = 0;
      if (!nativo) { try { g.history.back(); } catch (e) { /* ok */ } }
      return 'sair';
    }
    saidaPendente = agora; PS.aviso('Aperte Voltar de novo para sair'); return 'ok';
  }

  function aoTecla(e) {
    var k = e.key, c = e.keyCode, alvo = e.target;
    if (PS.tecla) PS.tecla(e);                    /* tela de diagnóstico #/teclas registra tudo */
    PS.atividade && PS.atividade();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (PS.capturaTecla && PS.capturaTecla(e)) return;           /* teclados numéricos (PIN) consomem dígitos e Backspace */
    var emTeclas = PS.rotaAtual === 'teclas';
    var dir = DIRS[k] || DIRS[c];
    var edit = editavel(alvo);
    if (dir) {
      if (edit && (dir === 'esq' || dir === 'dir')) return;       /* cursor do texto */
      if (alvo && alvo.tagName === 'SELECT') return;               /* valor do select */
      if (alvo && alvo.tagName === 'INPUT' && ['number', 'date', 'time'].indexOf(alvo.type) >= 0 && (dir === 'cima' || dir === 'baixo') && !e.shiftKey) { /* setas alteram valor; use Tab/Shift+setas */ return; }
      if (mover(dir)) e.preventDefault();
      return;
    }
    if (OK[k] || OK[c]) {
      if (edit || (alvo && alvo.tagName === 'SELECT')) { if (alvo.tagName !== 'TEXTAREA' && (k === 'Enter' || c === 13)) { /* Enter em campo de texto: confirma e sai do campo */ if (alvo.tagName === 'INPUT') alvo.blur(); e.preventDefault(); } return; }
      if (alvo && alvo !== document.body && alvo.click) { e.preventDefault(); alvo.click(); }
      else { e.preventDefault(); focarPrimeiro(); }
      return;
    }
    if (emTeclas) { if (VOLTAR[k] || VOLTAR[c] || MENU[k] || MENU[c]) e.preventDefault(); return; }
    if (VOLTAR[k] || VOLTAR[c]) {
      if (edit) { if (k === 'Escape' || c === 27) { alvo.blur(); e.preventDefault(); } return; }
      e.preventDefault(); voltar(); return;
    }
    if (!edit && (MENU[k] || MENU[c])) { e.preventDefault(); focarMenu(); return; }   /* 82 = tecla R: só vale fora de campo de texto */
    if (!edit && !e.shiftKey && /^[1-7]$/.test(k || '')) { var r = ROTAS_ATALHO[+k - 1]; g.location.hash = '#/' + r; }
  }
  document.addEventListener('keydown', aoTecla, true);

  PS.voltarNativo = function () { return voltar(true); };
  PS.nav = { mover: mover, focar: focar, focarPrimeiro: focarPrimeiro, focarMenu: focarMenu, voltar: voltar, candidatos: candidatos };

  /* ---- modal e aviso ---- */
  var modalEl = null, focoAntes = null;
  PS.modal = {
    aberto: function () { return !!modalEl; },
    abrir: function (titulo, corpo, botoes) {
      PS.modal.fechar(true);
      focoAntes = document.activeElement;
      var acoes = U.h('div', { class: 'acoes' });
      botoes.forEach(function (b, i) {
        acoes.appendChild(U.h('button', { class: 'btn' + (b.tipo ? ' ' + b.tipo : ''), type: 'button', onclick: function () { PS.modal.fechar(); if (b.acao) b.acao(); } }, b.rotulo));
      });
      modalEl = U.h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, U.h('div', { class: 'modal-caixa' }, U.h('h2', null, titulo), U.h('div', { class: 'corpo' }, corpo), acoes));
      document.body.appendChild(modalEl);
      var p = modalEl.querySelector('button'); if (p) p.focus();
    },
    fechar: function (semFoco) {
      if (!modalEl) return;
      modalEl.parentNode.removeChild(modalEl); modalEl = null;
      if (!semFoco && focoAntes && document.contains(focoAntes)) focoAntes.focus();
    }
  };
  var tToast = null;
  PS.aviso = function (msg) {
    var t = document.querySelector('.toast'); if (t) t.parentNode.removeChild(t);
    t = U.h('div', { class: 'toast', role: 'status' }, msg); document.body.appendChild(t);
    clearTimeout(tToast); tToast = setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
  };
})(window);
