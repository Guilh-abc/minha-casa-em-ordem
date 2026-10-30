/* Bateria de perguntas informais PT-BR contra /conversa (wrangler dev). node tools/bateria-gemini.js [URL]  byGui
   Reproduz o laço do app (js/assistente.js): ferramentas locais, memória, anti-invenção e reserva. */
var G = require('../js/ajudante-gemini.js'), C = require('../js/assistente-consultas.js');
var URL = (process.argv[2] || 'http://127.0.0.1:8799') + '/conversa', HJ = '2026-10-30', AGORA = '10:00';
var HOJE_TXT = 'sexta-feira, 30/10/2026 (2026-10-30); amanhã é sábado, 31/10/2026 (2026-10-31). Agora são 10:00.';
var D = {
  abertas: [
    { titulo: 'Água', valor: 87.4, data: '2026-10-27', dias: -3 }, { titulo: 'Luz', valor: 215.37, data: '2026-10-30', dias: 0 },
    { titulo: 'Internet', valor: 119.9, data: '2026-11-03', dias: 4 }, { titulo: 'Escola', valor: 1450, data: '2026-11-05', dias: 6 },
    { titulo: 'Condomínio', valor: 780, data: '2026-11-10', dias: 11 }, { titulo: 'Conta exemplo', valor: 1, data: '2026-10-29', dias: -1, exemplo: true }],
  pagas: [{ titulo: 'Aluguel', valor: 2500, data: '2026-10-05', pagaEm: '2026-10-04' }],
  compromissos: [
    { titulo: 'Reunião da escola', data: '2026-10-30', hora: '08:00' }, { titulo: 'Dentista da Ana', data: '2026-10-30', hora: '15:30', local: 'Clínica Sorriso' },
    { titulo: 'Futebol do Pedro', data: '2026-10-31', hora: '09:00' }, { titulo: 'Aniversário da vó', data: '2026-11-02' },
    { titulo: 'Médico', data: '2026-11-12', hora: '14:00' }, { titulo: 'Evento exemplo', data: '2026-10-31', exemplo: true }],
  tarefas: [
    { titulo: 'Trocar filtro da geladeira', prio: 'alta', vence: '2026-10-28', lista: 'Casa' }, { titulo: 'Comprar ração', prio: 'alta', vence: '2026-10-30', lista: 'Casa' },
    { titulo: 'Renovar seguro do carro', prio: 'media', vence: '2026-11-04', lista: 'Carro' }, { titulo: 'Pintar o portão', prio: 'baixa', lista: 'Casa' },
    { titulo: 'Levar roupa na costureira', prio: 'media', lista: 'Casa' }, { titulo: 'Pagar IPTU', prio: 'alta', feita: true, lista: 'Casa' },
    { titulo: 'Tarefa exemplo', prio: 'alta', exemplo: true }]
};
/* [pergunta, regex que DEVE aparecer, regex que NÃO pode aparecer, extra] ; extra: 'sug:tipo' | 'nosug' | 'cont' (continua a conversa anterior) */
var B0 = [
  ['Oi tudo bem eu tenho alguma conta atrasada hoje', /Água/, /Escola|exemplo/i],
  ['Quais são as minhas três tarefas', /filtro[\s\S]*ração[\s\S]*seguro|filtro[\s\S]*ração/i, /exemplo|IPTU/i],
  ['Qual o meu próximo evento na agenda', /Dentista/, /exemplo|Reunião da escola/i],
  ['pronto o quê', /./, /<<|SUGESTAO/, 'cont'],
  ['tem conta atrasada?', /Água/, /exemplo/i],
  ['quanto eu devo de conta atrasada', /87,40/, null],
  ['o que vence essa semana', /Luz[\s\S]*Internet[\s\S]*Escola|Escola/, /Condomínio/],
  ['quais contas vencem hj', /Luz/, /Água.*hoje|Internet/],
  ['quanto vai dar a escola', /1\.?450/, null],
  ['qnd vence a internet', /03\/11|3 de novembro|terça/i, null],
  ['qual a conta mais cara em aberto', /Escola/, null],
  ['ja paguei o aluguel?', /pag|sim/i, null],
  ['quanto eu tenho pra pagar esse mes', /R\$/, null],
  ['tem algum boleto vencendo amanha', /não|nenhum|nada/i, /Luz.*amanhã/i],
  ['quais as contas do mes que vem', /Condomínio|Internet|Escola/, null],
  ['qual o valor da conta de luz', /215,37/, null],
  ['a agua ta atrasada ha quantos dias', /3/, null],
  ['oq tenho na agenda hj', /Reunião|Dentista/, /Futebol/],
  ['e amanhã?', /Futebol/, /Dentista/, 'cont'],
  ['tenho compromisso amanha', /Futebol/, null],
  ['que horas é o dentista', /15:30|15h30/, null],
  ['onde é o dentista', /Sorriso/, null],
  ['qnd é o aniversario da vo', /02\/11|2 de novembro|segunda/i, null],
  ['tenho medico essa semana?', /não|12\/11|próxim/i, null],
  ['minha agenda da semana', /Futebol|Aniversário/, /Médico/],
  ['tem algo marcado dia 12', /Médico/, null],
  ['qual meu compromisso depois do dentista', /Futebol/, null],
  ['quais sao minhas tarefas', /filtro/i, /exemplo/i],
  ['tarefas de prioridade alta', /filtro|ração/i, /portão|IPTU/i],
  ['tem tarefa atrasada', /filtro/i, /portão/i],
  ['o que eu tenho q fazer hj', /ração/i, null],
  ['quantas tarefas eu tenho', /5|cinco/i, null],
  ['quais tarefas ja terminei', /IPTU/, null],
  ['tarefas do carro', /seguro/i, /portão/i],
  ['qual a tarefa mais urgente', /filtro|ração/i, null],
  ['me lembra de comprar pão amanhã', /./, null, 'sug:tarefa'],
  ['cria uma tarefa trocar lâmpada da sala prioridade alta', /./, null, 'sug:tarefa'],
  ['marca dentista dia 20/11 as 10h', /./, null, 'sug:compromisso'],
  ['anota a conta do gás de 120 reais pra dia 15/11', /./, null, 'sug:conta'],
  ['adiciona leite ovos e café na lista de compras', /./, null, 'sug:tarefa'],
  ['quais minhas tarefas pra hoje', /ração/i, null, 'nosug'],
  ['tem conta atrazada', /Água/, null],
  ['quais minhs tarefsa', /filtro|ração/i, null],
  ['proximo compromiso', /Dentista/, null],
  ['oque venc essa semna', /Luz|Internet|Escola/, null],
  ['qto ta a cont de luz', /215,37/, null],
  ['agnda de amanha', /Futebol/, null],
  ['bom dia! como ta minha semana?', /./, /exemplo/i],
  ['tenho alguma coisa urgente?', /Água|filtro|ração|Luz/i, null],
  ['qual a capital da frança', /./, /R\$/],
  ['valeu!', /./, /<</],
  ['resume minha sexta pra mim', /Luz|Dentista|ração/i, /exemplo/i],
  ['e as contas?', /Luz|Água/, null, 'cont']
];
var B = process.env.SO ? B0.filter(function(b,k){return process.env.SO.split(",").indexOf(String(k+1))>=0;}) : B0;
function rodar(texto, memo) {
  var turnos = memo.concat([{ r: 'user', t: texto }]), res = [], sug = null, rod = 0, chamadas = [];
  var pedidos = [texto].concat(memo.filter(function (m) { return m.r === 'user'; }).slice(-1).map(function (m) { return m.t; }));
  function passo() {
    rod++;
    return fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8787' }, body: JSON.stringify({ turnos: turnos, hoje: HOJE_TXT }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        if (j.chamadas && rod < 5) {
          var fr = j.chamadas.map(function (c) { chamadas.push(c.n + JSON.stringify(c.a)); var r2;
            if (c.n === 'criar_sugestao') { var o = G.sugestao(c.a, pedidos, HJ); if (o.sugestao) sug = o.sugestao; r2 = o.resultado || { erro: o.erro }; } else r2 = G.executar(c.n, c.a, D, HJ, AGORA);
            res.push(r2); return { n: c.n, res: r2 }; });
          turnos.push({ r: 'model', fc: j.chamadas }); turnos.push({ r: 'tool', fr: fr }); return passo();
        }
        if (j.resposta) { var f = G.finalizar(j.resposta, G.permitido(res.concat(sug ? [sug] : [], memo), HJ));
          if (!f.fiel) console.log('   BRUTO: ' + j.resposta.replace(/\n/g,' / '));
          return { texto: f.fiel ? f.texto : G.reserva(texto, D, HJ, 'citou algo fora dos dados'), fiel: f.fiel, bruto: j.resposta, sug: sug, chamadas: chamadas, modelo: j.modelo }; }
        return { texto: G.reserva(texto, D, HJ, j.erro ? (/limite/i.test(j.erro) ? 'atingiu o limite gratuito agora' : 'está indisponível agora') : 'não respondeu'), fiel: true, erro: j.erro || 'sem resposta', sug: null, chamadas: chamadas };
      });
  }
  return passo();
}
var memo = [], ok = 0, linhas = [], i = 0;
function prox() {
  if (i >= B.length) {
    console.log('\nRESULTADO: ' + ok + '/' + B.length + ' acertos');
    require('fs').writeFileSync('/workspace/bateria-gemini.md', '# Bateria Gemini (' + new Date().toISOString() + ')\n\n**' + ok + '/' + B.length + ' acertos**\n\n| # | Pergunta | Modelo | OK | Ferramentas | Resposta |\n|---|---|---|---|---|---|\n' + linhas.join('\n') + '\n');
    return;
  }
  var b = B[i], q = b[0], extra = b[3] || '';
  if (extra !== 'cont') memo = memo.slice(-4); /* mantém um pouco de memória, como no app */
  var t0 = Date.now();
  rodar(q, memo).then(function (r) {
    var txt = r.texto, a = b[1].test(txt) && !(b[2] && b[2].test(txt)) && txt.indexOf('<<') < 0;
    if (/^sug:/.test(extra)) a = !!r.sug && r.sug.tipo === extra.slice(4);
    if (extra === 'nosug') a = a && !r.sug;
    if (r.erro) a = false;
    if (!r.fiel) a = false;   /* resposta descartada pela anti-invenção conta como erro do modelo */
    if (a) ok++;
    memo = memo.concat([{ r: 'user', t: q }, { r: 'model', t: txt }]).slice(-20);
    var lin = '| ' + (i + 1) + ' | ' + q + ' | ' + (r.modelo || '-') + ' | ' + (a ? '✅' : '❌') + (r.fiel ? '' : ' (anti-invenção)') + (r.erro ? ' ERRO ' + r.erro : '') + ' | ' + r.chamadas.join('; ').replace(/\|/g, '/') + ' | ' + (txt + (r.sug ? ' [card: ' + JSON.stringify(r.sug) + ']' : '')).replace(/\n/g, ' ⏎ ').replace(/\|/g, '/').slice(0, 400) + ' |';
    linhas.push(lin); console.log((a ? 'OK ' : 'XX ') + (i + 1) + ' ' + q + ' (' + (Date.now() - t0) + 'ms, ' + (r.modelo || '-') + ') -> ' + txt.replace(/\n/g, ' ⏎ ').slice(0, 160));
    i++; setTimeout(prox, +process.env.PAUSA || 7000);
  }).catch(function (e) { linhas.push('| ' + (i + 1) + ' | ' + q + ' | ❌ ' + e.message + ' | | |'); console.log('XX ' + (i + 1) + ' ' + e.message); i++; setTimeout(prox, 1000); });
}
prox();
