/* node tools/teste-limite-foto.mjs — /foto tem cota própria por IP (nota longa em várias fotos)  byGui */
import W from '../assistente-worker/worker.js';
var ok = 0, f = 0; function t(n, c) { if (c) ok++; else { f++; console.log('  FALHA ' + n); } }
globalThis.fetch = async function () { return new Response(JSON.stringify({ choices: [{ message: { content: '{"loja":"X","itens":[],"total":"1,00"}' } }] }), { status: 200 }); };
var ORIG = 'https://guilhermeromio-netto-prog.github.io', env = { LIQUID_API_KEY: 'k' }, IMG = 'data:image/jpeg;base64,' + 'A'.repeat(400);
function req(rota, corpo, ip) { return new Request('https://w.dev/' + rota, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIG, 'CF-Connecting-IP': ip }, body: JSON.stringify(corpo) }); }
var st = [];
for (var i = 0; i < 40; i++) st.push((await W.fetch(req('foto', { imagem: IMG, modo: 'nota' }, '9.9.9.9'), env)).status);
t('40 fotos seguidas passam (nota longa): ' + st.filter(function (x) { return x !== 200; }).length + ' recusadas', st.every(function (x) { return x === 200; }));
var r = await W.fetch(req('foto', { imagem: IMG, modo: 'nota' }, '9.9.9.9'), env), j = await r.json();
t('a 41ª foto em 10 min é recusada com aviso de fotos', r.status === 429 && /fotos/.test(j.erro));
var c = await W.fetch(req('chat', { mensagens: [{ papel: 'user', texto: 'oi' }] }, '9.9.9.9'), env);
t('fotos não gastam a cota do chat', c.status !== 429);
console.log(ok + ' ok, ' + f + ' falhas'); if (f) process.exit(1);
