/* Dados: localStorage versionado, sementes (dados.json), export/import JSON e link de configuração. */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u;
  var CHAVE = 'painelsala.dados';
  var VERSAO = 4;
  var CHAVE_MIG = 'painelsala.migracoes';
  var CHAVE_SYNC = 'painelsala.sync';
  var DONOS = ['gui', 'esposa', 'casal'];
  var FORMAS = ['boleto', 'pix', 'debito', 'gerar', 'outro'];
  var STATUS_FAT = ['aberta', 'fechada', 'paga'];
  var CATS = ['mercado', 'restaurante', 'transporte', 'saude', 'educacao', 'lazer', 'assinaturas', 'casa', 'compras', 'viagens', 'encargos', 'outros'];
  var hooksGravar = [], semHook = 0;
  var estado = null, ouvintes = [];

  var PADRAO_CONFIG = { cidade: 'Osasco, SP', lat: -23.5325, lon: -46.7917, fonte: 1, contraste: false, noiteAuto: true, escurecerMin: 10, nome: '', esposa: 'Esposa', filtroDono: 'todos', antecedencia: [3, 1, 0], notificar: false, orcamento: null, fixasAuto: false, fixasAviso: false };
  var PRIORIDADES = ['alta', 'media', 'baixa'];

  function vazio() {
    return { app: 'minha-casa-em-ordem', versao: VERSAO, config: copia(PADRAO_CONFIG), listas: ['Casa', 'Trabalho', 'Maria Alice'], tarefas: [], compromissos: [], contas: [], links: [], foco: [], cartoes: [], faturas: [], lancs: [], regras: [], radios: [], passeios: [], programa: [], compras: [], notas: [] };
  }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function str(v, n) { return U.limitar(v == null ? '' : String(v).replace(/[\u0000-\u001f]/g, ' '), n || 120).trim(); }
  function num(v, a, b, d) { v = Number(v); return isFinite(v) ? Math.min(b, Math.max(a, v)) : d; }
  function urlOk(u) { return typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u) && u.length <= 600; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function donoOk(v) { return DONOS.indexOf(v) >= 0 ? v : ''; }
  function iso(v) { return typeof v === 'string' && U.dataValida(v) ? v : ''; }
  function antecOk(v) {
    var l = (Array.isArray(v) ? v : PADRAO_CONFIG.antecedencia).map(function (n) { return Math.round(Number(n)); }).filter(function (n) { return isFinite(n) && n >= 0 && n <= 14; });
    var u = []; l.forEach(function (n) { if (u.indexOf(n) < 0) u.push(n); });
    u.sort(function (a, b) { return b - a; }); u = u.slice(0, 5);
    return u.length ? u : PADRAO_CONFIG.antecedencia.slice();
  }
  function id(x) { return (x && typeof x.id === 'string' && x.id) ? x.id.slice(0, 40) : U.uid(); }

  function numOpc(v) { return (v === '' || v == null || isNaN(Number(v))) ? null : Math.round(Math.max(-1e9, Math.min(1e9, Number(v))) * 100) / 100; }
  /* parcelas futuras da fatura (lista curta e compacta: cabe com folga no limite de 8 KB por item cifrado da sincronização) */
  function futurasOk(a) {
    if (!Array.isArray(a)) return [];
    var out = [], tam = 0;
    for (var i = 0; i < a.length && i < 80; i++) {
      var x = a[i] || {}, it = { data: iso(x.data), desc: str(x.desc, 40), pa: Math.round(num(x.pa, 0, 99, 0)), pt: Math.round(num(x.pt, 0, 99, 0)), valor: num(x.valor, -1e9, 1e9, 0), cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'outros' };
      tam += JSON.stringify(it).length + 1; if (tam > 3800) break; out.push(it);
    }
    return out;
  }
  /* Valida e normaliza QUALQUER objeto vindo de fora (import/backup/link) */
  function sanear(o) {
    var s = vazio();
    if (!o || typeof o !== 'object') return s;
    var c = o.config || {};
    s.config = {
      cidade: str(c.cidade, 80) || PADRAO_CONFIG.cidade,
      lat: num(c.lat, -90, 90, PADRAO_CONFIG.lat), lon: num(c.lon, -180, 180, PADRAO_CONFIG.lon),
      fonte: Math.round(num(c.fonte, 1, 3, 1)), contraste: !!c.contraste, noiteAuto: c.noiteAuto !== false,
      escurecerMin: Math.round(num(c.escurecerMin, 0, 120, 10)), nome: str(c.nome, 40),
      esposa: str(c.esposa, 20) || PADRAO_CONFIG.esposa, filtroDono: ['todos', 'meus', 'dela', 'nos'].indexOf(c.filtroDono) >= 0 ? c.filtroDono : 'todos',
      antecedencia: antecOk(c.antecedencia), notificar: c.notificar === true, orcamento: c.orcamento == null || c.orcamento === '' ? null : num(c.orcamento, 0, 1e8, null),
      fixasAuto: c.fixasAuto === true, fixasAviso: c.fixasAviso === true
    };
    s.listas = arr(o.listas).slice(0, 12).map(function (x) { return str(typeof x === 'string' ? x : (x && x.nome), 30); }).filter(Boolean);
    if (!s.listas.length) s.listas = ['Casa', 'Trabalho', 'Maria Alice'];
    s.tarefas = arr(o.tarefas).slice(0, 400).map(function (x) {
      return { id: id(x), lista: str(x.lista, 30) || s.listas[0], titulo: str(x.titulo, 120) || 'Tarefa', prio: PRIORIDADES.indexOf(x.prio) >= 0 ? x.prio : 'media', vence: U.dataValida(x.vence) ? x.vence : '', feita: !!x.feita, dono: donoOk(x.dono), repete: PS.rep.valido(x.repete), ate: U.dataValida(x.ate) ? x.ate : '', gerou: str(x.gerou, 40), base: U.dataValida(x.base) ? x.base : '', exemplo: !!x.exemplo };
    });
    s.compromissos = arr(o.compromissos).slice(0, 600).filter(function (x) { return U.dataValida(x.data); }).map(function (x) {
      return { id: id(x), titulo: str(x.titulo, 120) || 'Compromisso', data: x.data, hora: U.horaValida(x.hora) ? x.hora : '', local: str(x.local, 80), fonte: x.fonte === 'ics' ? 'ics' : 'manual', dono: donoOk(x.dono), exemplo: !!x.exemplo, repete: x.fonte === 'ics' ? '' : PS.rep.valido(x.repete), ate: U.dataValida(x.ate) ? x.ate : '' };
    });
    s.contas = arr(o.contas).slice(0, 80).map(function (x) {
      /* pagas[mês] = true (pago, sem data) ou 'AAAA-MM-DD' (data do pagamento, manual) */
      var pagas = {}; if (x.pagas && typeof x.pagas === 'object') Object.keys(x.pagas).slice(0, 48).forEach(function (k) { if (/^\d{4}-\d{2}$/.test(k) && x.pagas[k]) pagas[k] = (typeof x.pagas[k] === 'string' && U.dataValida(x.pagas[k])) ? x.pagas[k] : true; });
      var valores = {}; if (x.valores && typeof x.valores === 'object') Object.keys(x.valores).slice(0, 48).forEach(function (k) { var n = Number(x.valores[k]); if (/^\d{4}-\d{2}$/.test(k) && isFinite(n)) valores[k] = Math.min(1e9, Math.max(0, n)); });
      var v = (x.valor === '' || x.valor == null) ? null : num(x.valor, 0, 1e9, null);
      return { id: id(x), titulo: str(x.titulo, 80) || 'Conta', mensal: x.mensal !== false, dia: Math.round(num(x.dia, 1, 31, 1)), data: U.dataValida(x.data) ? x.data : '', valor: v, paga: !!x.paga, pagaEm: iso(x.pagaEm), pagas: pagas, valores: valores,
        desde: /^\d{4}-\d{2}$/.test(String(x.desde || '')) ? x.desde : '', cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'casa', dono: donoOk(x.dono), icone: PS.iconeFamiliaOk(x.icone) ? x.icone : '', exemplo: !!x.exemplo,
        anual: x.anual === true, mes: x.anual === true ? Math.round(num(x.mes, 1, 12, 1)) : 0, arquivada: x.arquivada === true, forma: FORMAS.indexOf(x.forma) >= 0 ? x.forma : '',
        obs: str(x.obs, 60), fixa: /^[a-z0-9-]{0,24}$/.test(String(x.fixa || '')) ? String(x.fixa || '') : '', cartaoRef: str(x.cartaoRef, 30) };
    });
    s.links = arr(o.links).slice(0, 40).filter(function (x) { return urlOk(x.url); }).map(function (x) {
      return { id: id(x), titulo: str(x.titulo, 40) || 'Link', url: x.url, icone: PS.iconesLista.indexOf(x.icone) >= 0 ? x.icone : 'globo', exemplo: !!x.exemplo };
    });
    s.foco = arr(o.foco).slice(0, 60).map(function (x) { return { id: id(x), texto: str(typeof x === 'string' ? x : x.texto, 140), exemplo: !!(x && x.exemplo) }; }).filter(function (x) { return x.texto; });
    s.cartoes = arr(o.cartoes).slice(0, 12).map(function (x) {
      return { id: id(x), diaFecha: Math.round(num(x.diaFecha, 0, 31, 0)), diaVenc: Math.round(num(x.diaVenc, 0, 31, 0)), apelido: str(x.apelido, 30) || 'Cartão', final: /^\d{4}$/.test(String(x.final || '')) ? String(x.final) : '', dono: donoOk(x.dono) || 'casal', exemplo: false };
    });
    s.faturas = arr(o.faturas).slice(0, 120).map(function (x) {
      var v = (x.valor === '' || x.valor == null) ? null : num(x.valor, -1e9, 1e9, null);
      return { id: id(x), cartao: str(x.cartao, 40), mes: /^\d{4}-\d{2}$/.test(String(x.mes || '')) ? x.mes : '', valor: v, fechamento: iso(x.fechamento), vencimento: iso(x.vencimento),
        status: STATUS_FAT.indexOf(x.status) >= 0 ? x.status : 'aberta', origem: x.origem === 'pdf' ? 'pdf' : 'manual', periodo: str(x.periodo, 40), parcelas: str(x.parcelas, 160), pagaEm: iso(x.pagaEm), dono: donoOk(x.dono), teste: !!x.teste, exemplo: false,
        /* extras lidos do PDF do Itaú (opcionais) */
        emissao: iso(x.emissao), proxFechamento: iso(x.proxFechamento), pagamentoMinimo: numOpc(x.pagamentoMinimo), totalAnterior: numOpc(x.totalAnterior), limiteTotal: numOpc(x.limiteTotal), limiteDisponivel: numOpc(x.limiteDisponivel),
        futuroProxima: numOpc(x.futuroProxima), futuroDemais: numOpc(x.futuroDemais), futuroTotal: numOpc(x.futuroTotal), futuras: futurasOk(x.futuras) };
    });
    s.lancs = arr(o.lancs).slice(0, 4000).map(function (x) {
      return { id: id(x), fatura: str(x.fatura, 40), data: iso(x.data), desc: str(x.desc, 80) || 'Lançamento', valor: num(x.valor, -1e9, 1e9, 0), pa: Math.round(num(x.pa, 0, 99, 0)), pt: Math.round(num(x.pt, 0, 99, 0)),
        cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'outros', dono: donoOk(x.dono), exemplo: false, catBanco: str(x.catBanco, 20), cidade: str(x.cidade, 30) };
    });
    s.regras = arr(o.regras).slice(0, 300).map(function (x) {
      return { id: id(x), termo: str(x.termo, 40).toLowerCase(), cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'outros', exemplo: false };
    }).filter(function (x) { return x.termo; });
    s.radios = arr(o.radios).slice(0, 24).filter(function (x) { return !x.url || /^https:\/\/[^\s]+$/i.test(x.url); }).map(function (x) {
      return { id: id(x), nome: str(x.nome, 30) || 'Rádio', url: /^https:\/\/[^\s]+$/i.test(x.url || '') && x.url.length <= 600 ? x.url : '', site: urlOk(x.site) ? x.site : '', cor: /^#[0-9a-fA-F]{6}$/.test(x.cor || '') ? x.cor : '#E20074', obs: str(x.obs, 100), exemplo: false };
    });
    s.passeios = arr(o.passeios).slice(0, 80).map(function (x) {
      return { id: id(x), nome: str(x.nome, 80) || 'Passeio', cat: str(x.cat, 20), cidade: str(x.cidade, 60), endereco: str(x.endereco, 120), lat: num(x.lat, -90, 90, null), lon: num(x.lon, -180, 180, null), obs: str(x.obs, 120), exemplo: false };
    });
    s.programa = arr(o.programa).slice(0, 200).map(function (x) {
      return { id: id(x), titulo: str(x.titulo, 100) || 'Passeio', data: iso(x.data), hora: U.horaValida(x.hora) ? x.hora : '', local: str(x.local, 120), mapa: urlOk(x.mapa) ? x.mapa : '', compromisso: str(x.compromisso, 40), exemplo: false };
    });
    s.compras = arr(o.compras).slice(0, 300).map(function (x) {
      return { id: id(x), nome: str(x.nome, 80) || 'Item', preco: x.preco == null || x.preco === '' ? null : num(x.preco, 0, 1e6, null), unidade: str(x.unidade, 20), local: str(x.local, 60), comprado: !!x.comprado, exemplo: false };
    });
    /* compras feitas (notas fiscais ou lançadas à mão). Valores vazios ficam null: nunca inventamos. */
    function vn(v) { return v == null || v === '' ? null : num(v, -1e6, 1e7, null); }
    s.notas = arr(o.notas).slice(0, 2000).map(function (x) {
      return { id: id(x), loja: str(x.loja, 80), data: iso(x.data), desconto: vn(x.desconto), total: vn(x.total), origem: x.origem === 'foto' ? 'foto' : 'mao',
        itens: arr(x.itens).slice(0, 80).filter(function (i) { return i && typeof i === 'object'; }).map(function (i) { return { nome: str(i.nome, 80), qtd: vn(i.qtd), unit: vn(i.unit), total: vn(i.total) }; }) };
    });
    /* lembretes, hábitos (rotina) e checks foram removidos do app: backups antigos importam e essas partes são descartadas */
    return s;
  }

  /* Migrações futuras: migracoes[N] converte do schema N para N+1 */
  var migracoes = { 1: function (o) { return o; }, 2: function (o) { return o; }, 3: function (o) { return o; } };   /* campos novos são opcionais; sanear() preenche */
  function migrar(o) {
    var v = (o && o.versao) || 1;
    while (v < VERSAO && migracoes[v]) { o = migracoes[v](o); v++; o.versao = v; }
    return o;
  }


  /* Migrações únicas de conteúdo: cada uma roda uma só vez por navegador (lista em localStorage 'painelsala.migracoes')
     e nunca recria um item que o usuário apagou depois. Idempotentes (conferem o id antes de inserir). */
  var MIGRACOES_UNICAS = [];   /* a do lembrete do Bilu saiu junto com os lembretes */
  function lerMigracoes() { try { var l = JSON.parse(localStorage.getItem(CHAVE_MIG) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function gravarMigracoes(l) { try { localStorage.setItem(CHAVE_MIG, JSON.stringify(l)); } catch (e) { /* ok */ } }
  function marcarTodasMigracoes() { gravarMigracoes(MIGRACOES_UNICAS.map(function (m) { return m.id; })); }
  function sincronizando() { try { return !!localStorage.getItem(CHAVE_SYNC); } catch (e) { return false; } }
  function aplicarMigracoesUnicas(s) {
    if (sincronizando()) return false;      /* com a nuvem ligada, o conteúdo vem da família; migração local criaria duplicatas */
    var feitas = lerMigracoes(), mudou = false;
    MIGRACOES_UNICAS.forEach(function (m) {
      if (feitas.indexOf(m.id) >= 0) return;
      try { if (m.aplicar(s)) mudou = true; } catch (e) { console.warn('migração falhou', m.id, e); return; }
      feitas.push(m.id);
    });
    gravarMigracoes(feitas);
    return mudou;
  }

  function persistir() {
    if (!semHook) hooksGravar.slice().forEach(function (f) { try { f(); } catch (e) { /* ok */ } });
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); return true; } catch (e) { PS.aviso && PS.aviso('Não foi possível salvar neste navegador'); return false; }
  }
  function notificar() { ouvintes.slice().forEach(function (f) { try { f(estado); } catch (e) { console.error(e); } }); }

  /* Converte a semente (dados.json, com "dias" relativos) em estado real */
  function semear(seed) {
    var hoje = U.hoje();
    var o = copia(seed);
    o.tarefas = arr(o.tarefas).map(function (t) { t.vence = t.dias == null ? '' : U.somaDias(hoje, t.dias); return t; });
    o.compromissos = arr(o.compromissos).map(function (c) { c.data = U.somaDias(hoje, c.dias || 0); return c; });
    o.contas = arr(o.contas).map(function (c) { var d = U.somaDias(hoje, c.diasAteVencer || 0); c.dia = +d.slice(8, 10); return c; });
    var s = sanear(o);
    var m0 = U.ym(hoje), d0 = +hoje.slice(8);
    s.contas.forEach(function (c) { if (c.mensal && c.exemplo && c.dia < d0) c.pagas[m0] = true; });       /* exemplos não nascem "atrasados" */
    return s;
  }

  var store = {
    VERSAO: VERSAO,
    iniciar: function (urlSemente) {
      var bruto = null;
      try { bruto = localStorage.getItem(CHAVE); } catch (e) { /* modo privado */ }
      if (bruto) {
        try { estado = sanear(migrar(JSON.parse(bruto))); if (aplicarMigracoesUnicas(estado) || (estado.versao !== VERSAO)) persistir(); return Promise.resolve(estado); } catch (e) { console.warn('Dados corrompidos; recriando', e); }
      }
      return fetch(urlSemente || 'dados.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
        .then(function (seed) { estado = semear(seed); marcarTodasMigracoes(); }, function () { estado = vazio(); })
        .then(function () { persistir(); return estado; });
    },
    get: function () { return estado; },
    /* Contas fixas sugeridas: carga automática ÚNICA na 1ª abertura com a lista de contas de casa vazia (ver PS.fin.fixasAuto).
       Não roda com a nuvem ligada (o conteúdo vem da família). */
    fixasAutoUmaVez: function (hoje) {
      if (!PS.fin || !estado || estado.config.fixasAuto || sincronizando()) return false;
      store.alterar(function (s) { PS.fin.fixasAuto(s, hoje, false); }, true); return true;
    },
    /* a sincronização grava itens recebidos sem disparar um novo envio */
    aplicarRemoto: function (fn) { semHook++; try { fn(estado); persistir(); } finally { semHook--; } notificar(); },
    aoGravar: function (f) { hooksGravar.push(f); },
    sanearItem: function (c, id, d) {
      if (c === 'checks' || c === 'lembretes' || c === 'habitos') return null;   /* aparelho antigo ainda pode mandar: aceita e ignora */
      if (c === 'meta') {
        if (id === 'config') { var cf = copia(estado.config); Object.keys(d || {}).forEach(function (k) { cf[k] = d[k]; }); return sanear({ config: cf }).config; }
        if (id === 'listas') return Array.isArray(d) ? sanear({ listas: d }).listas : null;
        return null;
      }
      if (!d || typeof d !== 'object') return null;
      var o = {}; o[c] = [d]; var r = sanear(o)[c];
      return r && r[0] ? r[0] : null;
    },
    CATS: CATS, DONOS: DONOS,
    /* altera e salva; quem chama pode passar silencioso=true para não re-renderizar */
    alterar: function (fn, silencioso) { fn(estado); persistir(); if (!silencioso) notificar(); },
    aoMudar: function (f) { ouvintes.push(f); return function () { ouvintes = ouvintes.filter(function (x) { return x !== f; }); }; },
    substituir: function (o) {
      estado = sanear(migrar(o));
      persistir(); notificar();
    },
    apagarTudo: function (urlSemente) {
      return fetch(urlSemente || 'dados.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
        .then(function (seed) { estado = semear(seed); marcarTodasMigracoes(); }, function () { estado = vazio(); })
        .then(function () { persistir(); notificar(); });
    },
    limparExemplos: function () {
      store.alterar(function (s) {
        ['tarefas', 'compromissos', 'contas', 'links', 'foco'].forEach(function (k) { s[k] = s[k].filter(function (x) { return !x.exemplo; }); });
      });
    },
    temExemplos: function () {
      var s = estado; return ['tarefas', 'compromissos', 'contas', 'links', 'foco'].some(function (k) { return s[k].some(function (x) { return x.exemplo; }); });
    },
    /* ---- backup JSON ---- */
    exportarJSON: function () { return JSON.stringify({ app: 'minha-casa-em-ordem', versao: VERSAO, exportadoEm: new Date().toISOString(), dados: estado }, null, 2); },
    lerBackup: function (texto) {
      var o = JSON.parse(texto);
      if (!o || typeof o !== 'object') throw new Error('Arquivo inválido');
      var d = o.dados || o;
      if (o.app && o.app !== 'minha-casa-em-ordem' && o.app !== 'painel-sala') throw new Error('Este arquivo não é do Minha Casa em Ordem');
      if ((o.versao || d.versao || 1) > VERSAO) throw new Error('Backup de uma versão mais nova do app');
      return d;
    },
    /* ---- link de configuração (#/importar/<base64url>) ---- */
    montarPayload: function () {
      var s = copia(estado);
      s.tarefas = s.tarefas.filter(function (t) { return !t.feita; });
      ['tarefas', 'compromissos', 'contas', 'links', 'foco'].forEach(function (k) {
        s[k] = s[k].map(function (x) { delete x.exemplo; delete x.id; if (k === 'tarefas') delete x.feita; if (k === 'compromissos' && x.fonte === 'manual') delete x.fonte; return x; });
      });
      s.contas.forEach(function (c) { if (c.valor === null) delete c.valor; if (!c.data) delete c.data; if (!c.paga) delete c.paga; ['forma', 'obs', 'fixa', 'cartaoRef', 'anual', 'mes', 'arquivada'].forEach(function (k) { if (!c[k]) delete c[k]; }); if (c.pagas && !Object.keys(c.pagas).length) delete c.pagas; });
      return s;
    },
    gerarLink: function () {
      var json = JSON.stringify(store.montarPayload());
      var b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      var base = location.href.split('#')[0];
      var link = base + '#/importar/' + b64;
      return { link: link, tamanho: link.length, jsonBytes: json.length };
    },
    lerLink: function (b64) {
      var t = b64.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '=';
      var o = JSON.parse(decodeURIComponent(escape(atob(t))));
      return o;
    },
    sanear: sanear
  };
  PS.store = store;
})(window);
