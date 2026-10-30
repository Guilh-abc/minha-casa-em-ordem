/* Lembretes de vencimento no aparelho: notificação local (Notification API / service worker), emblema (badge) e agenda para o SW.
   Sem servidor de push. O que funciona com o app fechado está descrito em textoHonesto() e em docs/LEMBRETES.md. ES5. */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, S = PS.store, F = PS.fin;
  var CHAVE_ENV = 'painelsala.lembretes.enviados';
  var DB = 'painelsala-agenda';

  function suporte() {
    var n = typeof Notification !== 'undefined';
    var sw = 'serviceWorker' in navigator;
    return { notif: n, sw: sw, periodico: sw && typeof g.ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in g.ServiceWorkerRegistration.prototype, perm: n ? Notification.permission : 'indisponivel' };
  }
  function ativo() { var s = suporte(); return !!(S.get().config.notificar && s.notif && s.perm === 'granted'); }

  function lerEnv() { try { var o = JSON.parse(localStorage.getItem(CHAVE_ENV) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function gravarEnv(o) { try { localStorage.setItem(CHAVE_ENV, JSON.stringify(o)); } catch (e) { /* ok */ } }

  /* ---- agenda legível pelo service worker (IndexedDB, só neste aparelho) ---- */
  function abrirDB() {
    return new Promise(function (ok, erro) {
      var rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
      rq.onsuccess = function () { ok(rq.result); }; rq.onerror = function () { erro(rq.error); };
    });
  }
  function gravarAgenda(valor) {
    if (!g.indexedDB) return Promise.resolve();
    return abrirDB().then(function (db) {
      return new Promise(function (ok) { var tx = db.transaction('kv', 'readwrite'); if (valor) tx.objectStore('kv').put(valor, 'agenda'); else tx.objectStore('kv').delete('agenda'); tx.oncomplete = function () { db.close(); ok(); }; tx.onerror = function () { db.close(); ok(); }; });
    }).catch(function () { /* sem IDB: só o modo "app aberto" */ });
  }
  function salvarAgenda() {
    if (!ativo()) return gravarAgenda(null);
    var c = S.get().config;
    return gravarAgenda({ agenda: F.agendaParaSW(S.get(), U.hoje(), c.antecedencia), enviados: lerEnv(), gerada: U.hoje() });
  }

  function mostrar(l) {
    var opc = { body: l.corpo, tag: l.chave, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: l.href || '#/contas' }, lang: 'pt-BR' };
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      return navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(l.titulo, opc); }).catch(function () { try { new Notification(l.titulo, opc); } catch (e) { /* ok */ } });
    }
    try { new Notification(l.titulo, opc); } catch (e) { /* ok */ }
    return Promise.resolve();
  }

  /* verifica agora (relógio injetável nos testes: PS.lembretes.verificar(dataIso, hora)) */
  function verificar(hojeIso, hora) {
    if (!ativo()) return [];
    var ag = U.agora(), hoje = hojeIso || ag.iso, hh = hora == null ? ag.h : hora;
    var env = F.podarEnviados(lerEnv(), hoje);
    var lista = F.lembretesPara(S.get(), hoje, S.get().config.antecedencia, env, hh);
    lista.forEach(function (l) { env[l.chave] = hoje; mostrar(l); });
    gravarEnv(env); salvarAgenda();
    return lista;
  }

  function ativar() {
    var s = suporte();
    if (!s.notif) return Promise.resolve({ ok: false, msg: 'Este aparelho/navegador não permite notificações. Use o .ics (calendário).' });
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') return { ok: false, msg: 'Permissão negada. Libere em Configurações do navegador, ou use o .ics.' };
      S.alterar(function (st) { st.config.notificar = true; }, true);
      return (s.sw ? navigator.serviceWorker.ready : Promise.resolve(null)).then(function (reg) {
        if (reg && reg.periodicSync) { try { return reg.periodicSync.register('painel-contas', { minInterval: 12 * 3600 * 1000 }).catch(function () {}); } catch (e) { /* ok */ } }
      }).then(function () {
        salvarAgenda(); mostrar({ chave: 'teste:' + Date.now(), titulo: 'Avisos ligados', corpo: 'Você será avisado sobre contas e faturas a vencer.', href: '#/contas' });
        return { ok: true, msg: 'Avisos ligados neste aparelho.' };
      });
    });
  }
  function desativar() { S.alterar(function (st) { st.config.notificar = false; }, true); gravarAgenda(null); }

  function textoHonesto() {
    var s = suporte();
    return 'O que funciona: com o app ABERTO no celular os avisos aparecem na tela "Atenção agora"' + (s.notif ? ' e, se você ativar, como notificação do sistema' : '') + '. ' +
      'Com o app FECHADO: no Android com o painel instalado pelo Chrome, o aviso só chega se o Chrome liberar a sincronização periódica em segundo plano — o Android decide o horário e pode atrasar ou não rodar. No iPhone não há aviso com o app fechado. ' +
      'O jeito confiável é "Adicionar ao calendário (.ics)": o alarme fica no calendário do celular e toca mesmo com o painel fechado. Nada disso paga ou confirma pagamento.';
  }

  /* emblema no menu (Contas a pagar) e no ícone do app, com vencidas + hoje */
  function atualizarBadge() {
    try {
      var r = F.resumo(F.pendencias(S.get(), U.hoje(), 7)), n = r.urgentes;
      var a = document.querySelector('.menu a[href="#/contas"]');
      if (a) {
        var b = a.querySelector('.badge-menu');
        if (n > 0) { if (!b) { b = document.createElement('span'); b.className = 'badge-menu'; a.appendChild(b); } b.textContent = n; b.setAttribute('aria-label', n + (n > 1 ? ' contas urgentes' : ' conta urgente')); }
        else if (b) a.removeChild(b);
      }
      if (navigator.setAppBadge) { if (n > 0) navigator.setAppBadge(n).catch(function () {}); else navigator.clearAppBadge && navigator.clearAppBadge().catch(function () {}); }
    } catch (e) { /* ok */ }
  }

  function iniciar() {
    setTimeout(verificar, 3000);
    setInterval(verificar, 5 * 60 * 1000);
    g.addEventListener('focus', function () { verificar(); atualizarBadge(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) verificar(); });
    S.aoMudar(function () { atualizarBadge(); });
    atualizarBadge();
  }

  PS.lembretes = { suporte: suporte, ativo: ativo, ativar: ativar, desativar: desativar, verificar: verificar, textoHonesto: textoHonesto, atualizarBadge: atualizarBadge, salvarAgenda: salvarAgenda, iniciar: iniciar };
})(window);
