/* Service worker simples: rede primeiro, cache como reserva (casca offline). Troque VERSAO a cada release (tools/versionar.sh faz isso). */
var VERSAO = 'minha-casa-b0da738';
var ARQUIVOS = ['./', 'dados.json', 'manifest.webmanifest', 'assets/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'css/tokens.css', 'css/base.css', 'css/app.css',
  'js/util.js', 'js/cripto.js', 'js/sync-nucleo.js', 'js/sync.js', 'js/sincronizar.js', 'js/bloqueio.js', 'js/portal.js', 'js/icons.js', 'js/store.js', 'js/repeticao.js', 'js/dominio.js', 'js/clima.js', 'js/ics.js', 'js/financeiro.js', 'js/financas-ui.js', 'js/lembretes.js', 'js/cartoes-calc.js', 'js/fatura-parser.js', 'js/graficos.js', 'js/pdf-importar.js', 'js/cartoes.js', 'js/nav.js', 'js/energia.js', 'js/telas.js', 'js/gerenciar.js', 'js/assistente-consultas.js', 'js/ajudante-gemini.js', 'js/assistente.js', 'js/mascara.js', 'js/foto-nucleo.js', 'js/foto.js', 'js/notas-nucleo.js', 'js/planilha.js', 'js/notas.js', 'js/app.js'];

self.addEventListener('install', function (e) {
  /* pré-carrega a casca; NÃO guarda resposta redirecionada/de erro (ex.: tela de login quando a sessão expirou) */
  e.waitUntil(caches.open(VERSAO).then(function (c) {
    return Promise.all(ARQUIVOS.map(function (u) { return fetch(u, { cache: 'reload', credentials: 'same-origin' }).then(function (r) { if (r.ok && !r.redirected) return c.put(u, r); throw new Error('sem cache: ' + u); }); }));
  }).then(function () { return self.skipWaiting(); }));
});
/* sair da conta: o app pede para apagar tudo que a casa guardou em cache */
self.addEventListener('message', function (e) {
  if (e.data && e.data.tipo === 'limpar-cache') e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSAO; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;   /* clima etc. vão direto à rede */
  e.respondWith(new Promise(function (ok) {
    var passou = false;
    var t = setTimeout(function () { caches.match(r, { ignoreSearch: true }).then(function (c) { if (c && !passou) { passou = true; ok(c); } }); }, 4000);
    fetch(r).then(function (resp) {
      clearTimeout(t);
      if (resp && resp.ok && !resp.redirected && !/\/(login|primeiro-acesso|conta)(\/|$)/.test(new URL(resp.url || r.url).pathname)) { var cp = resp.clone(); caches.open(VERSAO).then(function (c) { c.put(r, cp); }); }
      if (!passou) { passou = true; ok(resp); }
    }, function () {
      clearTimeout(t);
      caches.match(r, { ignoreSearch: true }).then(function (c) { if (!passou) { passou = true; ok(c || Response.error()); } });
    });
  }));
});

/* ---- avisos de vencimento (sem push): lê a agenda gravada pelo app no IndexedDB e notifica quando o navegador acordar o SW ---- */
function lerAgenda() {
  return new Promise(function (ok) {
    try {
      var rq = indexedDB.open('painelsala-agenda', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
      rq.onerror = function () { ok(null); };
      rq.onsuccess = function () { var db = rq.result, g = db.transaction('kv', 'readonly').objectStore('kv').get('agenda'); g.onsuccess = function () { ok({ db: db, v: g.result }); }; g.onerror = function () { ok(null); }; };
    } catch (e) { ok(null); }
  });
}
function hojeSP() { var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); return p; }
function horaSP() { return +new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()) % 24; }
function checarAvisos() {
  return lerAgenda().then(function (r) {
    if (!r || !r.v || !r.v.agenda || horaSP() < 8) return;
    var hoje = hojeSP(), env = r.v.enviados || {}, novos = [];
    r.v.agenda.forEach(function (a) { if (a.avisar === hoje && !env[a.chave]) novos.push(a); });
    if (!novos.length) return;
    novos.forEach(function (a) { env[a.chave] = hoje; });
    return Promise.all(novos.map(function (a) { return self.registration.showNotification(a.titulo, { body: a.corpo, tag: a.chave, icon: 'icons/icon-192.png', data: { url: '#/contas' }, lang: 'pt-BR' }); })).then(function () {
      var tx = r.db.transaction('kv', 'readwrite'); r.v.enviados = env; tx.objectStore('kv').put(r.v, 'agenda');
    });
  });
}
self.addEventListener('periodicsync', function (e) { if (e.tag === 'painel-contas') e.waitUntil(checarAvisos()); });
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var alvo = new URL((e.notification.data && e.notification.data.url) || '#/contas', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if ('focus' in cs[i]) { cs[i].navigate && cs[i].navigate(alvo); return cs[i].focus(); } }
    return self.clients.openWindow(alvo);
  }));
});
