/* Inicialização, roteador (hash SPA), relógio e PWA. */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, S = PS.store;
  var ROTAS = ['', 'rotina', 'tarefas', 'agenda', 'familia', 'cartoes', 'relaxar', 'gerenciar', 'assistente', 'importar', 'instalar', 'sincronizar'];
  var viewAtual = null, paramAtual = '';
  var principal = function () { return document.getElementById('app'); };

  PS.aplicarConfig = function () {
    var c = S.get().config, r = document.documentElement;
    r.classList.remove('fonte-1', 'fonte-2', 'fonte-3');
    r.classList.add('fonte-' + c.fonte);
    r.classList.toggle('contraste', !!c.contraste);
    var ag = U.agora(); r.classList.toggle('noite', !!c.noiteAuto && (ag.h >= 22 || ag.h < 6));
  };

  function lerHash() {
    var m = /^#\/([^\/?]*)(?:\/(.*))?$/.exec(g.location.hash || '');
    var rota = m ? decodeURIComponent(m[1]) : '';
    if (ROTAS.indexOf(rota) < 0) rota = '';
    return { rota: rota, param: m && m[2] ? m[2] : '' };
  }

  function atualizarMenu() {
    var as = document.querySelectorAll('.menu a, .btn-ajudante');
    Array.prototype.forEach.call(as, function (a) {
      var r = a.getAttribute('href').replace('#/', '');
      if (r === (PS.rotaAtual === 'importar' || PS.rotaAtual === 'instalar' || PS.rotaAtual === 'sincronizar' ? '__' : PS.rotaAtual)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* desenha a tela; mantém o foco no mesmo item (data-fid) quando só os dados mudaram */
  function desenhar(manterFoco) {
    var main = principal(), v = PS.views[viewAtual || 'hoje'];
    var foco = document.activeElement, fid = manterFoco && foco && foco.getAttribute && foco.getAttribute('data-fid');
    var foiMenu = foco && foco.closest && foco.closest('.menu');
    var rolagem = main.scrollTop;
    var no = v.render(paramAtual);
    U.limpar(main); main.appendChild(no);
    document.title = (v.titulo && viewAtual !== 'hoje' ? v.titulo + ' · ' : '') + 'Minha Casa em Ordem';
    tick();
    if (PS.lembretes) PS.lembretes.atualizarBadge();
    if (manterFoco) {
      main.scrollTop = rolagem;
      if (fid) { var alvo = main.querySelector('[data-fid="' + fid.replace(/"/g, '\\"') + '"]'); if (alvo) { PS.nav.focar(alvo); return; } }
      if (foiMenu) return;
      if (fid) PS.nav.focarPrimeiro();
    }
  }
  PS.redesenhar = function () { desenhar(true); };

  function rotear(primeira) {
    var h = lerHash(), mudou = h.rota !== PS.rotaAtual || h.param !== paramAtual;
    var doMenu = document.activeElement && document.activeElement.closest && document.activeElement.closest('.menu');
    PS.rotaAtual = h.rota; paramAtual = h.param; viewAtual = h.rota === '' ? 'hoje' : h.rota;
    atualizarMenu();
    if (!mudou && !primeira) return;
    principal().scrollTop = 0;
    desenhar(false);
    if (primeira || !doMenu) PS.nav.focarPrimeiro();
    else if (doMenu) { /* mantém no menu para trocar de tela com ◀ ▶ */ }
  }

  function tick() {
    var ag = U.agora(), hh = U.pad(ag.h), mm = U.pad(ag.mi);
    Array.prototype.forEach.call(document.querySelectorAll('.relogio'), function (el) {
      var a = el.querySelector('.rh'), b = el.querySelector('.rm');
      if (a && a.textContent !== hh) a.textContent = hh; if (b && b.textContent !== mm) b.textContent = mm;
    });
    if (PS.diaAtual && PS.diaAtual !== ag.iso && PS.views[viewAtual] && PS.views[viewAtual].reativo) { PS.diaAtual = ag.iso; desenhar(true); }
    PS.diaAtual = ag.iso;
  }

  function registrarSW() {
    if (!('serviceWorker' in navigator)) return;
    if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline-first é opcional */ });
  }

  function iniciar() {
    S.iniciar('dados.json').then(function () {
      S.fixasAutoUmaVez(PS.u.hoje());
      PS.aplicarConfig();
      if (PS.sync) PS.sync.aoMudar(function () { if (viewAtual === 'hoje') { var chip = document.querySelector('.sync-chip'); if (chip && PS.atualizarChipSync) PS.atualizarChipSync(chip); } });
      S.aoMudar(function () { var v = PS.views[viewAtual]; if (v && v.reativo) desenhar(true); });
      g.addEventListener('hashchange', function () { rotear(false); });
      g.addEventListener('storage', function (e) { if (e.key === 'painelsala.dados') { S.iniciar().then(function () { PS.aplicarConfig(); PS.redesenhar(); }); } });
      rotear(true);
      setInterval(tick, 1000);
      setInterval(function () { if (viewAtual === 'hoje') { PS.clima.obter(S.get().config, true).then(function (d) { if (viewAtual === 'hoje') desenhar(true); }, function () {}); } }, 30 * 60 * 1000);
      var sp = document.getElementById('splash');
      setTimeout(function () { if (sp) { sp.classList.add('fim'); setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 600); } }, 700);
      registrarSW();
      if (PS.sync) PS.sync.iniciar();
      if (PS.lembretes) PS.lembretes.iniciar();
      if (PS.bloqueio) PS.bloqueio.aoAbrir();
    }).catch(function (e) { console.error(e); document.getElementById('app').textContent = 'Erro ao iniciar: ' + e.message; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window);
