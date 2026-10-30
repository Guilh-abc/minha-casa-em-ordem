/* Portal: quando o app roda atrás do login (Cloudflare), mostra quem está logado, "Conta" e "Sair" no rodapé.
   No GitHub Pages (sem login) /api/me não existe e este arquivo não faz nada. Nunca lê nem guarda senha. */
(function () {
  'use strict';
  var rodape = document.querySelector('.rodape'); if (!rodape || !window.fetch) return;
  function limparTudo() {
    var p = [];
    try { if (window.caches) p.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })); } catch (e) {}
    try { if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) p.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })); } catch (e) {}
    return Promise.all(p).catch(function () {});
  }
  fetch('/api/me', { credentials: 'same-origin', headers: { 'X-MCO': '1' } }).then(function (r) {
    if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return null;
    return r.json();
  }).then(function (u) {
    if (!u || !u.email) { try { localStorage.removeItem('mco-autor'); } catch (e) {} return; }
    try { localStorage.setItem('mco-autor', String(u.nome || u.email.split('@')[0]).slice(0, 60)); } catch (e) {}
    var box = document.createElement('span'); box.className = 'portal-conta'; box.setAttribute('data-fid', 'portal-conta');
    var nome = document.createElement('span'); nome.className = 'portal-nome'; nome.textContent = u.nome || u.email;
    var a = document.createElement('a'); a.href = '/conta'; a.className = 'btn-rodape'; a.textContent = 'Conta'; a.setAttribute('data-fid', 'portal-conta-link');
    var s = document.createElement('button'); s.type = 'button'; s.className = 'btn-rodape btn-sair'; s.textContent = 'Sair'; s.setAttribute('data-fid', 'portal-sair');
    s.addEventListener('click', function () {
      s.disabled = true;
      fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-MCO': '1', 'Content-Type': 'application/json' }, body: '{}' })
        .catch(function () {}).then(limparTudo).then(function () { location.replace('/login'); });
    });
    box.appendChild(nome); box.appendChild(a); box.appendChild(s);
    rodape.insertBefore(box, rodape.lastElementChild);
  }).catch(function () {});
})();
