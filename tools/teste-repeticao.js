/* Testes de repetição (agenda e tarefas). node tools/teste-repeticao.js  byGui */
var R = require('../js/repeticao.js');
var ok = 0, falhas = 0;
function t(nome, cond) { if (cond) ok++; else { falhas++; console.log('  FALHA ' + nome); } }
t('opções', JSON.stringify(R.OPCOES.map(function (o) { return o[1]; })) === JSON.stringify(['Não repete', 'Diária', 'Semanal', 'Mensal', 'Anual']));
t('valida', R.valido('anual') === 'anual' && R.valido('xx') === '' && R.valido(undefined) === '');
t('diária', R.proxima('2026-10-31', 'diaria') === '2026-11-01');
t('semanal', R.proxima('2026-10-30', 'semanal') === '2026-11-06');
t('mensal', R.proxima('2026-10-30', 'mensal') === '2026-11-30');
t('mensal dia 31 em mês curto', R.proxima('2026-01-31', 'mensal') === '2026-02-28');
t('mensal mantém o dia original', R.proxima('2026-02-28', 'mensal', '2026-01-31') === '2026-03-31');
t('anual', R.proxima('2026-11-22', 'anual') === '2027-11-22');
t('anual 29/02', R.proxima('2028-02-29', 'anual') === '2029-02-28');
t('não repete', R.proxima('2026-10-30', '') === '');
var aniv = { id: 'a', titulo: 'Aniversario victor', data: '2020-03-15', repete: 'anual' };
var o = R.ocorrencias(aniv, '2026-01-01', '2027-12-31');
t('anual desde 2020 aparece em 2026 e 2027', JSON.stringify(o) === '["2026-03-15","2027-03-15"]');
t('semanal com Até', JSON.stringify(R.ocorrencias({ data: '2026-10-01', repete: 'semanal', ate: '2026-10-20' }, '2026-10-10', '2026-12-31')) === '["2026-10-15"]');
t('sem repetir: só a data', JSON.stringify(R.ocorrencias({ data: '2026-10-31' }, '2026-10-01', '2026-11-30')) === '["2026-10-31"]');
t('sem repetir fora da janela', R.ocorrencias({ data: '2026-12-31' }, '2026-10-01', '2026-11-30').length === 0);
t('diária limitada', R.ocorrencias({ data: '2020-01-01', repete: 'diaria' }, '2026-10-30', '2026-11-05').length === 7);
var ex = R.expandir([aniv, { id: 'b', titulo: 'Dentista', data: '2026-10-31', hora: '09:00' }], '2026-10-30', '2027-03-31');
t('expandir: cópias com a data da ocorrência', ex.length === 2 && ex.some(function (c) { return c.titulo === 'Aniversario victor' && c.data === '2027-03-15' && c.origem === 'a'; }));
t('expandir não altera o original', aniv.data === '2020-03-15');
/* tarefas: concluir cria a próxima */
var L = [{ id: 't1', titulo: 'Regar plantas', vence: '2026-10-30', repete: 'semanal', feita: false, lista: 'Casa', prio: 'media' }];
var T1 = L[0], n = 0, novo = R.concluirTarefa(L, T1, '2026-10-30', function () { return 'n' + (++n); });
t('concluir cria a próxima', L.length === 2 && T1.feita === true && novo.vence === '2026-11-06' && novo.feita === false && novo.repete === 'semanal' && novo.titulo === 'Regar plantas' && novo.id === 'n1');
t('próxima no topo da lista', L[0] === novo && T1.gerou === 'n1');
T1.feita = false; R.concluirTarefa(L, T1, '2026-10-30', function () { return 'n' + (++n); });
t('reabrir e concluir de novo não duplica', L.length === 2);
var L2 = [{ id: 'x', titulo: 'Sem data', vence: '', repete: 'diaria', feita: false }];
t('sem prazo usa hoje', R.concluirTarefa(L2, L2[0], '2026-10-30', function () { return 'y'; }).vence === '2026-10-31');
var L3 = [{ id: 'z', titulo: 'Fim', vence: '2026-10-30', repete: 'mensal', ate: '2026-11-15', feita: false }];
t('Até impede a próxima', R.concluirTarefa(L3, L3[0], '2026-10-30', function () { return 'w'; }) === null && L3.length === 1 && L3[0].feita);
var L4 = [{ id: 'q', titulo: 'Única', vence: '2026-10-30', feita: false }];
t('sem repetir só conclui', R.concluirTarefa(L4, L4[0], '2026-10-30', function () { return 'v'; }) === null && L4.length === 1 && L4[0].feita);
console.log(ok + ' ok, ' + falhas + ' falhas'); process.exit(falhas ? 1 : 0);
