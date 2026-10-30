/* Bug 30/10: "Quais são as minhas três tarefas" exibiu <<SUGESTAO ...>> cru. node tools/teste-ajudante-bug.js  byGui */
var assert = require('assert'), C = require('../js/assistente-consultas.js');
var ok = 0, falhas = 0, H = '2026-10-30';
function t(n, f) { try { f(); ok++; } catch (e) { falhas++; console.log('  FALHOU ' + n + ' — ' + e.message); } }
var D = { tarefas: [
  { titulo: 'Baixa sem data', prio: 'baixa', feita: false },
  { titulo: 'Media 05/11', prio: 'media', feita: false, vence: '2026-11-05' },
  { titulo: 'Alta 10/11', prio: 'alta', feita: false, vence: '2026-11-10' },
  { titulo: 'Alta 01/11', prio: 'alta', feita: false, vence: '2026-11-01' },
  { titulo: 'Feita', prio: 'alta', feita: true },
  { titulo: 'Exemplo', prio: 'alta', feita: false, exemplo: true } ],
  abertas: [{ titulo: 'Luz', data: '2026-10-28', valor: 215.37, dias: -2 }, { titulo: 'Internet', data: '2026-11-01', valor: 120, dias: 2 }, { titulo: 'IPTU', data: '2026-11-20', valor: 300, dias: 21 }],
  compromissos: [{ titulo: 'Dentista', data: '2026-10-31', hora: '09:30' }, { titulo: 'Escola', data: '2026-10-30', hora: '18:00' }] };
function tipo(q) { var c = C.classificar(q, H); return c && c.tipo; }
['Quais são as minhas três tarefas', 'quais tarefas', 'minhas tarefas', 'O que tenho pra fazer?', 'o que eu tenho para fazer', 'me mostra 2 tarefas', 'lista de afazeres', 'tem alguma tarefa pendente?'].forEach(function (q) {
  t('tarefas: ' + q, function () { assert.strictEqual(tipo(q), 'tarefas'); }); });
t('número por extenso', function () { assert.strictEqual(C.classificar('Quais são as minhas três tarefas', H).n, 3); });
t('número em dígito', function () { assert.strictEqual(C.classificar('me mostra 2 tarefas', H).n, 2); });
t('lista ordenada por prioridade e data, sem feita/exemplo, limitada a n', function () {
  var r = C.responder(C.classificar('Quais são as minhas três tarefas', H), D);
  assert.deepStrictEqual(r.itens.map(function (x) { return x.titulo; }), ['Alta 01/11', 'Alta 10/11', 'Media 05/11']);
  assert.ok(/3 de 4/.test(r.texto), r.texto); assert.ok(!/<<|SUGEST|\{/.test(r.texto)); });
t('sem n: todas as 4', function () { assert.strictEqual(C.responder(C.classificar('minhas tarefas', H), D).itens.length, 4); });
['crie uma tarefa comprar pão', 'anota a tarefa pagar escola', 'me lembra de fazer a tarefa X amanhã', 'adicionar tarefa lavar carro', 'marca dentista amanhã às 10h', 'agenda uma reunião sexta', 'lembra de pagar a luz'].forEach(function (q) {
  t('criar não é consulta: ' + q, function () { assert.strictEqual(C.classificar(q, H), null); assert.ok(C.pedeCriar(q)); }); });
['Quais são as minhas três tarefas', 'o que vence essa semana', 'tenho conta atrasada?', 'tem algo marcado amanhã', 'o que tem na minha agenda hoje', 'quais lembretes tenho'].forEach(function (q) { t('não pede criar: ' + q, function () { assert.ok(!C.pedeCriar(q)); }); });
/* contas/agenda livres */
[['Oi tudo bem Eu tenho alguma conta atrasada hoje', 'atrasadas'], ['quais contas estão vencidas', 'atrasadas'], ['o que vence essa semana?', 'vencimentos'], ['quais contas vencem esta semana', 'vencimentos'],
 ['tenho algo amanhã?', 'agenda'], ['o que tem na minha agenda hoje', 'agenda'], ['compromissos da semana', 'agenda'], ['quais contas tenho pra pagar', 'abertas'], ['quanto falta pagar?', 'abertas']].forEach(function (c) {
  t('livre: ' + c[0], function () { assert.strictEqual(tipo(c[0]), c[1]); }); });
t('abertas lista contas a pagar', function () { var r = C.responder(C.classificar('quais contas tenho pra pagar', H), D); assert.strictEqual(r.itens.length, 3); assert.ok(/Luz/.test(r.texto)); });
/* parser tolerante + nunca exibir marcador */
var CRU = '<<SUGESTAO {"tipo":"tarefa","titulo":"Solicitar comprovante de escola (Trabalho)","data":"06/11"}, >> <<SUGESTAO {"tipo":"tarefa","titulo":"Pai - piso da Laje (Casa)","data":"30/10"}>>.';
t('remove marcadores malformados', function () { var r = C.extrairSugestoes(CRU); assert.strictEqual(r.texto, ''); assert.strictEqual(r.sugestoes.length, 2); assert.strictEqual(r.sugestoes[0].titulo, 'Solicitar comprovante de escola (Trabalho)'); });
t('marcador sem fechar', function () { var r = C.extrairSugestoes('Ok. <<SUGESTAO {"tipo":"tarefa","titulo":"X"'); assert.strictEqual(r.texto, 'Ok.'); });
t('variações SUGESTÃO/ espaços / minúsculas', function () { var r = C.extrairSugestoes('Feito << sugestão {"tipo":"tarefa","titulo":"A"} >>'); assert.strictEqual(r.texto, 'Feito'); assert.strictEqual(r.sugestoes.length, 1); });
t('JSON solto e <<FIM>> removidos', function () { var r = C.extrairSugestoes('Certo {"tipo":"tarefa","titulo":"B"} <<FIM>>'); assert.strictEqual(r.texto, 'Certo'); });
t('texto normal intacto', function () { assert.strictEqual(C.extrairSugestoes('Você tem 2 contas.').texto, 'Você tem 2 contas.'); });
t('fallback', function () { assert.strictEqual(C.textoFinal('', null), 'Não entendi, pode reformular?'); assert.strictEqual(C.textoFinal('  ', 'lista'), 'lista'); assert.strictEqual(C.textoFinal('oi', 'lista'), 'oi'); });
console.log(ok + ' ok, ' + falhas + ' falhas'); process.exit(falhas ? 1 : 0);
