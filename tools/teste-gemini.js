/* testes do js/ajudante-gemini.js (ferramentas locais do Gemini). node tools/teste-gemini.js */
var G = require('../js/ajudante-gemini.js');
var ok = 0, f = 0; function t(n, c) { if (c) ok++; else { f++; console.log('  FALHA ' + n); } }
var H = '2026-10-30';
var d = { compromissos: [{ titulo: 'Dentista', data: '2026-10-31', hora: '09:00' }, { titulo: 'Reunião', data: '2026-10-30', hora: '08:00' }, { titulo: 'Exemplo', data: '2026-10-31', exemplo: true }, { titulo: 'Festa', data: '2026-11-08' }],
  tarefas: [{ titulo: 'Pintar', prio: 'baixa' }, { titulo: 'Filtro', prio: 'alta', vence: '2026-10-29' }, { titulo: 'Feita', prio: 'alta', feita: true }, { titulo: 'Ex', exemplo: true }, { titulo: 'Mercado', prio: 'media', vence: '2026-11-03' }],
  abertas: [{ titulo: 'Luz', valor: 120, data: '2026-10-31', dias: 1 }, { titulo: 'Água', valor: 80, data: '2026-10-28', dias: -2 }, { titulo: 'X', valor: 1, data: '2026-10-28', dias: -2, exemplo: true }],
  pagas: [{ titulo: 'Net', valor: 99.9, data: '2026-10-10', pagaEm: '2026-10-09' }] };
var r = G.executar('buscar_agenda', { de: H, ate: '2026-11-06' }, d, H); t('agenda semana: 2 sem exemplo', r.total === 2 && r.itens[0].titulo === 'Reunião');
r = G.executar('proximo_evento', {}, d, H, '10:00'); t('próximo após 10h = Dentista', r.evento.titulo === 'Dentista' && r.evento.dia === 'sáb, 31/10');
r = G.executar('proximo_evento', {}, d, H, '07:00'); t('próximo às 7h = Reunião', r.evento.titulo === 'Reunião');
r = G.executar('proximo_evento', {}, { compromissos: [] }, H); t('sem evento', r.encontrado === false);
r = G.executar('listar_tarefas', { filtro: 'pendentes', limite: 3 }, d, H); t('3 tarefas, alta primeiro, sem feita/exemplo', r.total === 3 && r.itens[0].titulo === 'Filtro' && r.itens.length === 3);
r = G.executar('listar_tarefas', { filtro: 'atrasadas' }, d, H); t('atrasadas', r.total === 1);
r = G.executar('listar_tarefas', { filtro: 'semana' }, d, H); t('semana', r.total === 2);
r = G.executar('listar_tarefas', { filtro: 'concluidas' }, d, H); t('concluidas', r.total === 1);
r = G.executar('listar_contas', { status: 'atrasadas' }, d, H); t('conta atrasada Água sem exemplo', r.total === 1 && r.itens[0].titulo === 'Água' && /atrasada há 2/.test(r.itens[0].situacao) && r.soma === 'R$ 80,00');
r = G.executar('listar_contas', { status: 'abertas', de: H, ate: '2026-11-06' }, d, H); t('contas semana', r.total === 1 && r.itens[0].valor === 'R$ 120,00');
r = G.executar('listar_contas', { status: 'pagas' }, d, H); t('pagas', r.itens[0].situacao === 'paga em 09/10');
t('ferramenta desconhecida', !!G.executar('apagar_tudo', {}, d, H).erro);
var s = G.sugestao({ tipo: 'tarefa', titulo: 'Comprar pão' }, ['Quais minhas tarefas?'], H); t('sugestão sem pedido: recusa', !!s.erro && !s.sugestao);
s = G.sugestao({ tipo: 'tarefa', titulo: 'Comprar pão', prioridade: 'alta' }, ['cria uma tarefa comprar pão'], H); t('sugestão com pedido', s.sugestao.tipo === 'tarefa' && s.sugestao.prio === 'alta');
s = G.sugestao({ tipo: 'compromisso', titulo: 'Médico' }, ['marca médico'], H); t('compromisso sem data: pede', !!s.erro);
s = G.sugestao({ tipo: 'conta', titulo: 'IPVA', data: '2026-11-10', valor: 1500 }, ['anota a conta do IPVA'], H); t('conta', s.sugestao.vence === '2026-11-10' && s.sugestao.valor === 1500);
s = G.sugestao({ tipo: 'tarefa', titulo: 'x', data: '2026-01-01' }, ['cria tarefa'], H); t('data passada', !!s.erro);
s = G.sugestao({ tipo: 'compras', titulo: 'Mercado', itens: ['leite', 'pão'] }, ['adiciona leite e pão na lista de compras'], H); t('compras vai para a Lista de compras com os itens', s.sugestao.tipo === 'compras' && s.sugestao.itens.join() === 'leite,pão');
var res = [G.executar('listar_contas', { status: 'atrasadas' }, d, H)], p = G.permitido(res, H);
t('fiel: cita Água R$ 80,00 28/10', G.finalizar('Sim, a Água de R$ 80,00 venceu em 28/10.', p).fiel);
t('infiel: valor inventado', !G.finalizar('A Água de R$ 95,00 venceu em 28/10.', p).fiel);
t('infiel: data inventada', !G.finalizar('Vence em 15/11.', p).fiel);
t('limpa marcador', G.finalizar('Ok <<SUGESTAO tipo=tarefa>>', p).texto.indexOf('<<') < 0);
t('memória validada conta como fonte', G.finalizar('Amanhã: Futebol às 09:00.', G.permitido([{ r: 'model', t: 'Amanhã você tem Futebol, às 09:00' }], H)).fiel);
t('valor da sugestão em R$', G.finalizar('Preparei a conta do gás de R$ 120,00 para 15/11.', G.permitido([{ tipo: 'conta', titulo: 'Gás', vence: '2026-11-15', valor: 120 }], H)).fiel);
t('atrasadas ignora de/ate=hoje', G.executar('listar_contas', { status: 'atrasadas', de: H, ate: H }, d, H).total === 1);
t('valor em texto', G.finalizar('Gás de R$ 120,00.', G.permitido([{ valor: '120' }], H)).fiel);
t('data com ano 15/11/2026', G.finalizar('Conta para 15/11/2026.', G.permitido([{ vence: '2026-11-15' }], H)).fiel);
var m = []; for (var i = 0; i < 15; i++) { m.push({ papel: 'user', texto: 'q' + i }); m.push({ papel: 'assistant', texto: 'r' + i }); }
var mm = G.memoria(m); t('memória: 10 trocas', mm.length === 20 && mm[0].t === 'q5' && mm[19].r === 'model');
var rv = G.reserva('Tem conta atrasada?', d, H, 'atingiu o limite'); t('reserva com aviso e dados', /atingiu o limite/.test(rv) && /Água/.test(rv));
t('reserva sem entender', /Por enquanto/.test(G.reserva('qual a capital da França', d, H)));
console.log(ok + ' ok, ' + f + ' falhas'); if (f) process.exit(1);
