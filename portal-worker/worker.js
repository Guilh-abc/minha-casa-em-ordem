/* minha-casa-em-ordem — portal com login na frente do app estático (Cloudflare Workers + D1; os arquivos do app vêm de env.ASSETS: Static Assets no wrangler dev, arquivos embutidos em produção; ver tools/gerar-deploy-cloudflare.py).
   Duas contas administradoras, sem cadastro público. Senhas: PBKDF2-SHA256 (100.000, o máximo do Workers) + HMAC com segredo do servidor.
   Sessão: cookie aleatório (só o hash fica no D1). Nada da rotina/contas/faturas passa por aqui: isso fica no aparelho (e cifrado no sync). */
'use strict';
var ITER = 100000, SESSAO_S = 30 * 86400, LINK_S = 24 * 3600, MIN_SENHA = 12, COOKIE = '__Host-mco';
var JANELA_S = 900, MAX_FALHAS_CONTA = 5, BLOQ_S = 900, MAX_IP = 20;
var SYNC_ORIGEM = 'https://painel-sala-sync.guilhermeromionetto.workers.dev';
var enc = new TextEncoder();
var cacheSessao = new Map();   /* hash -> {u, ate, ver}; revogação vale em até 60 s em outras instâncias */

function agora() { return Math.floor(Date.now() / 1000); }
function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
function ub64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function b64u(u8) { return b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
function aleatorio(n) { var u = new Uint8Array(n); crypto.getRandomValues(u); return u; }
async function sha256(txt) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(txt))); }
function iguais(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

async function derivar(senha, salt, iter, pepper) {
  var k = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, k, 256);
  var hk = await crypto.subtle.importKey('raw', enc.encode(pepper || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', hk, bits));
}
async function criarHash(senha, env) { var salt = aleatorio(16); return 'v1$' + ITER + '$' + b64(salt) + '$' + await derivar(senha, salt, ITER, env.PEPPER); }
async function conferirSenha(senha, guardado, env) {
  var p = String(guardado || '').split('$');
  if (p.length !== 4 || p[0] !== 'v1') { await derivar(senha, new Uint8Array(16), ITER, env.PEPPER); return false; }   /* custo igual p/ conta inexistente */
  return iguais(await derivar(senha, ub64(p[2]), parseInt(p[1], 10) || ITER, env.PEPPER), p[3]);
}
function senhaFraca(s, email) {
  s = String(s || '');
  if (s.length < MIN_SENHA) return 'Use pelo menos ' + MIN_SENHA + ' caracteres.';
  if (s.length > 200) return 'Senha longa demais.';
  if (/^(.)\1+$/.test(s)) return 'Escolha uma senha menos repetitiva.';
  var l = String(email || '').split('@')[0].toLowerCase(); if (l.length >= 3 && s.toLowerCase().indexOf(l) >= 0) return 'A senha não pode conter seu e-mail.';
  if (/^(123456789|12345678901|senha1234567|password1234)/i.test(s)) return 'Essa senha é comum demais.';
  return '';
}

/* ---------- respostas e cabeçalhos ---------- */
var CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; " +
  "connect-src 'self' " + SYNC_ORIGEM + " https://minha-casa-assistente.guilhermeromionetto.workers.dev https://api.open-meteo.com https://geocoding-api.open-meteo.com; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
function seguranca(h, tipo) {
  h.set('Content-Security-Policy', CSP); h.set('X-Content-Type-Options', 'nosniff'); h.set('Referrer-Policy', 'no-referrer'); h.set('X-Frame-Options', 'DENY');
  h.set('Cross-Origin-Opener-Policy', 'same-origin'); h.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()'); h.set('Strict-Transport-Security', 'max-age=31536000');
  if (tipo !== 'ativo') h.set('Cache-Control', 'no-store'); else h.set('Cache-Control', 'private, no-cache');
  return h;
}
function json(obj, status, extra) { var h = new Headers({ 'Content-Type': 'application/json; charset=utf-8' }); if (extra) Object.keys(extra).forEach(function (k) { h.append(k, extra[k]); }); return new Response(JSON.stringify(obj), { status: status || 200, headers: seguranca(h) }); }
function html(corpo, status) { return new Response(corpo, { status: status || 200, headers: seguranca(new Headers({ 'Content-Type': 'text/html; charset=utf-8' })) }); }
function js(corpo) { return new Response(corpo, { headers: seguranca(new Headers({ 'Content-Type': 'text/javascript; charset=utf-8' })) }); }
function redirecionar(url, status) { return new Response(null, { status: status || 302, headers: seguranca(new Headers({ Location: url })) }); }
function cookieSessao(token, seg) { return COOKIE + '=' + token + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + seg; }
function lerCookie(req) { var c = req.headers.get('Cookie') || '', m = c.split(/;\s*/); for (var i = 0; i < m.length; i++) { var p = m[i].split('='); if (p[0] === COOKIE) return p.slice(1).join('='); } return ''; }

/* ---------- sessão ---------- */
async function sessaoDe(req, env) {
  var tk = lerCookie(req); if (!/^[A-Za-z0-9_-]{40,60}$/.test(tk)) return null;
  var h = await sha256(tk), c = cacheSessao.get(h), t = agora();
  if (c && c.ate > t && c.ver > Date.now() - 60000) return c.u;
  var r = await env.DB.prepare('SELECT s.expira_em, s.visto_em, u.id, u.nome, u.email, u.papel, u.ativo FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id_hash = ?').bind(h).first();
  if (!r || r.expira_em < t || !r.ativo) { cacheSessao.delete(h); return null; }
  if (t - r.visto_em > 3600) await env.DB.prepare('UPDATE sessoes SET visto_em = ? WHERE id_hash = ?').bind(t, h).run();
  var u = { id: r.id, nome: r.nome, email: r.email, papel: r.papel, hash: h };
  if (cacheSessao.size > 200) cacheSessao.clear();
  cacheSessao.set(h, { u: u, ate: r.expira_em, ver: Date.now() }); return u;
}
async function abrirSessao(env, usuarioId, req) {
  var tk = b64u(aleatorio(32)), h = await sha256(tk), t = agora();
  await env.DB.prepare('DELETE FROM sessoes WHERE expira_em < ?').bind(t).run();
  await env.DB.prepare('INSERT INTO sessoes (id_hash, usuario_id, criada_em, expira_em, visto_em, agente) VALUES (?,?,?,?,?,?)').bind(h, usuarioId, t, t + SESSAO_S, t, (req.headers.get('User-Agent') || '').slice(0, 120)).run();
  return tk;
}
async function encerrarSessoes(env, usuarioId) { cacheSessao.clear(); await env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(usuarioId).run(); }

/* ---------- limites de tentativa ---------- */
async function limiteIp(req, env, rota) {
  var ip = req.headers.get('CF-Connecting-IP') || 'x', k = (await sha256('ip|' + ip + '|' + rota)).slice(0, 24), t = agora();
  var r = await env.DB.prepare('SELECT n, ini FROM tentativas WHERE chave = ?').bind(k).first();
  if (!r || t - r.ini > JANELA_S) { await env.DB.prepare('INSERT OR REPLACE INTO tentativas (chave, n, ini) VALUES (?,1,?)').bind(k, t).run(); return false; }
  await env.DB.prepare('UPDATE tentativas SET n = n + 1 WHERE chave = ?').bind(k).run();
  return r.n + 1 > MAX_IP;
}
function mesmaOrigem(req) { var o = req.headers.get('Origin'); return !!o && o === new URL(req.url).origin; }
async function corpoJson(req) {
  if (!/^application\/json/i.test(req.headers.get('Content-Type') || '') || req.headers.get('X-MCO') !== '1') return null;
  var t = await req.text(); if (t.length > 4000) return null; try { var o = JSON.parse(t); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
}
var MSG_GENERICA = 'E-mail ou senha incorretos.';

/* ---------- rotas da API ---------- */
async function apiLogin(req, env) {
  if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
  var b = await corpoJson(req); if (!b) return json({ erro: 'Pedido inválido.' }, 400);
  if (await limiteIp(req, env, 'login')) return json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);
  var email = String(b.email || '').trim().toLowerCase().slice(0, 120), senha = String(b.senha || '').slice(0, 200), t = agora();
  var u = await env.DB.prepare('SELECT id, senha, falhas, bloqueado_ate, ativo FROM usuarios WHERE email = ?').bind(email).first();
  if (u && u.bloqueado_ate > t) { await derivar(senha, new Uint8Array(16), ITER, env.PEPPER); return json({ erro: 'Conta bloqueada por tentativas erradas. Tente de novo em ' + Math.ceil((u.bloqueado_ate - t) / 60) + ' min.' }, 429); }
  var ok = await conferirSenha(senha, u && u.ativo ? u.senha : null, env);
  if (!u || !ok) {
    if (u) { var f = (u.falhas || 0) + 1; await env.DB.prepare('UPDATE usuarios SET falhas = ?, bloqueado_ate = ? WHERE id = ?').bind(f >= MAX_FALHAS_CONTA ? 0 : f, f >= MAX_FALHAS_CONTA ? t + BLOQ_S : 0, u.id).run(); }
    return json({ erro: MSG_GENERICA }, 401);
  }
  if (u.falhas) await env.DB.prepare('UPDATE usuarios SET falhas = 0, bloqueado_ate = 0 WHERE id = ?').bind(u.id).run();
  var tk = await abrirSessao(env, u.id, req);
  return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao(tk, SESSAO_S) });
}
async function apiDefinirSenha(req, env) {
  if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
  var b = await corpoJson(req); if (!b) return json({ erro: 'Pedido inválido.' }, 400);
  if (await limiteIp(req, env, 'definir')) return json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);
  var tok = String(b.token || ''), t = agora();
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return json({ erro: 'Link inválido ou expirado.' }, 400);
  var u = await env.DB.prepare('SELECT id, email, link_exp, ativo FROM usuarios WHERE link_hash = ?').bind(await sha256(tok)).first();
  if (!u || !u.ativo || !u.link_exp || u.link_exp < t) return json({ erro: 'Link inválido ou expirado. Peça um novo ao outro administrador.' }, 400);
  var fraca = senhaFraca(b.senha, u.email); if (fraca) return json({ erro: fraca }, 400);
  var h = await criarHash(String(b.senha), env);
  var r = await env.DB.prepare('UPDATE usuarios SET senha = ?, senha_em = ?, link_hash = NULL, link_exp = NULL, falhas = 0, bloqueado_ate = 0 WHERE id = ? AND link_hash = ?').bind(h, t, u.id, await sha256(tok)).run();
  if (!r.meta || r.meta.changes !== 1) return json({ erro: 'Link já usado.' }, 400);
  await encerrarSessoes(env, u.id);
  var tk = await abrirSessao(env, u.id, req);
  return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao(tk, SESSAO_S) });
}
async function apiLogout(req, env, s) {
  if (!mesmaOrigem(req) || req.headers.get('X-MCO') !== '1') return json({ erro: 'Origem não permitida.' }, 403);
  if (s) { await env.DB.prepare('DELETE FROM sessoes WHERE id_hash = ?').bind(s.hash).run(); cacheSessao.delete(s.hash); }
  return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao('', 0) + '; Expires=Thu, 01 Jan 1970 00:00:00 GMT' });
}
async function listarUsuarios(env) {
  var r = await env.DB.prepare('SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.senha IS NOT NULL AS definida, u.link_exp, u.link_hash IS NOT NULL AS link, (SELECT COUNT(*) FROM sessoes s WHERE s.usuario_id = u.id AND s.expira_em > ?) AS sessoes FROM usuarios u ORDER BY u.id').bind(agora()).all();
  return (r.results || []).map(function (x) { return { id: x.id, nome: x.nome, email: x.email, papel: x.papel, definida: !!x.definida, linkPendente: !!x.link && x.link_exp > agora(), linkExp: x.link_exp, sessoes: x.sessoes }; });
}
async function apiConta(req, env, s, caminho) {
  if (!s) return json({ erro: 'Entre primeiro.' }, 401);
  if (req.method === 'GET' && caminho === '/api/me') return json({ id: s.id, nome: s.nome, email: s.email, papel: s.papel });
  if (req.method === 'GET' && caminho === '/api/conta/usuarios') { if (s.papel !== 'admin') return json({ erro: 'Só administradores.' }, 403); return json({ usuarios: await listarUsuarios(env) }); }
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
  var b = await corpoJson(req); if (!b) return json({ erro: 'Pedido inválido.' }, 400);
  if (caminho === '/api/conta/trocar-senha') {
    if (await limiteIp(req, env, 'trocar')) return json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);
    var u = await env.DB.prepare('SELECT senha, email FROM usuarios WHERE id = ?').bind(s.id).first();
    if (!await conferirSenha(String(b.atual || ''), u && u.senha, env)) return json({ erro: 'Senha atual incorreta.' }, 400);
    var fr = senhaFraca(b.nova, u.email); if (fr) return json({ erro: fr }, 400);
    await env.DB.prepare('UPDATE usuarios SET senha = ?, senha_em = ? WHERE id = ?').bind(await criarHash(String(b.nova), env), agora(), s.id).run();
    await env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND id_hash <> ?').bind(s.id, s.hash).run(); cacheSessao.clear();
    return json({ ok: true });
  }
  if (s.papel !== 'admin') return json({ erro: 'Só administradores.' }, 403);
  var alvo = parseInt(b.id, 10); if (!(alvo > 0)) return json({ erro: 'Usuário inválido.' }, 400);
  var ex = await env.DB.prepare('SELECT id, email FROM usuarios WHERE id = ?').bind(alvo).first(); if (!ex) return json({ erro: 'Usuário não encontrado.' }, 404);
  if (caminho === '/api/conta/gerar-link') {
    var tok = b64u(aleatorio(32)), exp = agora() + LINK_S;
    await env.DB.prepare('UPDATE usuarios SET link_hash = ?, link_exp = ?, senha = NULL, senha_em = NULL, falhas = 0, bloqueado_ate = 0 WHERE id = ?').bind(await sha256(tok), exp, alvo).run();
    await encerrarSessoes(env, alvo);
    return json({ ok: true, link: new URL(req.url).origin + '/primeiro-acesso?t=' + tok, expira_em: exp, aviso: 'Esse link mostra uma vez só. A senha antiga deixa de valer e as sessões dessa conta foram encerradas.' });
  }
  if (caminho === '/api/conta/encerrar-sessoes') { await encerrarSessoes(env, alvo); return json({ ok: true, proprioEncerrado: alvo === s.id }); }
  return json({ erro: 'Rota desconhecida.' }, 404);
}

/* ---------- páginas ---------- */
var CSS = ':root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0A0A0A;color:#fff;font-family:Inter,"Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;padding:1.2rem}' +
  'main{width:100%;max-width:25rem;background:#1A1A1A;border-radius:14px;padding:1.6rem 1.4rem;border-top:4px solid #E20074}img.logo{width:100%;max-width:17rem;height:auto;display:block;margin:0 auto 1.1rem}h1{font-size:1.25rem;margin:.2rem 0 .3rem;font-weight:800}p{color:#B8B8B8;font-size:.9rem;line-height:1.45;margin:.3rem 0 .9rem}' +
  'label{display:block;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#B8B8B8;margin:.7rem 0 .25rem}input{width:100%;min-height:2.9rem;border-radius:9px;border:2px solid #3A3A3A;background:#262626;color:#fff;font-size:1rem;padding:.4rem .75rem}input:focus{outline:none;border-color:#E20074;box-shadow:0 0 0 3px rgba(226,0,116,.35)}' +
  'button.bt{width:100%;min-height:3rem;margin-top:1.1rem;border:0;border-radius:9px;background:#E20074;color:#fff;font-size:1rem;font-weight:800;cursor:pointer}button.bt:disabled{opacity:.55}button.sec{background:transparent;border:2px solid #3A3A3A;margin-top:.5rem}' +
  '.erro{color:#FF6B5E;font-size:.85rem;min-height:1.2rem;margin:.6rem 0 0}.ok{color:#2EBB64}footer{margin-top:1.1rem;color:#8a8a8a;font-size:.75rem}footer b{color:#fff}table{width:100%;border-collapse:collapse;font-size:.82rem;margin:.6rem 0}th,td{text-align:left;padding:.45rem .3rem;border-bottom:1px solid #3A3A3A;vertical-align:top}th{font-size:.64rem;text-transform:uppercase;color:#B8B8B8}' +
  'code.lk{display:block;word-break:break-all;background:#000;border:1px solid #3A3A3A;border-radius:8px;padding:.6rem;margin:.5rem 0;font-size:.78rem;color:#FF4FA3}a{color:#FF4FA3}.sm{font-size:.78rem}main.larga{max-width:42rem}';
function pagina(titulo, corpo, script, larga) {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + titulo + ' · Minha Casa em Ordem</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0A0A0A"><meta name="robots" content="noindex,nofollow">' +
    '<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" type="image/svg+xml" href="/assets/favicon.svg"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><style>' + CSS + '</style></head><body><main' + (larga ? ' class="larga"' : '') + '>' +
    '<img class="logo" src="/assets/logo.svg" alt="Minha Casa em Ordem">' + corpo + '</main><footer>Minha Casa em Ordem · <b>byGui</b></footer><script src="' + script + '"></script></body></html>';
}
var PG_LOGIN = pagina('Entrar', '<h1>Entrar</h1><p>Acesso só para a família. Use o e-mail e a senha que você criou no primeiro acesso.</p><form id="f" autocomplete="on" novalidate><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" inputmode="email" required><label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required><div class="erro" id="erro" role="alert"></div><button class="bt" id="bt" type="submit">Entrar</button></form><p class="sm" style="margin-top:1rem">Primeira vez? Abra o link de primeiro acesso que o outro administrador enviou.</p>', '/portal/login.js');
var PG_PRIMEIRO = pagina('Primeiro acesso', '<h1>Criar sua senha</h1><p>Escolha uma senha com pelo menos ' + MIN_SENHA + ' caracteres. Este link vale uma vez só.</p><form id="f" novalidate><label for="s1">Nova senha</label><input id="s1" type="password" autocomplete="new-password" required><label for="s2">Repita a senha</label><input id="s2" type="password" autocomplete="new-password" required><div class="erro" id="erro" role="alert"></div><button class="bt" id="bt" type="submit">Criar senha e entrar</button></form>', '/portal/primeiro.js');
var PG_CONTA = pagina('Conta', '<h1>Conta e acessos</h1><p id="quem">Carregando…</p><h1 style="font-size:1rem;margin-top:1.2rem">Acessos da família</h1><table><thead><tr><th>Pessoa</th><th>Situação</th><th></th></tr></thead><tbody id="lista"></tbody></table><div id="link"></div><h1 style="font-size:1rem;margin-top:1.2rem">Trocar minha senha</h1><form id="f" novalidate><label for="atual">Senha atual</label><input id="atual" type="password" autocomplete="current-password"><label for="nova">Nova senha</label><input id="nova" type="password" autocomplete="new-password"><div class="erro" id="erro" role="alert"></div><button class="bt" type="submit">Trocar senha</button></form><button class="bt sec" id="sair" type="button">Sair deste aparelho</button><p class="sm"><a href="/">← Voltar ao app</a></p>', '/portal/conta.js', true);

var JS_LOGIN = "(function(){var f=document.getElementById('f'),e=document.getElementById('erro'),b=document.getElementById('bt');f.addEventListener('submit',function(ev){ev.preventDefault();e.textContent='';b.disabled=true;b.textContent='Entrando…';" +
  "fetch('/api/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-MCO':'1'},body:JSON.stringify({email:f.email.value,senha:f.senha.value})}).then(function(r){return r.json().then(function(j){return{r:r,j:j}})}).then(function(x){if(x.r.ok){location.replace('/')}else{e.textContent=x.j.erro||'Não foi possível entrar.';b.disabled=false;b.textContent='Entrar'}}).catch(function(){e.textContent='Sem conexão. Tente de novo.';b.disabled=false;b.textContent='Entrar'});});})();";
var JS_PRIMEIRO = "(function(){var p=new URLSearchParams(location.search),tk=p.get('t')||'';history.replaceState(null,'','/primeiro-acesso');var f=document.getElementById('f'),e=document.getElementById('erro'),b=document.getElementById('bt');" +
  "if(!tk){e.textContent='Link incompleto. Abra o link de primeiro acesso inteiro.';b.disabled=true}f.addEventListener('submit',function(ev){ev.preventDefault();e.textContent='';var s1=document.getElementById('s1').value,s2=document.getElementById('s2').value;if(s1!==s2){e.textContent='As senhas não são iguais.';return}b.disabled=true;" +
  "fetch('/api/definir-senha',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-MCO':'1'},body:JSON.stringify({token:tk,senha:s1})}).then(function(r){return r.json().then(function(j){return{r:r,j:j}})}).then(function(x){if(x.r.ok){location.replace('/')}else{e.textContent=x.j.erro||'Não foi possível criar a senha.';b.disabled=false}}).catch(function(){e.textContent='Sem conexão. Tente de novo.';b.disabled=false});});})();";
var JS_CONTA = "(function(){function api(c,m,b){return fetch(c,{method:m||'GET',credentials:'same-origin',headers:{'Content-Type':'application/json','X-MCO':'1'},body:b?JSON.stringify(b):undefined}).then(function(r){return r.json().then(function(j){return{r:r,j:j}})})}" +
  "function t(s){return document.createTextNode(s)}function el(n,tx,c){var e=document.createElement(n);if(tx)e.textContent=tx;if(c)e.className=c;return e}var eu=null;" +
  "function limpar(){if(window.caches)caches.keys().then(function(k){k.forEach(function(x){caches.delete(x)})});if(navigator.serviceWorker&&navigator.serviceWorker.controller)navigator.serviceWorker.controller.postMessage({tipo:'limpar-cache'})}" +
  "function carregar(){api('/api/me').then(function(x){if(!x.r.ok){location.replace('/login');return}eu=x.j;document.getElementById('quem').textContent='Você está como '+eu.nome+' ('+eu.email+') · '+eu.papel+'.';return api('/api/conta/usuarios')}).then(function(x){if(!x||!x.r.ok)return;var tb=document.getElementById('lista');tb.textContent='';x.j.usuarios.forEach(function(u){var tr=el('tr');var c1=el('td');c1.appendChild(el('strong',u.nome));c1.appendChild(el('div',u.email,'sm'));tr.appendChild(c1);" +
  "var c2=el('td',(u.definida?'Senha criada':'Aguardando primeiro acesso')+' · '+u.sessoes+' sessão(ões)'+(u.linkPendente?' · link pendente':''));tr.appendChild(c2);var c3=el('td');var b1=el('button','Novo link de acesso','bt sec');b1.style.margin='0 0 .3rem';b1.style.minHeight='2.2rem';b1.onclick=function(){if(!confirm('Gerar novo link para '+u.nome+'? A senha atual dela deixa de valer e as sessões são encerradas.'))return;api('/api/conta/gerar-link','POST',{id:u.id}).then(function(y){var d=document.getElementById('link');d.textContent='';if(!y.r.ok){d.appendChild(el('p',y.j.erro,'erro'));return}d.appendChild(el('p','Link de primeiro acesso para '+u.nome+' (vale 24 h, uso único). Copie e envie agora; ele não será mostrado de novo:'));var c=el('code',y.j.link,'lk');d.appendChild(c);var cp=el('button','Copiar link','bt sec');cp.onclick=function(){navigator.clipboard.writeText(y.j.link).then(function(){cp.textContent='Copiado'})};d.appendChild(cp);carregar()})};c3.appendChild(b1);" +
  "var b2=el('button','Encerrar sessões','bt sec');b2.style.margin='0';b2.style.minHeight='2.2rem';b2.onclick=function(){api('/api/conta/encerrar-sessoes','POST',{id:u.id}).then(function(y){if(y.j.proprioEncerrado){limpar();location.replace('/login')}else carregar()})};c3.appendChild(b2);tr.appendChild(c3);tb.appendChild(tr)})})}" +
  "document.getElementById('f').addEventListener('submit',function(ev){ev.preventDefault();var e=document.getElementById('erro');e.className='erro';e.textContent='';api('/api/conta/trocar-senha','POST',{atual:document.getElementById('atual').value,nova:document.getElementById('nova').value}).then(function(x){if(x.r.ok){e.className='erro ok';e.textContent='Senha trocada. Outras sessões foram encerradas.';document.getElementById('f').reset()}else e.textContent=x.j.erro||'Não foi possível trocar.'})});" +
  "document.getElementById('sair').onclick=function(){api('/api/logout','POST',{}).then(function(){limpar();location.replace('/login')})};carregar();})();";

/* ---------- gate + estáticos ---------- */
var PUBLICOS = /^\/(login|primeiro-acesso|manifest\.webmanifest|favicon\.ico|assets\/(favicon|logo|mark)\.svg|icons\/[A-Za-z0-9._-]+\.png|api\/saude|portal\/(login|primeiro)\.js)$/;
async function estatico(req, env) {
  var r = await env.ASSETS.fetch(req), h = seguranca(new Headers(r.headers), 'ativo');
  var p = new URL(req.url).pathname;
  if (p === '/manifest.webmanifest') h.set('Content-Type', 'application/manifest+json; charset=utf-8');
  if (/\.mjs$/.test(p)) h.set('Content-Type', 'text/javascript; charset=utf-8');
  if (p === '/sw.js') { h.set('Service-Worker-Allowed', '/'); h.set('Cache-Control', 'no-cache'); }
  h.delete('ETag'); return new Response(r.body, { status: r.status, headers: h });
}
export default {
  async fetch(req, env) {
    try {
      var url = new URL(req.url), p = url.pathname;
      if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return redirecionar('https://' + url.host + p + url.search, 301);
      if (p === '/api/saude') return json({ ok: true, servico: 'minha-casa-em-ordem', versao: 1 });
      var s = await sessaoDe(req, env);
      if (p === '/login') return s ? redirecionar('/') : html(PG_LOGIN);
      if (p === '/primeiro-acesso') return html(PG_PRIMEIRO);
      if (p === '/portal/login.js') return js(JS_LOGIN);
      if (p === '/portal/primeiro.js') return js(JS_PRIMEIRO);
      if (p === '/api/login' && req.method === 'POST') return await apiLogin(req, env);
      if (p === '/api/definir-senha' && req.method === 'POST') return await apiDefinirSenha(req, env);
      if (p === '/api/logout' && req.method === 'POST') return await apiLogout(req, env, s);
      if (PUBLICOS.test(p) && (req.method === 'GET' || req.method === 'HEAD')) return await estatico(req, env);
      if (!s) {
        var nav = req.headers.get('Sec-Fetch-Mode') === 'navigate' || /text\/html/.test(req.headers.get('Accept') || '');
        if (nav && req.method === 'GET' && !p.startsWith('/api/')) return redirecionar('/login');
        return json({ erro: 'Entre para continuar.' }, 401);
      }
      if (p === '/conta') return html(PG_CONTA);
      if (p === '/portal/conta.js') return js(JS_CONTA);
      if (p.startsWith('/api/')) return await apiConta(req, env, s, p);
      if (req.method !== 'GET' && req.method !== 'HEAD') return json({ erro: 'Método não permitido.' }, 405);
      return await estatico(req, env);
    } catch (e) {
      return json({ erro: 'Erro interno.' }, 500);
    }
  }
};
