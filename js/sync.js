/* Minha Casa em Ordem — sincronização na nuvem (navegador). Criptografia ponta a ponta: o servidor só vê texto cifrado.
   Depende de PS.cripto, PS.nucleo e PS.store. Nunca registra PIN, senha, chave ou token em log. */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var C = PS.cripto, N = PS.nucleo, S = PS.store, U = PS.u;
  var CHAVE = 'painelsala.sync', CHAVE_META = 'painelsala.sync.meta';
  var URL_PADRAO = 'https://painel-sala-sync.guilhermeromionetto.workers.dev';
  var cfg = null, meta = null, chaves = null, motor = null;
  var st = { fase: 'desligado', ultimaOk: 0, erro: '', tentando: false, offline: false, semSessao: false, pendentes: 0, ultimaTentativa: 0 };
  var ouvintes = [], timerDeb = null, timerRetry = null, iniciado = false;

  function ler(k) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function remover(k) { try { localStorage.removeItem(k); } catch (e) { /* ok */ } }
  function gravarMeta() { gravar(CHAVE_META, meta); }
  function avisar() { ouvintes.slice().forEach(function (f) { try { f(estado()); } catch (e) { /* ok */ } }); }

  function rotuloAparelho() {
    var ua = (g.navigator && navigator.userAgent) || '';
    if (/Android.*(TV|BRAVIA|AFTMM|AFTT|SmartTV)/i.test(ua) || /(Tizen|Web0S|SMART-TV|AndroidTV)/i.test(ua)) return 'Celular';
    if (/iPhone|iPad/i.test(ua)) return 'iPhone/iPad';
    if (/Android/i.test(ua)) return 'Celular Android';
    return 'Computador';
  }

  /* ---------- rede ---------- */
  function chamar(metodo, caminho, corpo, comToken) {
    var url = ((cfg && cfg.url) || URL_PADRAO) + caminho;
    var h = { 'content-type': 'application/json' };
    if (comToken !== false && cfg && cfg.token) h.authorization = 'Bearer ' + cfg.token;
    var ctl = g.AbortController ? new AbortController() : null, tm = null;
    var opc = { method: metodo, headers: h, mode: 'cors', credentials: 'omit', cache: 'no-store', body: corpo ? JSON.stringify(corpo) : undefined };
    if (ctl) { opc.signal = ctl.signal; tm = setTimeout(function () { ctl.abort(); }, 20000); }
    return fetch(url, opc).then(function (r) {
      if (tm) clearTimeout(tm);
      return r.text().then(function (txt) {
        var j = null; try { j = txt ? JSON.parse(txt) : {}; } catch (e) { j = null; }
        if (!r.ok || !j) { var e = new Error((j && j.mensagem) || ('Erro ' + r.status)); e.status = r.status; e.codigo = j && j.erro; e.retry = Number(r.headers.get('retry-after')) || 0; throw e; }
        return j;
      });
    }, function (e) { if (tm) clearTimeout(tm); var x = new Error('Sem conexão com o servidor.'); x.rede = true; throw x; });
  }
  var api = {
    put: function (since, mud) { return chamar('PUT', '/v1/dados', { since: since, mudancas: mud }); },
    get: function (since) { return chamar('GET', '/v1/dados?since=' + encodeURIComponent(since)); }
  };

  /* ---------- estado público ---------- */
  function estado() {
    var fase = st.fase;
    var idade = st.ultimaOk ? Date.now() - st.ultimaOk : Infinity;
    var rotulo, nivel;
    if (!cfg) { fase = 'desligado'; rotulo = 'Sem sincronização'; nivel = 'neutro'; }
    else if (!chaves) { fase = 'bloqueado'; rotulo = 'Digite a senha da família'; nivel = 'aviso'; }
    else if (st.semSessao) { fase = 'sessao'; rotulo = 'Entre de novo (sessão encerrada)'; nivel = 'perigo'; }
    else if (st.offline || (typeof navigator !== 'undefined' && navigator.onLine === false)) { fase = 'offline'; rotulo = 'Sem conexão — dados salvos neste aparelho'; nivel = 'aviso'; }
    else if (st.erro && idade > 180000) { fase = 'atrasado'; rotulo = 'Atrasado — ' + (st.ultimaOk ? 'última vez há ' + dur(idade) : 'ainda não sincronizou'); nivel = 'aviso'; }
    else if (!st.ultimaOk) { fase = 'conectando'; rotulo = 'Conectando…'; nivel = 'neutro'; }
    else if (idade > 180000) { fase = 'atrasado'; rotulo = 'Atrasado — última vez há ' + dur(idade); nivel = 'aviso'; }
    else { fase = 'ok'; rotulo = idade < 20000 ? 'Sincronizado agora' : 'Sincronizado há ' + dur(idade); nivel = 'ok'; }
    return { ativo: !!cfg, fase: fase, rotulo: rotulo, nivel: nivel, ultimaOk: st.ultimaOk, erro: st.erro, tentando: st.tentando, codigo: cfg ? cfg.codigo : '', aparelho: cfg ? cfg.rotulo : '', url: cfg ? (cfg.url || URL_PADRAO) : URL_PADRAO, temChaves: !!chaves };
  }
  function dur(ms) { var s = Math.round(ms / 1000); if (s < 60) return s + ' s'; var m = Math.round(s / 60); if (m < 60) return m + ' min'; var h = Math.round(m / 60); return h < 48 ? h + ' h' : Math.round(h / 24) + ' dias'; }

  /* ---------- ciclo ---------- */
  function podeAplicar() {
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'button' && a.type !== 'checkbox') return false;
    if (PS.modal && PS.modal.aberto()) return false;
    return true;
  }
  function montarMotor() {
    motor = N.criarMotor({
      cripto: C, chaves: function () { return chaves; }, estado: function () { return S.get(); }, mutar: function (fn) { S.aplicarRemoto(fn); },
      sanearItem: S.sanearItem, meta: meta, gravarMeta: gravarMeta, api: api, agora: function () { return Date.now(); }, podeAplicar: podeAplicar
    });
  }
  function sincronizar(motivo) {
    if (!cfg || !chaves || !motor) { avisar(); return Promise.resolve(null); }
    if (st.tentando) return Promise.resolve(null);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { st.offline = true; avisar(); return Promise.resolve(null); }
    st.tentando = true; st.ultimaTentativa = Date.now(); avisar();
    return motor.ciclo().then(function (r) {
      st.tentando = false; st.offline = false; st.semSessao = false;
      if (r.adiado) { agendar(4000); } else { st.erro = ''; st.ultimaOk = Date.now(); }
      if (r.recebidos && podeAplicar()) { PS.aplicarConfig && PS.aplicarConfig(); PS.redesenhar && PS.redesenhar(); }
      avisar(); return r;
    }, function (e) {
      st.tentando = false;
      if (e.status === 401) { st.semSessao = true; st.erro = 'sessao'; }
      else if (e.rede) { st.offline = true; st.erro = 'rede'; }
      else { st.erro = e.status === 429 ? 'Muitas tentativas; aguarde.' : (e.message || 'erro'); }
      avisar(); return null;
    });
  }
  function agendar(ms) { clearTimeout(timerDeb); timerDeb = setTimeout(function () { sincronizar('edicao'); }, ms == null ? 2500 : ms); }

  function carregar() {
    cfg = ler(CHAVE);
    if (!cfg || !cfg.token || !cfg.codigo) { cfg = null; meta = null; chaves = null; motor = null; return Promise.resolve(); }
    meta = ler(CHAVE_META) || { seq: 0, itens: {}, primeiro: true };
    if (!meta.itens) meta.itens = {};
    return C.ler().then(function (k) { chaves = k; }, function () { chaves = null; }).then(function () { if (chaves) montarMotor(); });
  }

  function iniciar() {
    if (iniciado) return Promise.resolve(); iniciado = true;
    S.aoGravar(function () { if (cfg && chaves) agendar(); });
    g.addEventListener('focus', function () { if (cfg) sincronizar('foco'); });
    g.addEventListener('online', function () { st.offline = false; if (cfg) sincronizar('online'); });
    g.addEventListener('offline', function () { st.offline = true; avisar(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && cfg) sincronizar('visivel'); });
    setInterval(function () { if (cfg && !document.hidden) sincronizar('intervalo'); else avisar(); }, 60000);
    setInterval(function () { if (cfg) avisar(); }, 20000);      /* rótulo "há N min" */
    g.addEventListener('storage', function (e) { if (e.key === CHAVE || e.key === CHAVE_META) { /* outra aba: recarrega */ carregar().then(avisar); } });
    return carregar().then(function () { avisar(); if (cfg && chaves) sincronizar('abrir'); });
  }

  /* ---------- conexão: criar / entrar / sair ---------- */
  function salvarConexao(dados, novoMeta) {
    cfg = { url: URL_PADRAO, codigo: dados.codigo, token: dados.token, salt: dados.salt, env_senha: dados.env_senha, env_rec: dados.env_rec, rotulo: dados.rotulo };
    meta = novoMeta; gravar(CHAVE, cfg); gravarMeta();
    st = { fase: 'conectando', ultimaOk: 0, erro: '', tentando: false, offline: false, semSessao: false, pendentes: 0, ultimaTentativa: 0 };
  }
  function guardarChaves(k) { chaves = k; return C.guardar(k).then(function () { return true; }, function () { return false; }); }

  function criar(pin, senha) {
    var rotulo = rotuloAparelho();
    return C.novoCofre(senha).then(function (cofre) {
      return chamar('POST', '/v1/familia', { pin: pin, salt: cofre.salt, env_senha: cofre.env_senha, env_rec: cofre.env_rec, rotulo: rotulo }, false).then(function (r) {
        salvarConexao({ codigo: r.codigo, token: r.token, salt: cofre.salt, env_senha: cofre.env_senha, env_rec: cofre.env_rec, rotulo: rotulo }, { seq: 0, itens: {}, primeiro: true });
        return guardarChaves(cofre.chaves).then(function (guardou) { montarMotor(); sincronizar('criar'); avisar(); return { codigo: r.codigo, recuperacao: cofre.recuperacao, guardouChaves: guardou }; });
      });
    });
  }
  /* 1ª parte de "entrar": confere código+PIN e abre o cofre; ainda NÃO altera os dados deste aparelho */
  var pendente = null;
  function entrar(codigo, pin, segredo, usaRecuperacao) {
    var rotulo = rotuloAparelho();
    return chamar('POST', '/v1/entrar', { codigo: codigo, pin: pin, rotulo: rotulo }, false).then(function (r) {
      var abre = usaRecuperacao ? C.abrirComRecuperacao(segredo, r.salt, r.env_rec) : C.abrirComSenha(segredo, r.salt, r.env_senha);
      return abre.then(function (k) {
        pendente = { dados: { codigo: r.codigo, token: r.token, salt: r.salt, env_senha: r.env_senha, env_rec: r.env_rec, rotulo: rotulo }, chaves: k };
        return { codigo: r.codigo, temDadosLocais: temDadosProprios() };
      }, function (e) {
        return revogarToken(r.token).then(function () { throw e; });
      });
    });
  }
  function revogarToken(token) { var c0 = cfg; cfg = { token: token, url: URL_PADRAO }; return chamar('POST', '/v1/sair').catch(function () {}).then(function () { cfg = c0; }); }
  function cancelarEntrada() { var p = pendente; pendente = null; if (p) return revogarToken(p.dados.token); return Promise.resolve(); }
  function temDadosProprios() {
    var s = S.get(), n = 0;
    ['tarefas', 'compromissos', 'contas', 'links', 'foco', 'cartoes', 'faturas', 'lancs', 'regras', 'radios', 'passeios', 'programa', 'compras', 'notas'].forEach(function (c) { (s[c] || []).forEach(function (x) { if (!x.exemplo) n++; }); });
    return n > 0;
  }
  /* modo: 'juntar' (padrão) ou 'familia' (descarta os dados deste aparelho e usa só os da família) */
  function confirmarEntrada(modo) {
    var p = pendente; if (!p) return Promise.reject(new Error('Nada para confirmar.')); pendente = null;
    S.aplicarRemoto(function (s) {
      var vaz = S.sanear({});
      N.COLECOES.forEach(function (c) {
        if (modo === 'familia') s[c] = []; else s[c] = (s[c] || []).filter(function (x) { return !x.exemplo; });
      });
      if (modo === 'familia') s.listas = vaz.listas;
    });
    salvarConexao(p.dados, { seq: 0, itens: {}, primeiro: true });
    return guardarChaves(p.chaves).then(function () { montarMotor(); return sincronizar('entrar'); }).then(function (r) { avisar(); return r; });
  }
  function esquecerLocal() {
    clearTimeout(timerDeb); clearTimeout(timerRetry);
    cfg = null; meta = null; chaves = null; motor = null; remover(CHAVE); remover(CHAVE_META);
    st = { fase: 'desligado', ultimaOk: 0, erro: '', tentando: false, offline: false, semSessao: false, pendentes: 0, ultimaTentativa: 0 };
    return C.esquecer().then(function () { avisar(); });
  }
  function sair() { var p = cfg ? chamar('POST', '/v1/sair').catch(function () {}) : Promise.resolve(); return p.then(esquecerLocal); }
  function sairTodos() { return chamar('POST', '/v1/sair-todos').then(esquecerLocal); }
  function aparelhos() { return chamar('GET', '/v1/aparelhos').then(function (r) { return r.aparelhos || []; }); }
  function revogar(id) { return chamar('POST', '/v1/aparelhos/revogar', { id: id }); }
  function trocarPin(atual, novo) { return chamar('POST', '/v1/pin', { pin_atual: atual, pin_novo: novo }); }
  function excluirFamilia(pin) { return chamar('POST', '/v1/familia/excluir', { pin: pin }).then(esquecerLocal); }
  /* desbloqueio (quando o navegador não guardou as chaves) */
  function desbloquear(senha) {
    if (!cfg) return Promise.reject(new Error('Sem conexão configurada.'));
    return C.abrirComSenha(senha, cfg.salt, cfg.env_senha).then(function (k) { return guardarChaves(k).then(function () { montarMotor(); avisar(); sincronizar('desbloqueio'); }); });
  }
  function trocarSenha(pin, senhaAtual, novaSenha) {
    return C.abrirComSenha(senhaAtual, cfg.salt, cfg.env_senha, true).then(function (r) {
      return C.reembrulharSenha(r.mestre, novaSenha, cfg.salt).then(function (n) {
        return chamar('PUT', '/v1/chaves', { pin: pin, salt: n.salt, env_senha: n.env_senha }).then(function () { cfg.env_senha = n.env_senha; gravar(CHAVE, cfg); });
      });
    });
  }
  function novaRecuperacao(pin, senha) {
    return C.abrirComSenha(senha, cfg.salt, cfg.env_senha, true).then(function (r) {
      return C.reembrulhar(r.mestre, senha, cfg.salt).then(function (n) {
        return chamar('PUT', '/v1/chaves', { pin: pin, salt: n.salt, env_senha: n.env_senha, env_rec: n.env_rec }).then(function () { cfg.env_senha = n.env_senha; cfg.env_rec = n.env_rec; gravar(CHAVE, cfg); return n.recuperacao; });
      });
    });
  }

  /* ---------- backup cifrado (arquivo que só abre com a senha ou a chave de recuperação) ---------- */
  function exportarCifrado() {
    if (!cfg || !chaves) return Promise.reject(new Error('Ative a sincronização para gerar um backup cifrado.'));
    var locais = N.itensLocais(S.get()), ks = Object.keys(locais), out = [];
    return ks.reduce(function (p, k) {
      return p.then(function () {
        var l = locais[k]; return C.idOpaco(chaves, l.c, l.i).then(function (op) { return C.cifrar(chaves, l.c, op, { i: l.i, d: l.d }).then(function (d) { out.push({ c: l.c, i: op, d: d }); }); });
      });
    }, Promise.resolve()).then(function () {
      return JSON.stringify({ formato: 'minha-casa-backup-cifrado', versao: 1, criado_em: new Date().toISOString(), salt: cfg.salt, env_senha: cfg.env_senha, env_rec: cfg.env_rec, itens: out });
    });
  }
  function lerBackupCifrado(texto, segredo, usaRec) {
    var o; try { o = JSON.parse(texto); } catch (e) { return Promise.reject(new Error('Arquivo inválido.')); }
    if (!o || (o.formato !== 'minha-casa-backup-cifrado' && o.formato !== 'painel-sala-backup-cifrado') || !Array.isArray(o.itens)) return Promise.reject(new Error('Este arquivo não é um backup cifrado do Minha Casa em Ordem.'));
    var abre = usaRec ? C.abrirComRecuperacao(segredo, o.salt, o.env_rec) : C.abrirComSenha(segredo, o.salt, o.env_senha);
    return abre.then(function (k) {
      var novo = S.sanear({}); var tem = {};
      return o.itens.reduce(function (p, it) {
        return p.then(function () {
          return C.decifrar(k, it.c, it.i, it.d).then(function (pl) {
            var dado = S.sanearItem(it.c, pl.i, pl.d); if (dado == null) return;
            if (it.c === 'meta') { if (pl.i === 'config') { Object.keys(dado).forEach(function (kk) { if (N.CONFIG_LOCAL.indexOf(kk) < 0) novo.config[kk] = dado[kk]; }); } else novo.listas = dado; }
            else if (novo[it.c]) novo[it.c].push(dado);
          }, function () { /* item ilegível: ignora */ });
        });
      }, Promise.resolve()).then(function () { return novo; });
    });
  }

  PS.sync = {
    URL: URL_PADRAO, iniciar: iniciar, estado: estado, aoMudar: function (f) { ouvintes.push(f); return function () { ouvintes = ouvintes.filter(function (x) { return x !== f; }); }; },
    sincronizarAgora: function () { st.erro = ''; return sincronizar('manual'); }, ativo: function () { return !!cfg; },
    criar: criar, entrar: entrar, confirmarEntrada: confirmarEntrada, cancelarEntrada: cancelarEntrada, sair: sair, sairTodos: sairTodos,
    aparelhos: aparelhos, revogar: revogar, trocarPin: trocarPin, trocarSenha: trocarSenha, novaRecuperacao: novaRecuperacao, excluirFamilia: excluirFamilia,
    desbloquear: desbloquear, exportarCifrado: exportarCifrado, lerBackupCifrado: lerBackupCifrado, temDadosProprios: temDadosProprios, rotuloAparelho: rotuloAparelho
  };
})(window);
