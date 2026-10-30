/* Testes da leitura por câmera/print (parsers e normalização), Node puro:  node tools/teste-leitura.js */
'use strict';
var assert = require('assert');
var L = require('../js/leitura.js');
var ok = 0, falhas = 0;
function t(nome, fn) { try { fn(); ok++; console.log('  ok   ' + nome); } catch (e) { falhas++; console.log('  FALHOU ' + nome + ' — ' + e.message); } }
var BOLETO = '34191.79001 10104.351001 47910.201509 2 16260000021537';
var ARREC = '83600000002 3 15370055000 4 00000000000 0 00000111111 1';

/* valores R$ */
t('valor: R$ com milhar e centavos', function () { assert.strictEqual(L.valorBR('R$ 1.215,37'), 1215.37); });
t('valor: só vírgula', function () { assert.strictEqual(L.valorBR('215,37'), 215.37); });
t('valor: ponto decimal', function () { assert.strictEqual(L.valorBR('215.37'), 215.37); });
t('valor: número passa', function () { assert.strictEqual(L.valorBR(99.9), 99.9); });
t('valor: milhar com ponto sem centavos', function () { assert.strictEqual(L.valorBR('R$ 2.500'), 2500); });
t('valor: lixo vira null', function () { assert.strictEqual(L.valorBR('abc'), null); assert.strictEqual(L.valorBR(''), null); assert.strictEqual(L.valorBR(-5), null); });

/* datas BR */
t('data: dd/mm/aaaa', function () { assert.strictEqual(L.dataBR('10/11/2026'), '2026-11-10'); });
t('data: dd/mm/aa', function () { assert.strictEqual(L.dataBR('04/11/26'), '2026-11-04'); });
t('data: ISO passa', function () { assert.strictEqual(L.dataBR('2026-11-10'), '2026-11-10'); });
t('data: dd.mm.aaaa e dd-mm-aaaa', function () { assert.strictEqual(L.dataBR('01.12.2026'), '2026-12-01'); assert.strictEqual(L.dataBR('01-12-2026'), '2026-12-01'); });
t('data: inválida vira vazio', function () { assert.strictEqual(L.dataBR('31/02/2026'), ''); assert.strictEqual(L.dataBR('AAAA-MM-DD'), ''); assert.strictEqual(L.dataBR(null), ''); });

/* linha digitável */
t('boleto bancário válido: valor e vencimento', function () {
  var r = L.linhaDigitavel(BOLETO); assert.strictEqual(r.ok, true); assert.strictEqual(r.tipo, 'bancario'); assert.strictEqual(r.valor, 215.37); assert.strictEqual(r.vencimento, '2026-11-10');
});
t('boleto bancário: DV de campo errado reprova', function () { assert.strictEqual(L.linhaDigitavel(BOLETO.replace('79001', '79002')).ok, false); });
t('boleto bancário: DV geral errado reprova', function () { assert.strictEqual(L.linhaDigitavel(BOLETO.replace(' 2 1626', ' 3 1626')).ok, false); });
t('boleto: tamanho errado reprova', function () { assert.strictEqual(L.linhaDigitavel('123').ok, false); });
t('arrecadação (concessionária) válida', function () { var r = L.linhaDigitavel(ARREC); assert.strictEqual(r.ok, true); assert.strictEqual(r.tipo, 'arrecadacao'); assert.strictEqual(r.valor, 215.37); });
t('arrecadação: DV de bloco errado reprova', function () { assert.strictEqual(L.linhaDigitavel(ARREC.replace('15370055000 4', '15370055000 5')).ok, false); });

/* normalização por tipo */
var HOJE = '2026-10-30';
t('boleto -> conta avulsa, valor da linha prevalece se divergir', function () {
  var s = L.normalizar({ tipo: 'boleto', beneficiario: 'Enel SP', valor: 'R$ 215,00', vencimento: '10/11/2026', linha_digitavel: BOLETO }, HOJE);
  assert.strictEqual(s.length, 1); var x = s[0];
  assert.strictEqual(x.acao, 'conta'); assert.strictEqual(x.dados.titulo, 'Enel SP'); assert.strictEqual(x.dados.valor, 215.37); assert.strictEqual(x.dados.data, '2026-11-10');
  assert.ok(/linha/i.test(x.avisos.join(' ')));
});
t('boleto com linha inválida avisa e não inventa valor', function () {
  var s = L.normalizar({ tipo: 'boleto', beneficiario: 'X', valor: '10,00', vencimento: '10/11/2026', linha_digitavel: '123' }, HOJE);
  assert.strictEqual(s[0].dados.valor, 10); assert.ok(/não confere/i.test(s[0].avisos.join(' ')));
});
t('acordo -> N parcelas mensais a partir da próxima', function () {
  var s = L.normalizar({ tipo: 'acordo', beneficiario: 'Sabesp', parcelas: 6, parcela_atual: 1, valor_parcela: '128,94', primeiro_vencimento: '04/11/2026', dia: 1 }, HOJE);
  assert.strictEqual(s.length, 6); assert.strictEqual(s[0].dados.titulo, 'Sabesp (parcela 1/6)'); assert.strictEqual(s[0].dados.data, '2026-11-04'); assert.strictEqual(s[1].dados.data, '2026-12-04'); assert.strictEqual(s[5].dados.data, '2027-04-04');
});
t('compromisso: convite com data e hora', function () {
  var s = L.normalizar({ tipo: 'compromisso', titulo: 'Aniversário da Ana', data: '15/11/2026', hora: '16h30', local: 'Buffet X' }, HOJE);
  assert.strictEqual(s[0].acao, 'compromisso'); assert.strictEqual(s[0].dados.hora, '16:30'); assert.strictEqual(s[0].dados.data, '2026-11-15');
});
t('compromisso sem data vira lembrete sem data', function () {
  var s = L.normalizar({ tipo: 'compromisso', titulo: 'Levar autorização assinada' }, HOJE);
  assert.strictEqual(s[0].acao, 'lembrete'); assert.strictEqual(s[0].dados.dia, 0);
});
t('lista -> uma tarefa por item, sem vazios nem repetidos', function () {
  var s = L.normalizar({ tipo: 'lista', itens: ['Leite', ' leite ', '', 'Pão'] }, HOJE);
  assert.deepStrictEqual(s.map(function (x) { return x.dados.titulo; }), ['Leite', 'Pão']); assert.strictEqual(s[0].acao, 'tarefa');
});
t('cupom -> gasto pago com categoria válida', function () {
  var s = L.normalizar({ tipo: 'cupom', estabelecimento: 'Supermercado Dia', total: '87,40', data: '29/10/2026', categoria: 'mercado' }, HOJE);
  assert.strictEqual(s[0].acao, 'gasto'); assert.strictEqual(s[0].dados.valor, 87.4); assert.strictEqual(s[0].dados.cat, 'mercado'); assert.strictEqual(s[0].dados.paga, true);
});
t('cupom com categoria desconhecida vira outros', function () { assert.strictEqual(L.normalizar({ tipo: 'cupom', estabelecimento: 'Y', total: '5', data: '29/10/2026', categoria: 'xyz' }, HOJE)[0].dados.cat, 'outros'); });
t('tipo desconhecido não gera sugestão', function () { assert.deepStrictEqual(L.normalizar({ tipo: 'foto_de_gato' }, HOJE), []); });

/* anti-invenção: só campos que vieram da imagem */
function nada(o) { var r = L.normalizar(o, HOJE, ABERTAS0); return r.length === 1 && r[0].acao === 'nada' && r[0].avisos.length > 0; }
var ABERTAS0 = [{ tipo: 'conta', id: 'a', chave: '2026-11', titulo: 'Luz (Enel)', data: '2026-11-04', valor: 1 }];
t('boleto sem vencimento legível não vira conta (não inventa data)', function () { assert.ok(nada({ tipo: 'boleto', beneficiario: 'Enel', valor: '10,00', vencimento: '' })); });
t('boleto sem beneficiário não inventa título', function () { assert.ok(nada({ tipo: 'boleto', beneficiario: '', valor: '10,00', vencimento: '10/11/2026' })); });
t('boleto: linha com DV falho nunca é gravada', function () { var r = L.normalizar({ tipo: 'boleto', beneficiario: 'Enel', valor: '215,37', vencimento: '10/11/2026', linha_digitavel: '34191.79001 10104.351001 47910.201509 2 162600000215' }, HOJE); assert.strictEqual(r[0].dados.linha, ''); });
t('comprovante sem data de pagamento não marca', function () { assert.ok(nada({ tipo: 'comprovante', beneficiario: 'Enel', valor: '1,00', data_pagamento: '' })); });
t('acordo sem credor não inventa', function () { assert.ok(nada({ tipo: 'acordo', beneficiario: '', parcelas: 2, valor_parcela: '1,00', primeiro_vencimento: '04/11/2026' })); });
t('compromisso sem título não inventa', function () { assert.ok(nada({ tipo: 'compromisso', titulo: '', data: '15/11/2026' })); });
t('cupom sem total ou sem data não vira gasto', function () { assert.ok(nada({ tipo: 'cupom', estabelecimento: 'X', total: '', data: '29/10/2026' })); assert.ok(nada({ tipo: 'cupom', estabelecimento: 'X', total: '5,00', data: '' })); });

t('acordo aceita "credor" lido da imagem como nome', function () { var r = L.normalizar({ tipo: 'acordo', credor: 'Sabesp', parcelas: 2, valor_parcela: '1,00', primeiro_vencimento: '04/11/2026' }, HOJE); assert.strictEqual(r[0].dados.titulo, 'Sabesp (parcela 1/2)'); });

t('placeholder do modelo copiado literalmente ("(credor)") não vira nome', function () { assert.ok(nada({ tipo: 'acordo', beneficiario: '(credor)', parcelas: 2, valor_parcela: '1,00', primeiro_vencimento: '04/11/2026' })); });

/* comprovante: casar com conta em aberto */
var ABERTAS = [
  { tipo: 'conta', id: 'a', chave: '2026-11', titulo: 'Luz (Enel)', data: '2026-11-04', valor: 215.37 },
  { tipo: 'conta', id: 'b', chave: '2026-11', titulo: 'Internet', data: '2026-11-10', valor: 120 },
  { tipo: 'conta', id: 'c', chave: '2026-10', titulo: 'Água Sabesp', data: '2026-10-20', valor: 215.37 }
];
t('comprovante casa por valor + nome', function () { var m = L.casarComprovante(ABERTAS, { valor: 215.37, beneficiario: 'ENEL DISTRIBUICAO SP', data: '2026-10-30' }); assert.strictEqual(m.id, 'a'); });
t('comprovante casa por valor + data mais próxima quando nome não ajuda', function () { var m = L.casarComprovante(ABERTAS, { valor: 120, beneficiario: 'Vivo', data: '2026-10-30' }); assert.strictEqual(m.id, 'b'); });
t('comprovante sem valor igual não casa', function () { assert.strictEqual(L.casarComprovante(ABERTAS, { valor: 999, beneficiario: 'Enel', data: '2026-10-30' }), null); });
t('comprovante: normalizar marca paga só se casar', function () {
  var s = L.normalizar({ tipo: 'comprovante', beneficiario: 'Enel', valor: '215,37', data_pagamento: '30/10/2026' }, HOJE, ABERTAS);
  assert.strictEqual(s[0].acao, 'pagar'); assert.strictEqual(s[0].dados.id, 'a'); assert.strictEqual(s[0].dados.pagaEm, '2026-10-30');
  var n = L.normalizar({ tipo: 'comprovante', beneficiario: 'Fulano', valor: '1,00', data_pagamento: '30/10/2026' }, HOJE, ABERTAS);
  assert.strictEqual(n[0].acao, 'nada'); assert.ok(/não encontrei/i.test(n[0].avisos.join(' ')));
});

console.log('\n' + ok + ' ok, ' + falhas + ' falhas'); process.exitCode = falhas ? 1 : 0;
