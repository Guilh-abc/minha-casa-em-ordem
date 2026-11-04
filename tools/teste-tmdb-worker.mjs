import w, { tmdbUrl } from '../assistente-worker/worker.js';
const env = { TMDB_API_KEY: process.env.TMDB_API_KEY };
const O = 'https://guilhermeromio-netto-prog.github.io';
let ok = 0, f = 0; const ck = (c, m) => { c ? ok++ : f++; console.log((c ? '  ok   ' : '  FALHA ') + m); };
async function g(q, o = O, m = 'GET') { const r = await w.fetch(new Request('https://x/tmdb?' + q, { method: m, headers: { Origin: o } }), env); return [r.status, r.status === 200 ? await r.json() : await r.text(), r.headers]; }
let [s, j, h] = await g('p=movie/278/recommendations'); ck(s === 200 && j.results.length > 0, 'recommendations ' + s);
ck(h.get('Access-Control-Allow-Origin') === O, 'CORS');
[s, j] = await g('p=movie/278&append_to_response=credits,watch/providers'); ck(s === 200 && j.title === 'Um Sonho de Liberdade' && j.credits && j['watch/providers'], 'details pt-BR com credits e providers');
[s, j] = await g('p=tv/1396/similar'); ck(s === 200 && j.results.length > 0, 'tv similar');
[s, j] = await g('p=discover/movie&with_genres=53&without_genres=16,10402&vote_count.gte=500'); ck(s === 200 && j.results.length > 0, 'discover');
[s, j] = await g('p=search/multi&query=Sully'); ck(s === 200 && j.results.length > 0, 'search');
[s] = await g('p=account'); ck(s === 400, 'caminho fora da lista recusado');
[s] = await g('p=movie/278', 'https://mal.com'); ck(s === 403, 'origem recusada');
[s] = await g('p=movie/278', O, 'POST'); ck(s === 405, 'só GET');
const u = tmdbUrl('movie/1', new URLSearchParams('api_key=x&append_to_response=videos'), ''); ck(!u.searchParams.get('api_key') && !u.searchParams.get('append_to_response') && u.searchParams.get('language') === 'pt-BR', 'parâmetros filtrados');
const r = await w.fetch(new Request('https://x/tmdb?p=movie/278', { headers: { Origin: O } }), {}); ck(r.status === 503, 'sem chave 503');
const t = await (await w.fetch(new Request('https://x/movie/278/recommendations?p=1', { headers: { Origin: O } }), env)).text(); ck(!t.includes(process.env.TMDB_API_KEY), 'chave nunca na resposta');
console.log(ok + ' ok, ' + f + ' falhas'); process.exit(f ? 1 : 0);
