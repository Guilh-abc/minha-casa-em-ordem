/* painel-sala-sync — Worker de sincronização do Minha Casa em Ordem (módulo ES, arquivo único, sem dependências).
 *
 * Privacidade: o servidor guarda SÓ texto cifrado no navegador (AES-GCM). Ele enxerga apenas: id opaco (HMAC),
 * nome da coleção, carimbo de tempo (t), flag de apagado, seq e tamanhos. Nunca recebe a "senha da família".
 * O PIN serve apenas para ACESSO (entrar na família) e é guardado como PBKDF2-SHA256 + sal + pimenta (secret).
 *
 * Bindings: DB (D1), PEPPER (secret_text), ORIGEM_PERMITIDA (plain_text, opcional).
 * Nenhum PIN, token, senha ou id de aparelho é escrito em log. */

var ORIGEM_PADRAO = 'https://guilhermeromio-netto-prog.github.io';
/* Origens do app: GitHub Pages (cópia pública, sem login) e o portal na Cloudflare (com login). ORIGEM_PERMITIDA, se existir, pode ter várias separadas por vírgula. */
var ORIGENS_PADRAO = [ORIGEM_PADRAO, 'https://minha-casa-em-ordem.guilhermeromionetto.workers.dev'];
var MAX_CORPO = 512 * 1024;          /* 512 KB */
var MAX_MUDANCAS = 300;              /* itens por PUT */
var MAX_ITENS_FAMILIA = 6000;
var MAX_DADOS = 131072;              /* bytes (base64url) por item cifrado (uma nota com 250 itens cabe com folga) */
var ITER_PIN = 100000;               /* máximo aceito pelo WebCrypto do Workers */
var SESSAO_DIAS = 365;
var TOMBA_DIAS = 120;
var MAX_FAMILIAS = 100;

var RE_COLECAO = /^[a-z]{2,16}$/;
var RE_ID = /^[A-Za-z0-9_-]{8,64}$/;
var RE_B64 = /^[A-Za-z0-9_-]+$/;
var RE_CODIGO = /^\d{8}$/;

/* ---------- regra de mescla (a mesma é aplicada em SQL no PUT) ---------- */
/* Retorna true se o item "novo" deve substituir o "atual": maior t vence; empate: apagado vence; depois maior texto. */
function vence(novo, atual) {
  if (!atual) return true;
  if (novo.t !== atual.t) return novo.t > atual.t;
  if ((novo.a ? 1 : 0) !== (atual.a ? 1 : 0)) return (novo.a ? 1 : 0) > (atual.a ? 1 : 0);
  return String(novo.d || '') > String(atual.d || '');
}

function pinFraco(pin) {
  if (!/^\d{4,8}$/.test(pin)) return 'O PIN precisa ter de 4 a 8 números.';
  if (/^(\d)\1+$/.test(pin)) return 'PIN fraco: não use todos os números iguais.';
  var asc = true, desc = true;
  for (var i = 1; i < pin.length; i++) {
    if (+pin[i] !== +pin[i - 1] + 1) asc = false;
    if (+pin[i] !== +pin[i - 1] - 1) desc = false;
  }
  if (asc || desc) return 'PIN fraco: não use sequências (1234, 4321).';
  return '';
}

function validarMudanca(m, agora) {
  if (!m || typeof m !== 'object') return null;
  if (typeof m.c !== 'string' || !RE_COLECAO.test(m.c)) return null;
  if (typeof m.i !== 'string' || !RE_ID.test(m.i)) return null;
  var t = Math.floor(Number(m.t));
  if (!isFinite(t) || t < 0) return null;
  t = Math.min(t, agora + 5 * 60 * 1000);           /* relógio adiantado não "ganha" para sempre */
  var a = m.a ? 1 : 0, d = null;
  if (!a) {
    if (typeof m.d !== 'string' || !m.d || m.d.length > MAX_DADOS || !RE_B64.test(m.d)) return null;
    d = m.d;
  }
  return { c: m.c, i: m.i, t: t, a: a, d: d, n: m.n ? 1 : 0 };
}

/* ---------- utilidades ---------- */
function bytesParaB64(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64ParaBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function hex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16); return s; }
function aleatorio(n) { var u = new Uint8Array(n); crypto.getRandomValues(u); return u; }
function iguaisConstante(a, b) {
  if (a.length !== b.length) return false;
  var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
var enc = new TextEncoder();
async function sha256Hex(texto) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(texto)))); }
async function hmac(chaveBytes, texto) {
  var k = await crypto.subtle.importKey('raw', chaveBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(texto)));
}
async function hashPin(pin, saltB64, iter, pepper) {
  var pre = await hmac(enc.encode(pepper), 'pin:' + pin);                    /* pimenta: sem o secret do Worker, um vazamento do D1 não permite testar PINs */
  var k = await crypto.subtle.importKey('raw', pre, 'PBKDF2', false, ['deriveBits']);
  var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64ParaBytes(saltB64), iterations: iter }, k, 256);
  return hex(new Uint8Array(bits));
}

/* ---------- HTTP ---------- */
function cabecalhos(origem, extra) {
  var h = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'strict-transport-security': 'max-age=31536000',
    'cross-origin-resource-policy': 'cross-origin',
    'vary': 'Origin'
  };
  if (origem) {
    h['access-control-allow-origin'] = origem;
    h['access-control-allow-headers'] = 'authorization, content-type';
    h['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    h['access-control-max-age'] = '86400';
  }
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}
function Erro(status, codigo, mensagem, extra) { var e = new Error(codigo); e.status = status; e.codigo = codigo; e.mensagem = mensagem; e.extra = extra; return e; }

async function lerJson(request) {
  var tipo = (request.headers.get('content-type') || '').toLowerCase();
  if (tipo.indexOf('application/json') !== 0) throw Erro(415, 'tipo_invalido', 'Envie JSON.');
  var cl = request.headers.get('content-length');
  if (cl && +cl > MAX_CORPO) throw Erro(413, 'grande_demais', 'Pedido grande demais (máx. 512 KB).');
  var leitor = request.body ? request.body.getReader() : null, partes = [], total = 0;
  if (!leitor) throw Erro(400, 'corpo_vazio', 'Corpo vazio.');
  for (;;) {
    var r = await leitor.read();
    if (r.done) break;
    total += r.value.length;
    if (total > MAX_CORPO) { try { leitor.cancel(); } catch (e) { /* ok */ } throw Erro(413, 'grande_demais', 'Pedido grande demais (máx. 512 KB).'); }
    partes.push(r.value);
  }
  var u = new Uint8Array(total), pos = 0;
  partes.forEach(function (p) { u.set(p, pos); pos += p.length; });
  try { var o = JSON.parse(new TextDecoder().decode(u)); } catch (e) { throw Erro(400, 'json_invalido', 'JSON inválido.'); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw Erro(400, 'json_invalido', 'JSON inválido.');
  return o;
}

/* ---------- limite de tentativas (D1) ---------- */
var REGRAS = {
  pin: { max: 5, janela: 10 * 60e3, bloqueio: 15 * 60e3 },        /* por família + IP */
  pinfam: { max: 30, janela: 60 * 60e3, bloqueio: 30 * 60e3 },    /* por família (todos os IPs) */
  ip: { max: 20, janela: 10 * 60e3, bloqueio: 15 * 60e3 },        /* por IP (inclui código inexistente) */
  novo: { max: 5, janela: 60 * 60e3, bloqueio: 60 * 60e3 }        /* criação de famílias por IP */
};
async function bloqueadoAte(env, chave, agora) {
  var r = await env.DB.prepare('SELECT bloqueado_ate FROM tentativas WHERE chave = ?1').bind(chave).first();
  return r && r.bloqueado_ate > agora ? r.bloqueado_ate : 0;
}
async function registrarFalha(env, tipo, chave, agora) {
  var reg = REGRAS[tipo], k = tipo + '|' + chave;
  var r = await env.DB.prepare('SELECT falhas, janela_ini FROM tentativas WHERE chave = ?1').bind(k).first();
  var falhas = 1, ini = agora;
  if (r && agora - r.janela_ini < reg.janela) { falhas = r.falhas + 1; ini = r.janela_ini; }
  var bloq = falhas >= reg.max ? agora + reg.bloqueio : 0;
  if (bloq) { falhas = 0; ini = agora; }
  await env.DB.prepare('INSERT INTO tentativas (chave, falhas, janela_ini, bloqueado_ate) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(chave) DO UPDATE SET falhas = ?2, janela_ini = ?3, bloqueado_ate = ?4').bind(k, falhas, ini, bloq).run();
}
async function checarBloqueios(env, tipos, agora) {
  for (var i = 0; i < tipos.length; i++) {
    var ate = await bloqueadoAte(env, tipos[i][0] + '|' + tipos[i][1], agora);
    if (ate) throw Erro(429, 'bloqueado', 'Muitas tentativas. Tente de novo em ' + Math.max(1, Math.ceil((ate - agora) / 60000)) + ' min.', { espere_s: Math.ceil((ate - agora) / 1000) });
  }
}
async function limparFalhas(env, chave) { await env.DB.prepare('DELETE FROM tentativas WHERE chave = ?1').bind(chave).run(); }
async function ipId(request, env) { return (await sha256Hex((env.PEPPER || '') + '|ip|' + (request.headers.get('cf-connecting-ip') || 'x'))).slice(0, 24); }

/* ---------- famílias e sessões ---------- */
function validarBlob(v, max) { return typeof v === 'string' && v.length >= 8 && v.length <= max && RE_B64.test(v); }
function rotuloSeguro(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 30) || 'Aparelho'; }

async function novaSessao(env, familiaId, rotulo, agora) {
  var token = bytesParaB64(aleatorio(32));
  var th = await sha256Hex(token);
  await env.DB.prepare('INSERT INTO sessoes (token_hash, familia_id, rotulo, criada_em, ultimo_uso) VALUES (?1, ?2, ?3, ?4, ?4)').bind(th, familiaId, rotuloSeguro(rotulo), agora).run();
  return token;
}
async function autenticar(request, env, agora) {
  var a = request.headers.get('authorization') || '';
  var m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(a);
  if (!m) throw Erro(401, 'sem_sessao', 'Entre na família neste aparelho.');
  var th = await sha256Hex(m[1]);
  var s = await env.DB.prepare('SELECT token_hash, familia_id, ultimo_uso FROM sessoes WHERE token_hash = ?1').bind(th).first();
  if (!s || agora - s.ultimo_uso > SESSAO_DIAS * 86400e3) throw Erro(401, 'sem_sessao', 'Sessão encerrada. Entre de novo.');
  if (agora - s.ultimo_uso > 12 * 3600e3) await env.DB.prepare('UPDATE sessoes SET ultimo_uso = ?2 WHERE token_hash = ?1').bind(th, agora).run();
  return { familia: s.familia_id, th: th };
}
async function codigoNovo(env) {
  for (var n = 0; n < 8; n++) {
    var u = aleatorio(4), v = ((u[0] << 24 | u[1] << 16 | u[2] << 8 | u[3]) >>> 0) % 90000000 + 10000000;   /* 8 dígitos, sem zero à esquerda */
    var c = String(v);
    var e = await env.DB.prepare('SELECT 1 AS x FROM familias WHERE codigo = ?1').bind(c).first();
    if (!e) return c;
  }
  throw Erro(500, 'codigo', 'Não foi possível gerar o código. Tente de novo.');
}
async function verificarPin(request, env, familiaId, pin, agora) {
  var ip = await ipId(request, env);
  await checarBloqueios(env, [['pin', familiaId + '|' + ip], ['pinfam', familiaId], ['ip', ip]], agora);
  var f = await env.DB.prepare('SELECT pin_hash, pin_salt, iter FROM familias WHERE id = ?1').bind(familiaId).first();
  if (!f) throw Erro(404, 'familia', 'Família não encontrada.');
  var h = typeof pin === 'string' && /^\d{4,8}$/.test(pin) ? await hashPin(pin, f.pin_salt, f.iter, env.PEPPER) : '';
  if (!h || !iguaisConstante(h, f.pin_hash)) {
    await registrarFalha(env, 'pin', familiaId + '|' + ip, agora); await registrarFalha(env, 'pinfam', familiaId, agora); await registrarFalha(env, 'ip', ip, agora);
    throw Erro(403, 'pin_errado', 'PIN incorreto.');
  }
  await limparFalhas(env, 'pin|' + familiaId + '|' + ip);
}

var R = {};

R.criar = async function (request, env, agora) {
  var b = await lerJson(request), ip = await ipId(request, env);
  await checarBloqueios(env, [['novo', ip], ['ip', ip]], agora);
  var fraco = pinFraco(String(b.pin || '')); if (fraco) throw Erro(400, 'pin_fraco', fraco);
  if (!validarBlob(b.salt, 64) || !validarBlob(b.env_senha, 400) || !validarBlob(b.env_rec, 400)) throw Erro(400, 'chaves_invalidas', 'Chaves de criptografia inválidas.');
  var n = await env.DB.prepare('SELECT COUNT(*) AS n FROM familias').first();
  if (n.n >= MAX_FAMILIAS) throw Erro(503, 'cheio', 'Limite de famílias deste servidor atingido.');
  await registrarFalha(env, 'novo', ip, agora);                                   /* conta cada criação (o limite é por hora) */
  var id = bytesParaB64(aleatorio(12)), codigo = await codigoNovo(env), saltPin = bytesParaB64(aleatorio(16));
  var ph = await hashPin(b.pin, saltPin, ITER_PIN, env.PEPPER);
  await env.DB.prepare('INSERT INTO familias (id, codigo, pin_hash, pin_salt, iter, salt, env_senha, env_rec, seq, criada_em, atualizada_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?9)').bind(id, codigo, ph, saltPin, ITER_PIN, b.salt, b.env_senha, b.env_rec, agora).run();
  var token = await novaSessao(env, id, b.rotulo, agora);
  return { status: 201, corpo: { codigo: codigo, token: token, seq: 0 } };
};

R.entrar = async function (request, env, agora) {
  var b = await lerJson(request), ip = await ipId(request, env);
  var codigo = String(b.codigo || '').replace(/\D/g, '');
  var f = RE_CODIGO.test(codigo) ? await env.DB.prepare('SELECT id, salt, env_senha, env_rec, seq FROM familias WHERE codigo = ?1').bind(codigo).first() : null;
  if (!f) {
    await checarBloqueios(env, [['ip', ip]], agora);
    await hashPin('0000', 'AAAAAAAAAAAAAAAAAAAAAA', ITER_PIN, env.PEPPER);        /* tempo parecido com um PIN errado: não revela se o código existe */
    await registrarFalha(env, 'ip', ip, agora);
    throw Erro(403, 'credencial', 'Código ou PIN incorretos.');
  }
  try { await verificarPin(request, env, f.id, String(b.pin || ''), agora); }
  catch (e) { if (e.codigo === 'pin_errado') throw Erro(403, 'credencial', 'Código ou PIN incorretos.'); throw e; }
  var token = await novaSessao(env, f.id, b.rotulo, agora);
  return { status: 200, corpo: { token: token, codigo: codigo, salt: f.salt, env_senha: f.env_senha, env_rec: f.env_rec, seq: f.seq } };
};

R.dadosGet = async function (request, env, agora, url) {
  var s = await autenticar(request, env, agora);
  var since = Math.max(0, Math.floor(Number(url.searchParams.get('since')) || 0));
  var r = await env.DB.batch([
    env.DB.prepare('SELECT seq, atualizada_em FROM familias WHERE id = ?1').bind(s.familia),
    env.DB.prepare('SELECT colecao AS c, id AS i, dados AS d, t, apagado AS a, seq FROM itens WHERE familia_id = ?1 AND seq > ?2 ORDER BY seq').bind(s.familia, since)
  ]);
  var f = r[0].results[0] || { seq: 0, atualizada_em: 0 };
  return { status: 200, corpo: { seq: f.seq, version: f.seq, updated_at: f.atualizada_em, agora: agora, itens: r[1].results.map(saida) } };
};
function saida(x) { return { c: x.c, i: x.i, d: x.a ? null : x.d, t: x.t, a: x.a ? 1 : 0 }; }

R.dadosPut = async function (request, env, agora) {
  var s = await autenticar(request, env, agora), b = await lerJson(request);
  var since = Math.max(0, Math.floor(Number(b.since) || 0));
  if (!Array.isArray(b.mudancas)) throw Erro(400, 'json_invalido', 'Campo "mudancas" ausente.');
  if (b.mudancas.length > MAX_MUDANCAS) throw Erro(413, 'muitas_mudancas', 'Máximo de ' + MAX_MUDANCAS + ' itens por envio.');
  var mapa = {};
  for (var k = 0; k < b.mudancas.length; k++) {
    var m = validarMudanca(b.mudancas[k], agora);
    if (!m) throw Erro(400, 'item_invalido', 'Item inválido na posição ' + k + '.');
    var ch = m.c + '|' + m.i;
    if (!mapa[ch] || vence(m, mapa[ch])) mapa[ch] = m;
  }
  var lista = Object.keys(mapa).map(function (x) { return mapa[x]; });
  var fid = s.familia, novoSeq;
  if (lista.length) {
    var tot = await env.DB.prepare('SELECT COUNT(*) AS n FROM itens WHERE familia_id = ?1').bind(fid).first();
    if (tot.n + lista.length > MAX_ITENS_FAMILIA + 200) throw Erro(413, 'limite_itens', 'Limite de itens da família atingido.');
    var st = [env.DB.prepare('UPDATE familias SET seq = seq + 1, atualizada_em = ?2 WHERE id = ?1').bind(fid, agora)];
    var upserts = lista.filter(function (m) { return !m.n; }), novos = lista.filter(function (m) { return m.n; });
    var UPS = ' ON CONFLICT(familia_id, colecao, id) DO UPDATE SET dados = excluded.dados, t = excluded.t, apagado = excluded.apagado, seq = excluded.seq' +
      ' WHERE excluded.t > itens.t OR (excluded.t = itens.t AND (excluded.apagado > itens.apagado OR (excluded.apagado = itens.apagado AND COALESCE(excluded.dados, \'\') > COALESCE(itens.dados, \'\')))) RETURNING colecao, id';
    function lotes(arr, sufixo) {
      for (var p = 0; p < arr.length; p += 15) {
        var fatia = arr.slice(p, p + 15), vals = [], params = [fid];
        fatia.forEach(function (m, j) {
          var o = 2 + j * 5;
          vals.push('(?1, ?' + o + ', ?' + (o + 1) + ', ?' + (o + 2) + ', ?' + (o + 3) + ', ?' + (o + 4) + ', (SELECT seq FROM familias WHERE id = ?1))');
          params.push(m.c, m.i, m.d, m.t, m.a);
        });
        var ps = env.DB.prepare('INSERT INTO itens (familia_id, colecao, id, dados, t, apagado, seq) VALUES ' + vals.join(', ') + sufixo);
        st.push(ps.bind.apply(ps, params));
      }
    }
    lotes(upserts, UPS);
    lotes(novos, ' ON CONFLICT(familia_id, colecao, id) DO NOTHING RETURNING colecao, id');
    st.push(env.DB.prepare('DELETE FROM itens WHERE familia_id = ?1 AND apagado = 1 AND t < ?2').bind(fid, agora - TOMBA_DIAS * 86400e3));
    var res = await env.DB.batch(st);
    var aceitos = {};
    for (var q = 1; q < st.length - 1; q++) (res[q].results || []).forEach(function (r) { aceitos[r.colecao + '|' + r.id] = 1; });
    var rejeitados = lista.filter(function (m) { return !aceitos[m.c + '|' + m.i]; });
    var sq = await env.DB.prepare('SELECT seq FROM familias WHERE id = ?1').bind(fid).first();
    novoSeq = sq.seq;
    var saidaItens = [];
    var cons = [env.DB.prepare('SELECT colecao AS c, id AS i, dados AS d, t, apagado AS a, seq FROM itens WHERE familia_id = ?1 AND seq > ?2 AND seq <> ?3 ORDER BY seq').bind(fid, since, novoSeq)];
    for (var z = 0; z < rejeitados.length; z += 40) {
      var gr = rejeitados.slice(z, z + 40), conds = [], pr = [fid];
      gr.forEach(function (m, j) { conds.push('(colecao = ?' + (2 + j * 2) + ' AND id = ?' + (3 + j * 2) + ')'); pr.push(m.c, m.i); });
      var sql = 'SELECT colecao AS c, id AS i, dados AS d, t, apagado AS a, seq FROM itens WHERE familia_id = ?1 AND (' + conds.join(' OR ') + ')';
      var ps = env.DB.prepare(sql); cons.push(ps.bind.apply(ps, pr));
    }
    var r2 = await env.DB.batch(cons), vistos = {};
    r2.forEach(function (rr) { rr.results.forEach(function (x) { var kk = x.c + '|' + x.i; if (!vistos[kk]) { vistos[kk] = 1; saidaItens.push(saida(x)); } }); });
    return { status: 200, corpo: { seq: novoSeq, version: novoSeq, updated_at: agora, agora: agora, aceitos: Object.keys(aceitos).length, itens: saidaItens } };
  }
  var g = await R.dadosGet(request, env, agora, { searchParams: { get: function () { return String(since); } } });
  return g;
};

R.sair = async function (request, env, agora) {
  var s = await autenticar(request, env, agora);
  await env.DB.prepare('DELETE FROM sessoes WHERE token_hash = ?1').bind(s.th).run();
  return { status: 200, corpo: { ok: true } };
};
R.sairTodos = async function (request, env, agora) {
  var s = await autenticar(request, env, agora);
  var r = await env.DB.prepare('DELETE FROM sessoes WHERE familia_id = ?1').bind(s.familia).run();
  return { status: 200, corpo: { ok: true } };
};
R.aparelhos = async function (request, env, agora) {
  var s = await autenticar(request, env, agora);
  var r = await env.DB.prepare('SELECT token_hash, rotulo, criada_em, ultimo_uso FROM sessoes WHERE familia_id = ?1 ORDER BY criada_em').bind(s.familia).all();
  return { status: 200, corpo: { aparelhos: r.results.map(function (x) { return { id: x.token_hash.slice(0, 12), rotulo: x.rotulo, criada_em: x.criada_em, ultimo_uso: x.ultimo_uso, atual: x.token_hash === s.th }; }) } };
};
R.revogar = async function (request, env, agora) {
  var s = await autenticar(request, env, agora), b = await lerJson(request);
  if (typeof b.id !== 'string' || !/^[0-9a-f]{12}$/.test(b.id)) throw Erro(400, 'id_invalido', 'Aparelho inválido.');
  await env.DB.prepare("DELETE FROM sessoes WHERE familia_id = ?1 AND substr(token_hash, 1, 12) = ?2").bind(s.familia, b.id).run();
  return { status: 200, corpo: { ok: true } };
};
R.trocarPin = async function (request, env, agora) {
  var s = await autenticar(request, env, agora), b = await lerJson(request);
  var fraco = pinFraco(String(b.pin_novo || '')); if (fraco) throw Erro(400, 'pin_fraco', fraco);
  await verificarPin(request, env, s.familia, String(b.pin_atual || ''), agora);
  var salt = bytesParaB64(aleatorio(16)), ph = await hashPin(b.pin_novo, salt, ITER_PIN, env.PEPPER);
  await env.DB.batch([
    env.DB.prepare('UPDATE familias SET pin_hash = ?2, pin_salt = ?3, iter = ?4 WHERE id = ?1').bind(s.familia, ph, salt, ITER_PIN),
    env.DB.prepare('DELETE FROM sessoes WHERE familia_id = ?1 AND token_hash <> ?2').bind(s.familia, s.th)
  ]);
  return { status: 200, corpo: { ok: true } };
};
R.chavesPut = async function (request, env, agora) {          /* troca da senha da família / nova chave de recuperação (só envelopes opacos) */
  var s = await autenticar(request, env, agora), b = await lerJson(request);
  await verificarPin(request, env, s.familia, String(b.pin || ''), agora);
  if (!validarBlob(b.salt, 64) || !validarBlob(b.env_senha, 400) || (b.env_rec != null && !validarBlob(b.env_rec, 400))) throw Erro(400, 'chaves_invalidas', 'Chaves inválidas.');
  if (b.env_rec) await env.DB.prepare('UPDATE familias SET salt = ?2, env_senha = ?3, env_rec = ?4 WHERE id = ?1').bind(s.familia, b.salt, b.env_senha, b.env_rec).run();
  else await env.DB.prepare('UPDATE familias SET salt = ?2, env_senha = ?3 WHERE id = ?1').bind(s.familia, b.salt, b.env_senha).run();
  return { status: 200, corpo: { ok: true } };
};
R.excluir = async function (request, env, agora) {
  var s = await autenticar(request, env, agora), b = await lerJson(request);
  await verificarPin(request, env, s.familia, String(b.pin || ''), agora);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM itens WHERE familia_id = ?1').bind(s.familia),
    env.DB.prepare('DELETE FROM sessoes WHERE familia_id = ?1').bind(s.familia),
    env.DB.prepare("DELETE FROM tentativas WHERE chave LIKE ?1 OR chave = ?2").bind('pin|' + s.familia + '|%', 'pinfam|' + s.familia),
    env.DB.prepare('DELETE FROM familias WHERE id = ?1').bind(s.familia)
  ]);
  return { status: 200, corpo: { ok: true } };
};
R.saude = async function () { return { status: 200, corpo: { ok: true, servico: 'painel-sala-sync', versao: 2 } }; };

var ROTAS = {
  'POST /v1/familia': R.criar, 'POST /v1/entrar': R.entrar,
  'GET /v1/dados': R.dadosGet, 'PUT /v1/dados': R.dadosPut,
  'POST /v1/sair': R.sair, 'POST /v1/sair-todos': R.sairTodos,
  'GET /v1/aparelhos': R.aparelhos, 'POST /v1/aparelhos/revogar': R.revogar,
  'POST /v1/pin': R.trocarPin, 'PUT /v1/chaves': R.chavesPut,
  'POST /v1/familia/excluir': R.excluir, 'GET /v1/saude': R.saude
};

export default {
  async fetch(request, env) {
    var permitidas = env.ORIGEM_PERMITIDA ? String(env.ORIGEM_PERMITIDA).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : ORIGENS_PADRAO;
    var origem = request.headers.get('origin');
    var ok = !origem || permitidas.indexOf(origem) >= 0;
    try {
      if (origem && !ok) return new Response(JSON.stringify({ erro: 'origem', mensagem: 'Origem não permitida.' }), { status: 403, headers: cabecalhos(null) });
      var cors = origem ? origem : null;
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabecalhos(cors) });
      if (!env.DB || !env.PEPPER) throw Erro(500, 'config', 'Servidor mal configurado.');
      var url = new URL(request.url);
      var f = ROTAS[request.method + ' ' + url.pathname];
      if (!f) return new Response(JSON.stringify({ erro: 'nao_encontrado', mensagem: 'Rota inexistente.' }), { status: 404, headers: cabecalhos(cors) });
      var r = await f(request, env, Date.now(), url);
      return new Response(JSON.stringify(r.corpo), { status: r.status, headers: cabecalhos(cors) });
    } catch (e) {
      var st = e && e.status ? e.status : 500;
      if (!e || !e.status) console.error('erro interno', e && e.message ? String(e.message).slice(0, 200) : 'desconhecido');   /* sem dados do usuário */
      var h = cabecalhos(origem && ok ? origem : null);
      if (e && e.extra && e.extra.espere_s) h['retry-after'] = String(e.extra.espere_s);
      return new Response(JSON.stringify({ erro: e && e.codigo ? e.codigo : 'interno', mensagem: e && e.mensagem ? e.mensagem : 'Erro interno.' }), { status: st, headers: h });
    }
  }
};

export var _teste = { vence: vence, pinFraco: pinFraco, validarMudanca: validarMudanca, iguaisConstante: iguaisConstante, hashPin: hashPin };
