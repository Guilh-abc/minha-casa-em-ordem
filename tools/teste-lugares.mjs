/* node tools/teste-lugares.mjs  byGui */
import W, { lerLugares } from '../assistente-worker/worker.js';
import { createRequire } from 'module'; var C = createRequire(import.meta.url)('../js/assistente-consultas.js');
var ok = 0, f = 0; function t(n, c) { if (c) ok++; else { f++; console.log('  FALHA ' + n); } }
var O = 'https://guilh-abc.github.io';
function req(p, b) { return new Request('https://x' + p, { method: 'POST', headers: { Origin: O, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); }
var r = await W.fetch(req('/lugares', { lat: -23.5, lng: -46.6 }), {}); var j = await r.json();
t('sem chave: 503 semChave', r.status === 503 && j.semChave === true);
var sa = await (await W.fetch(new Request('https://x/saude'), { GEMINI_API_KEY: 'k' })).json(); t('saude gemini e lugares', sa.gemini === true && sa.lugares === false);
var L = lerLugares({ places: [{ displayName: { text: 'Bar A' }, rating: 4.6, userRatingCount: 812, priceLevel: 'PRICE_LEVEL_MODERATE', currentOpeningHours: { openNow: true }, googleMapsUri: 'https://maps.google.com/?cid=1', location: { latitude: -23.501, longitude: -46.6 }, reviewSummary: { text: { text: 'Bom' } } }, { displayName: { text: 'B' } }, {}] });
t('lê campos', L.length === 2 && L[0].nota === 4.6 && L[0].avaliacoes === 812 && L[0].preco === '$$' && L[0].aberto === true && L[0].resumo === 'Bom');
t('sem dado vira null, não inventa', L[1].nota === null && L[1].avaliacoes === null && L[1].aberto === null && L[1].preco === '' && L[1].resumo === '');
var chamado = null; globalThis.fetch = async function (u, o) { chamado = o; return new Response(JSON.stringify({ places: [{ displayName: { text: 'X' } }] }), { status: 200 }); };
r = await W.fetch(req('/lugares', { lat: -23.5, lng: -46.6 }), { PLACES_API_KEY: 'k' }); j = await r.json();
t('com chave: 200 e lista', r.status === 200 && j.lugares[0].nome === 'X'); t('chave vai no cabeçalho', chamado.headers['X-Goog-Api-Key'] === 'k' && /restaurant/.test(chamado.body));
var url0 = null; globalThis.fetch = async function (u, o) { url0 = u; chamado = o; return new Response(JSON.stringify({ places: [{ displayName: { text: 'Y' } }] }), { status: 200 }); };
r = await W.fetch(req('/lugares', { texto: 'Centro, Osasco' }), { PLACES_API_KEY: 'k' }); j = await r.json();
t('texto usa Text Search', r.status === 200 && /searchText$/.test(url0) && JSON.parse(chamado.body).textQuery === 'restaurantes em Centro, Osasco' && j.busca === 'Centro, Osasco');
r = await W.fetch(req('/lugares', { texto: 'x' }), { PLACES_API_KEY: 'k' }); t('texto curto 400', r.status === 400);
r = await W.fetch(req('/lugares', { lat: 999, lng: 0 }), { PLACES_API_KEY: 'k' }); t('localização inválida 400', r.status === 400);
t('distância', Math.abs(C.distancia({ lat: -23.5, lng: -46.6 }, { lat: -23.501, lng: -46.6 }) - 111) < 3 && C.rotDist(111) === '111 m' && C.rotDist(1540) === '1,5 km');
t('link do maps', C.linkMaps(-23.5, -46.6) === 'https://www.google.com/maps/search/restaurantes/@-23.50000,-46.60000,15z');
t('pede restaurante', C.pedeRestaurante('tem restaurante perto?') && C.pedeRestaurante('onde jantar hoje') && !C.pedeRestaurante('paguei o mercado'));
var S = C.sugestoesDinamicas({ abertas: [{ dias: -1 }] }, '2026-10-30', 9, []); t('sugestões: até 6, dado real primeiro', S.length <= 6 && S[0].rotulo === '1 conta atrasada: quais?');
t('sugestões sem dados não inventam contagens', C.sugestoesDinamicas({}, '2026-10-30', 9, []).every(function (x) { return !/\d/.test(x.rotulo); }));
console.log(ok + ' ok, ' + f + ' falhas'); if (f) process.exit(1);
