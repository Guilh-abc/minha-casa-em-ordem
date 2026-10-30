/* Minha Casa em Ordem — núcleo da sincronização (puro: sem DOM, sem rede própria). Testado em Node (tools/teste-unidade.js).
   Regra de conflito = a mesma do servidor: vence o maior carimbo `t`; empate: exclusão vence; depois o maior texto cifrado. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else { raiz.PS = raiz.PS || {}; raiz.PS.nucleo = fabrica(); }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  /* coleções-lista (itens com id). Nomes: 2–16 letras minúsculas (exigência do servidor). */
  /* 'lembretes', 'habitos' e 'checks' (rotina) saíram do app: não são mais enviados; se um aparelho antigo mandar, o item é aceito e ignorado
     (sanearItem devolve null e colocar/tirar não acham a coleção). */
  var COLECOES = ['tarefas', 'compromissos', 'contas', 'links', 'foco', 'cartoes', 'faturas', 'lancs', 'regras', 'radios', 'passeios', 'programa', 'compras', 'notas'];
  var CONFIG_LOCAL = ['fonte', 'contraste', 'filtroDono', 'notificar'];     /* preferências de TELA: cada aparelho tem a sua */
  var DIAS_TOMBA = 130;

  function estavel(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(estavel).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + estavel(v[k]); }).join(',') + '}';
  }
  function cyrb53(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57, i, ch;
    for (i = 0; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function hashDe(o) { return cyrb53(estavel(o)); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  function configCompartilhada(c) { var r = {}; Object.keys(c || {}).forEach(function (k) { if (CONFIG_LOCAL.indexOf(k) < 0) r[k] = c[k]; }); return r; }

  /* Fotografia do estado atual como mapa chave -> {c, i, d} */
  function itensLocais(estado) {
    var m = {};
    COLECOES.forEach(function (c) { (estado[c] || []).forEach(function (x) { if (x && x.id) m[c + '|' + x.id] = { c: c, i: x.id, d: x }; }); });
    m['meta|config'] = { c: 'meta', i: 'config', d: configCompartilhada(estado.config) };
    m['meta|listas'] = { c: 'meta', i: 'listas', d: estado.listas || [] };
    return m;
  }

  /* Compara com o que já foi sincronizado e marca o que mudou (novo, editado, apagado). */
  function diferencas(meta, locais, agora) {
    var it = meta.itens, k, n = 0, m;
    for (k in locais) {
      if (!Object.prototype.hasOwnProperty.call(locais, k)) continue;
      var h = hashDe(locais[k].d); m = it[k];
      if (!m) { it[k] = { t: agora, h: h, vivo: true, env: false, n: meta.primeiro ? 1 : 0 }; n++; }
      else if (!m.vivo) { m.vivo = true; m.h = h; m.t = Math.max(agora, m.t + 1); m.env = false; m.n = 0; n++; }          /* recriado depois de apagado */
      else if (m.h !== h) { m.h = h; m.t = Math.max(agora, m.t + 1); m.env = false; m.n = 0; n++; }
    }
    for (k in it) {
      if (!Object.prototype.hasOwnProperty.call(it, k)) continue;
      m = it[k];
      if (m.vivo && !locais[k]) { m.vivo = false; m.t = Math.max(agora, m.t + 1); m.env = false; m.h = ''; m.n = 0; n++; }
      else if (!m.vivo && m.env && m.t < agora - DIAS_TOMBA * 86400e3) delete it[k];
    }
    return n;
  }

  /* mesma regra do servidor (sync-worker/worker.js: vence) */
  function vence(a, b) {
    if (a.t !== b.t) return a.t > b.t;
    if ((a.a ? 1 : 0) !== (b.a ? 1 : 0)) return !!a.a;
    return String(a.d || '') > String(b.d || '');
  }

  /* ---- aplicar um item recebido, preservando a identidade dos objetos (editores abertos continuam válidos) ---- */
  function substituirNoLugar(alvo, novo) { Object.keys(alvo).forEach(function (k) { delete alvo[k]; }); Object.keys(novo).forEach(function (k) { alvo[k] = novo[k]; }); }
  function colocar(estado, c, id, d) {
    var local = null;
    if (c === 'meta') {
      if (id === 'config') { var cfg = estado.config; Object.keys(d).forEach(function (k) { if (CONFIG_LOCAL.indexOf(k) < 0) cfg[k] = d[k]; }); return configCompartilhada(cfg); }
      if (id === 'listas') { estado.listas.length = 0; d.forEach(function (x) { estado.listas.push(x); }); return estado.listas; }
      return null;
    }
    if (COLECOES.indexOf(c) < 0) return null;
    var lista = estado[c]; if (!lista) return null;
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) { substituirNoLugar(lista[i], d); return lista[i]; }
    lista.push(d); return d;
  }
  function tirar(estado, c, id) {
    if (COLECOES.indexOf(c) < 0) return;
    var lista = estado[c]; if (!lista) return;
    for (var j = 0; j < lista.length; j++) if (lista[j].id === id) { lista.splice(j, 1); return; }
  }

  /* ---- motor: um ciclo = descobrir mudanças locais, enviar (cifradas), receber, aplicar ---- */
  function criarMotor(o) {
    var cr = o.cripto, emCurso = null;

    function indice(meta) { var ix = {}; Object.keys(meta.itens).forEach(function (k) { if (meta.itens[k].o) ix[meta.itens[k].o] = k; }); return ix; }

    function montarEnvio(meta, locais, chaves, limite) {
      var sujos = Object.keys(meta.itens).filter(function (k) { return !meta.itens[k].env; }).slice(0, limite);
      var feitos = [];
      return sujos.reduce(function (p, k) {
        return p.then(function () {
          var m = meta.itens[k], pos = k.indexOf('|'), c = k.slice(0, pos), id = k.slice(pos + 1);
          var pO = m.o ? Promise.resolve(m.o) : cr.idOpaco(chaves, c, id).then(function (x) { m.o = x; return x; });
          return pO.then(function (op) {
            if (!m.vivo) { feitos.push({ k: k, h: m.h, t: m.t, mud: { c: c, i: op, t: m.t, a: 1, n: 0 } }); return null; }
            var loc = locais[k]; if (!loc) return null;
            return cr.cifrar(chaves, c, op, { i: id, d: loc.d }).then(function (txt) {
              feitos.push({ k: k, h: m.h, t: m.t, mud: { c: c, i: op, t: m.t, a: 0, d: txt, n: m.n ? 1 : 0 } });
            });
          });
        });
      }, Promise.resolve()).then(function () { return { feitos: feitos, restam: sujos.length >= limite }; });
    }

    function processar(meta, r, chaves, estado, rel, forcar) {
      var ix = o.indice || (o.indice = {}); var chave = ix[r.i];
      var m = chave ? meta.itens[chave] : null;
      if (r.a) {
        if (!chave || !m) return Promise.resolve();
        if (m.vivo === false && m.t >= r.t) { m.env = m.env || m.t === r.t; return Promise.resolve(); }
        if (m.vivo && r.t < m.t && !forcar[r.i]) return Promise.resolve();      /* o local é mais novo; já foi/vai ser enviado */
        var pos = chave.indexOf('|'), c = chave.slice(0, pos), id = chave.slice(pos + 1);
        o.mutar(function (s) { tirar(s, c, id); });
        meta.itens[chave] = { o: r.i, t: r.t, h: '', vivo: false, env: true, n: 0 }; rel.recebidos++;
        return Promise.resolve();
      }
      return cr.decifrar(chaves, r.c, r.i, r.d).then(function (p) {
        if (!p || typeof p.i !== 'string') throw new Error('item');
        var k = r.c + '|' + p.i, mm = meta.itens[k];
        if (mm && mm.vivo && r.t < mm.t && !forcar[r.i]) return;                    /* local mais novo (exceto item enviado como "só se não existir": aí o servidor manda) */
        var dado = o.sanearItem(r.c, p.i, p.d);
        if (dado == null) { rel.ignorados++; return; }
        var local = null; o.mutar(function (s) { local = colocar(s, r.c, p.i, dado); });
        meta.itens[k] = { o: r.i, t: r.t, h: hashDe(local), vivo: true, env: true, n: 0 };
        ix[r.i] = k; rel.recebidos++;
      }, function () { rel.erros++; });
    }

    function umaRodada(rel) {
      var meta = o.meta, chaves = o.chaves(), estado = o.estado();
      var locais = itensLocais(estado);
      diferencas(meta, locais, o.agora());
      return montarEnvio(meta, locais, chaves, o.lote || 100).then(function (env) {
        o.indice = indice(meta);
        var chamada = env.feitos.length ? o.api.put(meta.seq, env.feitos.map(function (f) { return f.mud; })) : o.api.get(meta.seq);
        return chamada.then(function (resp) {
          env.feitos.forEach(function (f) { var m = meta.itens[f.k]; if (m && m.h === f.h && m.t === f.t) { m.env = true; if (f.mud.n) m.n = 0; } });
          rel.enviados += env.feitos.length;
          var forcar = {}; env.feitos.forEach(function (f) { if (f.mud.n) forcar[f.mud.i] = true; });
          if (!o.podeAplicar()) { rel.adiado = true; o.gravarMeta(); return { mais: false }; }
          var itens = resp.itens || [];
          return itens.reduce(function (p, r) { return p.then(function () { return processar(meta, r, chaves, estado, rel, forcar); }); }, Promise.resolve()).then(function () {
            meta.seq = resp.seq; meta.ultima = o.agora(); meta.primeiro = false;
            o.gravarMeta();
            return { mais: env.restam };
          });
        });
      });
    }

    function ciclo() {
      if (emCurso) return emCurso;
      var rel = { enviados: 0, recebidos: 0, erros: 0, ignorados: 0, adiado: false };
      function loop(n) { return umaRodada(rel).then(function (r) { return (r.mais && n < 30 && !rel.adiado) ? loop(n + 1) : rel; }); }
      emCurso = loop(0).then(function (r) { emCurso = null; return r; }, function (e) { emCurso = null; throw e; });
      return emCurso;
    }
    return { ciclo: ciclo };
  }

  return {
    COLECOES: COLECOES, CONFIG_LOCAL: CONFIG_LOCAL, estavel: estavel, hashDe: hashDe, itensLocais: itensLocais, diferencas: diferencas,
    vence: vence, colocar: colocar, tirar: tirar, criarMotor: criarMotor, configCompartilhada: configCompartilhada
  };
});
