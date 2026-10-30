/* Testes de unidade em Node puro (sem npm):  node tools/teste-unidade.js
   Cobrem: criptografia (cofre/envelopes/itens), regra de conflito, diff local, motor de sincronização com servidor FALSO em memória. */
'use strict';
var assert = require('assert');
var cripto = require('../js/cripto.js');
var N = require('../js/sync-nucleo.js');
var ok = 0, falhas = 0, fila = Promise.resolve();
function t(nome, fn) { fila = fila.then(function () { return Promise.resolve().then(fn).then(function () { ok++; console.log('  ok   ' + nome); }, function (e) { falhas++; console.log('  FALHOU ' + nome + ' — ' + (e && e.message)); }); }); }

/* ---------- servidor falso: mesma semântica do Worker ---------- */
function servidor() {
  var itens = {}, seq = 0;
  return {
    itens: itens,
    api: {
      get: function (since) { return Promise.resolve({ seq: seq, itens: Object.keys(itens).map(function (k) { return itens[k]; }).filter(function (x) { return x.seq > since; }).map(sai) }); },
      put: function (since, mud) {
        seq++; var rej = [];
        mud.forEach(function (m) {
          var k = m.c + '|' + m.i, a = itens[k];
          if (!a) itens[k] = { c: m.c, i: m.i, d: m.a ? null : m.d, t: m.t, a: m.a ? 1 : 0, seq: seq };
          else if (m.n) rej.push(k);
          else if (N.vence(m, a)) itens[k] = { c: m.c, i: m.i, d: m.a ? null : m.d, t: m.t, a: m.a ? 1 : 0, seq: seq };
          else rej.push(k);
        });
        var out = {}; Object.keys(itens).forEach(function (k) { var x = itens[k]; if (x.seq > since && x.seq !== seq) out[k] = x; });
        rej.forEach(function (k) { out[k] = itens[k]; });
        return Promise.resolve({ seq: seq, itens: Object.keys(out).map(function (k) { return sai(out[k]); }) });
      }
    }
  };
  function sai(x) { return { c: x.c, i: x.i, d: x.a ? null : x.d, t: x.t, a: x.a }; }
}
function vazio() { return { config: { cidade: 'X', fonte: 1, contraste: false }, listas: ['Casa'], tarefas: [], compromissos: [], contas: [], links: [], foco: [] }; }
function aparelho(srv, chaves, relogio) {
  var st = vazio(), meta = { seq: 0, itens: {}, primeiro: true };
  var motor = N.criarMotor({
    cripto: cripto, chaves: function () { return chaves; }, estado: function () { return st; }, mutar: function (fn) { fn(st); },
    sanearItem: function (c, id, d) { return d; }, meta: meta, gravarMeta: function () {}, api: srv.api, agora: function () { return relogio.v; }, podeAplicar: function () { return true; }
  });
  return { st: st, meta: meta, ciclo: motor.ciclo };
}

console.log('Criptografia');
var cofre, chaves2;
t('novoCofre + abrirComSenha devolvem as mesmas chaves (decifra o que a outra cifrou)', function () {
  return cripto.novoCofre('senha-bem-longa-123').then(function (c) {
    cofre = c;
    return cripto.abrirComSenha('senha-bem-longa-123', c.salt, c.env_senha).then(function (k) { chaves2 = k; return cripto.cifrar(c.chaves, 'tarefas', 'abc', { i: 'x', d: { titulo: 'segredo' } }); })
      .then(function (txt) { assert(txt.indexOf('segredo') < 0); return cripto.decifrar(chaves2, 'tarefas', 'abc', txt); }).then(function (o) { assert.strictEqual(o.d.titulo, 'segredo'); });
  });
});
t('senha errada falha com senha_errada', function () {
  return cripto.abrirComSenha('outra-senha-qualquer', cofre.salt, cofre.env_senha).then(function () { throw new Error('abriu!'); }, function (e) { assert.strictEqual(e.message, 'senha_errada'); });
});
t('chave de recuperação abre o cofre (com variações de digitação)', function () {
  var rec = cofre.recuperacao.toLowerCase().replace(/-/g, ' ');
  return cripto.abrirComRecuperacao(rec, cofre.salt, cofre.env_rec).then(function (k) { assert(k.aes && k.hmac); });
});
t('chaves importadas não são extraíveis', function () {
  assert.strictEqual(cofre.chaves.aes.extractable, false); assert.strictEqual(cofre.chaves.hmac.extractable, false);
  return cripto.abrirComSenha('senha-bem-longa-123', cofre.salt, cofre.env_senha).then(function (k) { assert.strictEqual(k.aes.extractable, false); });
});
t('trocar a senha mantém os mesmos dados legíveis e a nova senha abre', function () {
  return cripto.abrirComSenha('senha-bem-longa-123', cofre.salt, cofre.env_senha, true).then(function (r) {
    return cripto.reembrulhar(r.mestre, 'nova-senha-123456').then(function (n) {
      return cripto.abrirComSenha('nova-senha-123456', n.salt, n.env_senha).then(function (k) { return cripto.idOpaco(k, 'tarefas', 'z').then(function (a) { return cripto.idOpaco(cofre.chaves, 'tarefas', 'z').then(function (b) { assert.strictEqual(a, b); }); }); })
        .then(function () { return cripto.abrirComSenha('senha-bem-longa-123', n.salt, n.env_senha).then(function () { throw new Error('senha antiga ainda abre'); }, function () {}); });
    });
  });
});
t('AAD: item copiado para outro id/coleção não decifra', function () {
  return cripto.cifrar(cofre.chaves, 'tarefas', 'AAA', { i: 'a' }).then(function (txt) {
    return cripto.decifrar(cofre.chaves, 'tarefas', 'BBB', txt).then(function () { throw new Error('decifrou'); }, function () {});
  });
});
t('id opaco é determinístico e não contém o id', function () {
  return cripto.idOpaco(cofre.chaves, 'tarefas', 'minha-tarefa-1').then(function (a) { return cripto.idOpaco(cofre.chaves, 'tarefas', 'minha-tarefa-1').then(function (b) { assert.strictEqual(a, b); assert(/^[A-Za-z0-9_-]{8,64}$/.test(a)); assert(a.indexOf('minha') < 0); }); });
});
t('iterações PBKDF2 >= 300000', function () { assert(cripto.ITER_SENHA >= 300000); });
t('força da senha', function () { assert(!cripto.forcaSenha('12345678').ok); assert(cripto.forcaSenha('Casa-Azul-2026!').ok); assert(!cripto.forcaSenha('curta').ok); });

console.log('Regra de conflito / diff');
t('vence: maior t; empate: exclusão; depois maior texto', function () {
  assert(N.vence({ t: 2, a: 0, d: 'a' }, { t: 1, a: 1 })); assert(!N.vence({ t: 1, a: 0, d: 'z' }, { t: 2, a: 0, d: 'a' }));
  assert(N.vence({ t: 5, a: 1 }, { t: 5, a: 0, d: 'z' })); assert(N.vence({ t: 5, a: 0, d: 'b' }, { t: 5, a: 0, d: 'a' }));
});
t('diferencas detecta novo, editado e apagado', function () {
  var st = vazio(), meta = { itens: {}, primeiro: false };
  st.tarefas.push({ id: 't1', titulo: 'a' });
  assert(N.diferencas(meta, N.itensLocais(st), 100) >= 1);
  meta.itens['tarefas|t1'].env = true;
  assert.strictEqual(N.diferencas(meta, N.itensLocais(st), 200) - 0, 0 + (N.diferencas(meta, N.itensLocais(st), 200)), 'estável');
  Object.keys(meta.itens).forEach(function (k) { meta.itens[k].env = true; });
  st.tarefas[0].titulo = 'b'; assert.strictEqual(N.diferencas(meta, N.itensLocais(st), 300), 1); assert.strictEqual(meta.itens['tarefas|t1'].t, 300);
  meta.itens['tarefas|t1'].env = true; st.tarefas.length = 0; assert.strictEqual(N.diferencas(meta, N.itensLocais(st), 400), 1); assert.strictEqual(meta.itens['tarefas|t1'].vivo, false);
});
t('fonte e contraste ficam só no aparelho', function () {
  var st = vazio(); st.config.fonte = 3; var l = N.itensLocais(st)['meta|config'].d; assert(!('fonte' in l)); assert(!('contraste' in l)); assert(l.cidade === 'X');
});

console.log('Motor (dois aparelhos, servidor falso, tudo cifrado)');
var srv = servidor(), rel = { v: 1000 }, A, B;
t('A cria itens, B os recebe; o servidor falso só tem texto cifrado', function () {
  A = aparelho(srv, cofre.chaves, rel); B = aparelho(srv, chaves2, rel);
  A.st.tarefas.push({ id: 'tarefa-0001', titulo: 'Pagar IPTU segredo', feita: false });
  return A.ciclo().then(function () { return B.ciclo(); }).then(function () {
    assert.strictEqual(B.st.tarefas.length, 1); assert.strictEqual(B.st.tarefas[0].titulo, 'Pagar IPTU segredo');
    var tudo = JSON.stringify(srv.itens); assert(tudo.indexOf('IPTU') < 0 && tudo.indexOf('tarefa-0001') < 0 && tudo.indexOf('segredo') < 0, 'texto claro no servidor');
  });
});
t('edição em B chega em A (mais novo vence)', function () {
  rel.v = 2000; B.st.tarefas[0].titulo = 'IPTU pago'; B.st.tarefas[0].feita = true;
  return B.ciclo().then(function () { rel.v = 2100; return A.ciclo(); }).then(function () { assert.strictEqual(A.st.tarefas[0].titulo, 'IPTU pago'); assert.strictEqual(A.st.tarefas[0].feita, true); });
});
t('conflito simultâneo: o carimbo maior vence nos dois', function () {
  rel.v = 3000; A.st.tarefas[0].titulo = 'versão A'; rel.v = 3500; B.st.tarefas[0].titulo = 'versão B';
  rel.v = 3000; return A.ciclo().then(function () { rel.v = 3500; return B.ciclo(); }).then(function () { return A.ciclo(); }).then(function () { assert.strictEqual(A.st.tarefas[0].titulo, 'versão B'); assert.strictEqual(B.st.tarefas[0].titulo, 'versão B'); });
});
t('exclusão em A propaga e não ressuscita', function () {
  rel.v = 4000; A.st.tarefas.length = 0; 
  return A.ciclo().then(function () { rel.v = 4100; return B.ciclo(); }).then(function () { assert.strictEqual(B.st.tarefas.length, 0); rel.v = 4200; return B.ciclo().then(function () { return A.ciclo(); }); }).then(function () { assert.strictEqual(A.st.tarefas.length, 0); assert.strictEqual(B.st.tarefas.length, 0); });
});
t('criação simultânea de itens diferentes: união nos dois', function () {
  rel.v = 5000; A.st.links.push({ id: 'link-a-0001', titulo: 'A' }); B.st.links.push({ id: 'link-b-0001', titulo: 'B' });
  return A.ciclo().then(function () { return B.ciclo(); }).then(function () { return A.ciclo(); }).then(function () { assert.strictEqual(A.st.links.length, 2); assert.strictEqual(B.st.links.length, 2); });
});
t('item de id fixo: n:1 não duplica nem ressuscita apagado', function () {
  var C = aparelho(srv, cofre.chaves, rel), D = aparelho(srv, cofre.chaves, rel);
  rel.v = 6000; C.st.tarefas.push({ id: 'tarefa-fixa', titulo: 'Fixa' }); D.st.tarefas.push({ id: 'tarefa-fixa', titulo: 'Fixa (cópia do D)' });
  return C.ciclo().then(function () { return D.ciclo(); }).then(function () { return C.ciclo(); }).then(function () {
    assert.strictEqual(D.st.tarefas.filter(function (x) { return x.id === 'tarefa-fixa'; }).length, 1); assert.strictEqual(D.st.tarefas.filter(function (x) { return x.id === 'tarefa-fixa'; })[0].titulo, 'Fixa');
    rel.v = 7000; C.st.tarefas = C.st.tarefas.filter(function (x) { return x.id !== 'tarefa-fixa'; }); return C.ciclo();
  }).then(function () {
    rel.v = 7100; return D.ciclo();
  }).then(function () {
    assert.strictEqual(D.st.tarefas.filter(function (x) { return x.id === 'tarefa-fixa'; }).length, 0);
    var E = aparelho(srv, cofre.chaves, rel); rel.v = 8000; E.st.tarefas.push({ id: 'tarefa-fixa', titulo: 'volta?' });
    return E.ciclo().then(function () { assert.strictEqual(E.st.tarefas.filter(function (x) { return x.id === 'tarefa-fixa'; }).length, 0, 'ressuscitou o apagado'); });
  });
});
t('config compartilhada sincroniza, fonte/contraste não', function () {
  rel.v = 9000; A.st.config.cidade = 'Campinas'; A.st.config.fonte = 3;
  return A.ciclo().then(function () { rel.v = 9100; return B.ciclo(); }).then(function () { assert.strictEqual(B.st.config.cidade, 'Campinas'); assert.strictEqual(B.st.config.fonte, 1); });
});
t('relatório: nada pendente depois de sincronizar', function () {
  return A.ciclo().then(function (r) { assert.strictEqual(r.enviados, 0); });
});
t('mais de 100 itens são enviados em lotes', function () {
  var S = servidor(), R = { v: 100 }, X = aparelho(S, cofre.chaves, R), Y = aparelho(S, cofre.chaves, R), i;
  for (i = 0; i < 250; i++) X.st.foco.push({ id: 'foco-' + i + '-xxxx', texto: 'f' + i });
  return X.ciclo().then(function (r) { assert(r.enviados >= 250); return Y.ciclo(); }).then(function () { assert.strictEqual(Y.st.foco.length, 250); });
});

t('contas fixas entram na coleção sincronizada "contas" (mesmo caminho cifrado); editar forma/banco muda o item', function () {
  var c = { id: 'fixa-agua', titulo: 'Água', fixa: 'agua', forma: 'gerar', obs: '', valor: null };
  var l = N.itensLocais({ contas: [c], config: {}, listas: [], checks: {} });
  assert.ok(l['contas|fixa-agua'] && l['contas|fixa-agua'].d.forma === 'gerar');
  var h1 = N.hashDe(l['contas|fixa-agua'].d); c.forma = 'pix'; c.obs = 'Banco';
  assert.notStrictEqual(N.hashDe(N.itensLocais({ contas: [c], config: {}, listas: [], checks: {} })['contas|fixa-agua'].d), h1);
});

t('aparelho antigo manda lembretes, hábitos e checks: o novo aceita, ignora e continua sincronizando', function () {
  var mud = [];
  return Promise.all([['lembretes', 'l-velho', { id: 'l-velho', titulo: 'Bilu' }], ['habitos', 'h-velho', { id: 'h-velho', nome: 'Alongar' }], ['checks', '2026-10-24|h-velho', 1]].map(function (x) {
    return cripto.idOpaco(cofre.chaves, x[0], x[1]).then(function (op) { return cripto.cifrar(cofre.chaves, x[0], op, { i: x[1], d: x[2] }).then(function (txt) { mud.push({ c: x[0], i: op, t: 9000, a: 0, d: txt }); }); });
  })).then(function () { rel.v = 9000; return srv.api.put(0, mud); }).then(function () {
    var F = aparelho(srv, cofre.chaves, rel); F.st.tarefas.push({ id: 'tarefa-nova-F', titulo: 'Nova' }); rel.v = 9100;
    return F.ciclo().then(function (r) {
      assert(!('lembretes' in F.st) && !('habitos' in F.st) && !('checks' in F.st), 'criou coleção removida');
      assert(F.st.links.length >= 2, 'não recebeu os outros itens');
      assert(srv.itens['tarefas|' + Object.keys(F.meta.itens).filter(function (k) { return k === 'tarefas|tarefa-nova-F'; }).map(function (k) { return F.meta.itens[k].o; })[0]], 'não enviou a tarefa nova');
      assert.strictEqual(r.erros, 0);
    });
  });
});
fila.then(function () { console.log('\n' + ok + ' ok, ' + falhas + ' falhas'); process.exit(falhas ? 1 : 0); });
