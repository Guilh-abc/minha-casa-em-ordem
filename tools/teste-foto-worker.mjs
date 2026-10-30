/* Rota /foto do assistente-worker. node tools/teste-foto-worker.mjs  byGui */
import W, { montarFoto, lerFoto, lerNota, MODELO_FOTO } from '../assistente-worker/worker.js';
var ok = 0, f = 0; function t(n, c) { if (c) ok++; else { f++; console.log('  FALHA ' + n); } }
var IMG = 'data:image/jpeg;base64,' + 'A'.repeat(400);
var o = montarFoto({ imagem: IMG, hoje: '30/10/2026' });
t('modelo de visão', o.model === 'lfm3-vl-2b' && MODELO_FOTO === 'lfm3-vl-2b');
t('sem raciocínio', o.chat_template_kwargs.enable_thinking === false);
t('imagem vai como image_url', o.messages[1].content.some(function (p) { return p.type === 'image_url' && p.image_url.url === IMG; }));
t('pede DD/MM', /DD\/MM\/AAAA/.test(JSON.stringify(o.messages)));
t('sem top_p', !('top_p' in o));
t('rejeita não-imagem', montarFoto({ imagem: 'data:text/html;base64,AAAA' }) === null && montarFoto({}) === null);
var r = lerFoto('```json\n{"destino":"compras","nome":"Coxa","preco":"R$ 9,39","local":"Atacadão"}\n```');
t('lê JSON em cerca', r && r.destino === 'compras' && r.preco === 'R$ 9,39');
t('lê texto inválido => null', lerFoto('não sei') === null);
t('lê descarta chaves estranhas', !('x' in (lerFoto('{"destino":"tarefa","titulo":"a","x":1}') || { x: 1 })));
/* rota: sem log da imagem e chamada única */
var chamadas = 0, enviado = null, logs = 0;
var cl = console.log, ce = console.error; console.log = console.error = function () { logs++; };
globalThis.fetch = async function (u, init) { chamadas++; enviado = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: '{"destino":"compras","nome":"Coxa e sobrecoxa","preco":"R$ 9,39","local":"Atacadão"}' } }] }), { status: 200 }); };
var req = new Request('https://x/foto', { method: 'POST', headers: { Origin: 'https://guilhermeromio-netto-prog.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify({ imagem: IMG, hoje: '30/10/2026' }) });
var res = await W.fetch(req, { LIQUID_API_KEY: 'k' });
var j = await res.json();
console.log = cl; console.error = ce;
t('rota 200', res.status === 200 && j.campos && j.campos.nome === 'Coxa e sobrecoxa');
t('uma chamada só', chamadas === 1 && enviado.model === 'lfm3-vl-2b');
t('nada logado', logs === 0);
t('não devolve a imagem', JSON.stringify(j).indexOf('AAAA') < 0);
t('no-store', res.headers.get('Cache-Control') === 'no-store');
var grande = new Request('https://x/foto', { method: 'POST', headers: { Origin: 'https://guilhermeromio-netto-prog.github.io' }, body: JSON.stringify({ imagem: 'data:image/jpeg;base64,' + 'A'.repeat(3e6) }) });
t('foto grande demais 413', (await W.fetch(grande, { LIQUID_API_KEY: 'k' })).status === 413);
/* modo nota fiscal */
var on = montarFoto({ imagem: IMG, hoje: '30/10/2026', modo: 'nota' });
t('nota: prompt próprio com loja, itens e total', /nota fiscal|cupom/i.test(on.messages[0].content) && /"itens"/.test(on.messages[0].content) && /desconto/.test(on.messages[0].content) && on.max_tokens >= 800 && !('top_p' in on));
t('modo comum continua igual', !/"itens"/.test(montarFoto({ imagem: IMG }).messages[0].content));
var n = lerNota('```json\n{"loja":"Atacadão","data":"28/10","itens":[{"nome":"Arroz 5kg","qtd":"2","unit":"R$ 22,90","total":"R$ 45,80"},{"nome":"Leite","qtd":1,"unit":"4,99","total":"4,99"}],"desconto":"R$ 1,00","total":"R$ 49,79","x":"lixo"}\n```');
t('lerNota: campos e itens', n && n.loja === 'Atacadão' && n.data === '28/10' && n.itens.length === 2 && n.itens[0].nome === 'Arroz 5kg' && n.itens[0].total === 'R$ 45,80' && n.total === 'R$ 49,79' && n.desconto === 'R$ 1,00' && !('x' in n));
t('lerNota: itens não-lista viram []', lerNota('{"loja":"A","itens":"x"}').itens.length === 0);
t('lerNota: lixo => null', lerNota('sem json') === null);
var muitos = { loja: 'L', itens: [] }; for (var k = 0; k < 120; k++) muitos.itens.push({ nome: 'i' + k, total: '1,00' });
t('lerNota: no máximo 80 itens', lerNota(JSON.stringify(muitos)).itens.length === 80);
console.log(ok + ' ok, ' + f + ' falhas'); process.exit(f ? 1 : 0);
