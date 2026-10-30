/* Testes do Ajudante (consultas puras). node tools/teste-assistente.js  byGui */
var C = require('../js/assistente-consultas.js');
var ok = 0, falhas = 0;
function t(nome, cond) { if (cond) ok++; else { falhas++; console.log('  FALHA ' + nome); } }
var SEX = '2026-10-30', DOM = '2026-11-01', SEG = '2026-11-02';

/* essa semana = de hoje até domingo da semana corrente (segunda a domingo) */
var q = C.classificar('O que vence essa semana?', SEX);
t('semana sexta: fim domingo', q.tipo === 'vencimentos' && q.ini === SEX && q.fim === DOM);
t('semana sexta: rótulo', /30\/10 a 01\/11/.test(q.rotulo));
q = C.classificar('O que vence essa semana?', DOM);
t('semana domingo: só o domingo', q.fim === DOM);
q = C.classificar('O que vence essa semana?', SEG);
t('semana segunda: até 08/11', q.fim === '2026-11-08');
q = C.classificar('o que tenho na agenda essa semana', SEX);
t('agenda semana: até domingo', q.tipo === 'agenda' && q.fim === DOM);

var d = { abertas: [
  { id: 'a', titulo: 'Luz', valor: 120, data: '2026-10-31', dias: 1 },
  { id: 'b', titulo: 'Escola', valor: 900, data: '2026-11-02', dias: 3 },
  { id: 'c', titulo: 'Água', valor: 80, data: '2026-10-28', dias: -2 }],
  compromissos: [{ titulo: 'Aniversário Ana', data: '2026-11-22' }, { titulo: 'Dentista', data: '2026-10-31', hora: '09:00' }],
  tarefas: [{ titulo: 'Trocar filtro', prio: 'alta' }, { titulo: 'Pintar', prio: 'baixa' }, { titulo: 'Feita', prio: 'alta', feita: true }] };
var r = C.responder(C.classificar('O que vence essa semana?', SEX), d);
t('vence semana: só Luz', r.itens.length === 1 && r.itens[0].titulo === 'Luz');
r = C.responder(C.classificar('O que tenho na agenda amanhã?', SEX), d);
t('agenda amanhã: só Dentista, sem 22/11', r.itens.length === 1 && !/22\/11/.test(r.texto));
r = C.responder(C.classificar('Tem conta atrasada?', SEX), d);
t('atrasadas: Água', r.itens.length === 1 && /Água/.test(r.texto));
q = C.classificar('Quais tarefas tenho pendentes?', SEX);
r = q && C.responder(q, d);
t('quais tarefas: 2 pendentes', r && r.itens.length === 2);

/* limpar: tira repetição e reticências */
t('limpar reticências finais', C.limpar('Você tem 2 contas.......') === 'Você tem 2 contas.');
t('limpar …', C.limpar('Ok… … … …') === 'Ok.');
t('limpar linhas repetidas', C.limpar('- Luz\n- Luz\n- Luz\n- Água') === '- Luz\n- Água');
t('limpar frase em laço', C.limpar('Tudo certo. Tudo certo. Tudo certo. Tudo certo.') === 'Tudo certo.');
t('limpar think', C.limpar('<think>x</think>Oi') === 'Oi');
t('limpar mantém texto normal', C.limpar('Vence sex, 31/10: Luz.') === 'Vence sex, 31/10: Luz.');
/* próximo evento: respondido direto da agenda */
['Qual o próximo evento?', 'qual meu proximo compromisso', 'Próximo evento', 'o que tenho de próximo na agenda'].forEach(function (x) {
  t('próximo: ' + x, (C.classificar(x, SEX) || {}).tipo === 'proximo');
});
var ag = { compromissos: [{ titulo: 'Passado', data: '2026-10-29' }, { titulo: 'Aniversário Ana', data: '2026-11-22' }, { titulo: 'Dentista', data: '2026-10-31', hora: '09:00' }, { titulo: 'Exemplo', data: '2026-10-30', exemplo: true }] };
r = C.responder(C.classificar('Qual o próximo evento?', SEX), ag);
t('próximo = Dentista sáb 31/10 09:00', r.itens.length === 1 && r.itens[0].titulo === 'Dentista' && /Dentista/.test(r.texto) && /31\/10/.test(r.texto) && /09:00/.test(r.texto) && !/Ana/.test(r.texto));
r = C.responder(C.classificar('Qual o próximo evento?', SEX), { compromissos: [{ titulo: 'Passado', data: '2026-10-01' }] });
t('sem próximo evento', r.itens.length === 0 && /Não encontrei compromisso/.test(r.texto));
t('local: próximo nunca vai ao modelo', C.soLocal(C.classificar('Qual o próximo evento?', SEX)) === true && C.soLocal(C.classificar('O que vence essa semana?', SEX)) === false);
/* sugestões só quando pedem para criar; resposta vazia não vira "Pronto." */
t('pede criar', C.pedeCriar('cria uma tarefa pagar luz') && C.pedeCriar('agenda dentista amanhã às 9') && C.pedeCriar('adicione a conta de água'));
t('não pede criar', !C.pedeCriar('pronto o quê') && !C.pedeCriar('Qual o próximo evento?') && !C.pedeCriar('Por onde começo hoje?'));
var so = '<<SUGESTAO {"tipo":"compromisso","titulo":"Dentista","data":"2026-10-31"}>>\n\n<<SUGESTAO {"tipo":"tarefa","titulo":"x"}>>';
t('só sugestões sem pedido => vazio', C.textoFinal(so, 'pronto o quê') === '');
t('texto + sugestão sem pedido => só o texto', C.textoFinal('Comece pela luz. <<SUGESTAO {"tipo":"tarefa","titulo":"Pagar luz"}>>', 'por onde começo') === 'Comece pela luz.');
t('pedido de criar mantém o bloco', /SUGESTAO/.test(C.textoFinal('Ok. <<SUGESTAO {"tipo":"tarefa","titulo":"Pagar luz"}>>', 'cria tarefa pagar luz')));
t('sobra curta => vazio', C.textoFinal('<<SUGESTAO {"tipo":"tarefa","titulo":"a"}>> e .', 'pronto o quê') === '');
t('mensagem de vazio não é Pronto', /Não entendi/.test(C.SEM_RESPOSTA) && !/^Pronto/.test(C.SEM_RESPOSTA));
/* parser tolerante de <<SUGESTAO>> */
var r = C.lerSugestoes('Pronto, veja: <<SUGESTAO {"tipo":"tarefa","titulo":"Vacinar Maria Alice até 07/11"}, data: "2026-11-07">>', SEX);
t('malformado: data fora das chaves é lida', r.sugestoes.length === 1 && r.sugestoes[0].tipo === 'tarefa' && r.sugestoes[0].titulo === 'Vacinar Maria Alice até 07/11' && r.sugestoes[0].data === '2026-11-07');
t('malformado: marcador nunca aparece', !/SUGEST|<<|>>|\{|\}/.test(r.texto) && /Pronto, veja/.test(r.texto));
r = C.lerSugestoes('<<SUGESTAO {"tipo":"tarefa","titulo":"Pagar luz","data":"2026-11-10"}>> <<SUGESTAO {"tipo":"compromisso","titulo":"Dentista","data":"12/11/2026","hora":"10:00"}>>', SEX);
t('várias sugestões, data DD/MM/AAAA aceita', r.sugestoes.length === 2 && r.sugestoes[1].tipo === 'compromisso' && r.sugestoes[1].data === '2026-11-12' && r.sugestoes[1].hora === '10:00' && r.texto === '');
r = C.lerSugestoes('Ok <<SUGESTAO tipo=tarefa titulo="Comprar ração"', SEX);
t('sem fechamento e sem chaves', r.sugestoes.length === 1 && r.sugestoes[0].titulo === 'Comprar ração' && !/SUGEST|<</.test(r.texto));
r = C.lerSugestoes('Vamos lá <<SUGESTAO {lixo total}>>', SEX);
t('ilegível: some sem deixar lixo', r.sugestoes.length === 0 && r.texto === 'Vamos lá');
r = C.lerSugestoes('<<SUGESTÃO {\'tipo\': \'conta\', \'titulo\': \'Luz\', \'valor\': \'187,45\', \'vence\': \'15/11\'}>>', SEX);
t('aspas simples e valor BR em conta', r.sugestoes.length === 1 && r.sugestoes[0].tipo === 'conta' && r.sugestoes[0].valor === 187.45 && r.sugestoes[0].vence === '2026-11-15');
/* fidelidade: título tem que vir do pedido */
t('título vindo do pedido é aceito', C.sugestaoFiel({ titulo: 'Vacinar Maria Alice' }, 'crie uma tarefa vacinar a Maria Alice até 07/11'));
t('título inventado é recusado', !C.sugestaoFiel({ titulo: 'Vacinar Maria Alice' }, 'crie uma tarefa'));
t('"Crie uma tarefa" sem detalhes => abrir formulário', C.pedidoVazio('Crie uma tarefa') === 'tarefa' && C.pedidoVazio('nova tarefa') === 'tarefa' && C.pedidoVazio('crie um compromisso') === 'compromisso');
t('pedido com detalhe não é vazio', C.pedidoVazio('crie uma tarefa pagar a luz') === '' && C.pedidoVazio('o que vence essa semana') === '');
console.log(ok + ' ok, ' + falhas + ' falhas'); process.exit(falhas ? 1 : 0);
