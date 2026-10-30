/* Worker minha-casa-assistente: ponte entre o Ajudante do app e a Liquid AI (LFM3-1.7B).
   Fonte trazida do deploy de 30/10/2026 e ajustada: prompt curto em PT-BR, menos tokens, penalidade de repetição e stop.
   Chave em secret LIQUID_API_KEY (nunca no código). Deploy manual: cd assistente-worker && wrangler deploy. byGui */
var API = 'https://api.liquid.ai/openai/v1/chat/completions';
var MODELO = 'lfm3-1.7b';
var MODELO_VISAO = 'lfm3-vl-2b';
var MAX_IMG = 1500000;          /* bytes do pedido com imagem; a imagem nunca é guardada nem logada */
var ORIGENS = ['https://minha-casa-em-ordem.guilhermeromionetto.workers.dev', 'https://guilhermeromio-netto-prog.github.io', 'https://guilh-abc.github.io', 'http://localhost:8787', 'http://127.0.0.1:8787', 'http://localhost:8099'];
var MAX_CORPO = 24e3, MAX_MSGS = 12, MAX_TXT = 4e3, LIM_IP = 20, JANELA = 6e5, LIM_DIA = 400;
var porIp = new Map(), dia = { d: '', n: 0 };
/* parâmetros do modelo (exportados para teste) */
var PARAMS = { max_tokens: 280, temperature: 0.2, frequency_penalty: 0.6, presence_penalty: 0.3, repetition_penalty: 1.15, stop: ['...', '…', '\n\n\n', '<<FIM>>'] };
var SISTEMA = 'Você é o Ajudante do app Minha Casa em Ordem, de uma família brasileira. ' +
  'Regras: responda SEMPRE em português do Brasil, em no máximo 5 linhas, sem repetir frases e sem reticências. ' +
  'Use SÓ os dados do app abaixo. Se não estiver nos dados, diga: "Não encontrei isso no app." ' +
  'Nunca invente contas, valores, datas, horários ou compromissos. Use as datas de hoje e amanhã informadas, não calcule outras. ' +
  'Se vier LISTA FECHADA, apenas reescreva essa lista, sem acrescentar nada. Você não grava nada. ' +
  'Se pedirem para criar tarefa, conta ou compromisso, explique em uma frase e termine com um bloco numa linha: ' +
  '<<SUGESTAO {"tipo":"tarefa","titulo":"...","data":"AAAA-MM-DD"}>> ou <<SUGESTAO {"tipo":"conta","titulo":"...","valor":123.45,"vence":"AAAA-MM-DD"}>> ou <<SUGESTAO {"tipo":"compromisso","titulo":"...","data":"AAAA-MM-DD","hora":"HH:MM"}>>. ' +
  'O app pede confirmação antes de gravar.';

var LEITOR = 'Você lê fotos e prints de documentos domésticos brasileiros e devolve SOMENTE um JSON (sem texto fora dele, sem markdown). ' +
  'Escolha "tipo" entre: boleto, comprovante, acordo, compromisso, lista, cupom, outro. Campos por tipo: ' +
  'boleto: {"tipo":"boleto","beneficiario":"","valor":"","vencimento":"","linha_digitavel":""} (linha_digitavel: copie TODOS os 47 ou 48 dígitos da linha, inclusive o último grupo longo); ' +
  'comprovante (de pagamento/Pix/transferência): {"tipo":"comprovante","beneficiario":"quem RECEBEU (favorecido), não o banco","valor":"","data_pagamento":""}; ' +
  'acordo ou parcelamento: {"tipo":"acordo","beneficiario":"(credor)","parcelas":0,"parcela_atual":1,"valor_parcela":"","primeiro_vencimento":""}; ' +
  'convite, receita médica, aviso de escola ou conversa com data: {"tipo":"compromisso","titulo":"","data":"","hora":"","local":"","obs":""}; ' +
  'lista ou anotação: {"tipo":"lista","itens":["",""]}; ' +
  'cupom fiscal ou nota de compra: {"tipo":"cupom","estabelecimento":"","total":"","data":"","categoria":"mercado|restaurante|transporte|saude|educacao|lazer|assinaturas|casa|compras|viagens|encargos|outros"}. ' +
  'Datas no formato DD/MM/AAAA e valores como aparecem (ex.: R$ 1.234,56). Copie exatamente o que está escrito; deixe "" se não estiver legível. Não invente.';
function lerJson(c) { var s = String(c || ''), i = s.indexOf('{'), f = s.lastIndexOf('}'); if (i < 0 || f <= i) return null; try { var o = JSON.parse(s.slice(i, f + 1)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; } }
async function liquid(env, corpo) {
  return fetch(API, { method: 'POST', headers: { 'Authorization': 'Bearer ' + env.LIQUID_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
}
async function ler(req, env, origem) {
  var tam = Number(req.headers.get('Content-Length') || 0);
  if (tam > MAX_IMG) return resp({ erro: 'Imagem grande demais.' }, 413, origem);
  var bruto = await req.text();
  if (bruto.length > MAX_IMG) return resp({ erro: 'Imagem grande demais.' }, 413, origem);
  var ip = req.headers.get('CF-Connecting-IP') || 'x', lim = limitar(ip, env);
  if (lim) return resp({ erro: lim }, 429, origem);
  var corpo; try { corpo = JSON.parse(bruto); } catch (e) { return resp({ erro: 'JSON inválido.' }, 400, origem); }
  var img = typeof corpo.imagem === 'string' ? corpo.imagem : '';
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(img)) return resp({ erro: 'Envie uma imagem JPEG, PNG ou WebP.' }, 400, origem);
  var hoje = txt(corpo.hoje, 40), r;
  try {
    r = await liquid(env, { model: MODELO_VISAO, max_tokens: 700, temperature: 0, chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: 'system', content: LEITOR + (hoje ? ' Hoje é ' + hoje + '.' : '') }, { role: 'user', content: [{ type: 'image_url', image_url: { url: img } }, { type: 'text', text: 'Leia este documento e devolva o JSON.' }] }] });
  } catch (e) { return resp({ erro: 'Não consegui falar com a Liquid AI.' }, 502, origem); }
  img = ''; corpo = null; bruto = '';
  if (!r.ok) return resp({ erro: 'A Liquid AI respondeu com erro (' + r.status + ').' }, 502, origem);
  var j; try { j = await r.json(); } catch (e) { return resp({ erro: 'Resposta inválida da Liquid AI.' }, 502, origem); }
  var c = j && j.choices && j.choices[0] && j.choices[0].message ? (j.choices[0].message.content || '') : '';
  var o = lerJson(c);
  if (!o) return resp({ erro: 'Não consegui entender a imagem. Tente uma foto mais nítida.' }, 422, origem);
  return resp({ leitura: o, modelo: MODELO_VISAO }, 200, origem);
}
function cors(origem) {
  var h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' });
  if (ORIGENS.indexOf(origem) >= 0) { h.set('Access-Control-Allow-Origin', origem); h.set('Access-Control-Allow-Methods', 'POST, OPTIONS'); h.set('Access-Control-Allow-Headers', 'Content-Type'); h.set('Access-Control-Max-Age', '600'); }
  return h;
}
function resp(obj, st, origem) { return new Response(JSON.stringify(obj), { status: st, headers: cors(origem) }); }
function limitar(ip, env) {
  var LIM = env && +env.LIMITE_IP > 0 ? +env.LIMITE_IP : LIM_IP;   /* LIMITE_IP só em testes locais (wrangler dev) */
  var agora = Date.now(), hoje = new Date().toISOString().slice(0, 10);
  if (dia.d !== hoje) { dia.d = hoje; dia.n = 0; porIp.clear(); }
  if (dia.n >= LIM_DIA) return 'Limite diário do assistente atingido. Tente amanhã.';
  var l = (porIp.get(ip) || []).filter(function (t) { return agora - t < JANELA; });
  if (l.length >= LIM) return 'Muitas perguntas seguidas. Espere alguns minutos.';
  l.push(agora); porIp.set(ip, l); dia.n++; return '';
}
function txt(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').slice(0, n) : ''; }
/* monta o corpo enviado à Liquid AI (puro, testável) */
export function montarCorpo(corpo) {
  var msgs = (Array.isArray(corpo.mensagens) ? corpo.mensagens.slice(-MAX_MSGS) : [])
    .filter(function (m) { return m && (m.papel === 'user' || m.papel === 'assistant') && typeof m.texto === 'string' && m.texto.trim(); })
    .map(function (m) { return { role: m.papel, content: txt(m.texto, MAX_TXT) }; });
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return null;
  var ctx = txt(corpo.contexto, 12e3), hoje = txt(corpo.hoje, 120);
  var sys = SISTEMA + (hoje ? '\nHoje é ' + hoje + '.' : '') + (ctx ? '\n\nDados do app:\n' + ctx : '\n\n(O app não enviou dados.)');
  var o = { model: MODELO, messages: [{ role: 'system', content: sys }].concat(msgs), chat_template_kwargs: { enable_thinking: false } };
  Object.keys(PARAMS).forEach(function (k) { o[k] = PARAMS[k]; });
  return o;
}

/* ---------- /conversa: Gemini (faixa grátis) com function calling; as ferramentas rodam NO APP, sobre os dados reais ---------- */
var GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/';
/* Plano gratuito (medido 30/10): gemini-3.5-flash tem só 20 pedidos/DIA por projeto; o flash-lite aguenta o uso diário. Padrão = lite, reserva = flash. */
var GEMINI_PADRAO = 'gemini-3.5-flash-lite', GEMINI_RESERVA = 'gemini-3.5-flash';
var MAX_CONVERSA = 60000, MAX_TURNOS = 40;
var SISTEMA_G = 'Você é o Ajudante do app Minha Casa em Ordem, de uma família brasileira. Responda em português do Brasil, informal e curto (até 6 linhas). ' +
  'Você NÃO conhece os dados da família: para qualquer pergunta sobre agenda, tarefas, contas ou eventos, CHAME as ferramentas e responda SÓ com o que elas devolverem. ' +
  'Nunca invente itens, datas, horários ou valores; se a ferramenta vier vazia, diga que não encontrou no app. Copie datas e valores exatamente como vieram. ' +
  'Períodos: "hoje" = data de hoje; "amanhã" = hoje+1; "essa semana"/"esta semana"/"semana" = de hoje até hoje+7 (inclusive); "este mês" = até o fim do mês. Use datas AAAA-MM-DD nas ferramentas. ' +
  'Se o usuário pedir para criar, anotar, marcar, agendar ou lembrar algo, chame criar_sugestao (o app mostra um cartão e só grava se ele confirmar); diga que está aguardando a confirmação. Nunca diga que gravou. ' +
  'Use o histórico para entender continuações curtas ("pronto o quê?", "e amanhã?", "e as atrasadas?"): explique ou complete a resposta anterior. ' +
  'Entenda erros de digitação. Não use markdown com asteriscos; listas com "- ".';
var FERRAMENTAS = [{ functionDeclarations: [
  { name: 'buscar_agenda', description: 'Compromissos da agenda entre duas datas (inclusive).', parameters: { type: 'OBJECT', properties: { de: { type: 'STRING', description: 'AAAA-MM-DD' }, ate: { type: 'STRING', description: 'AAAA-MM-DD' } }, required: ['de', 'ate'] } },
  { name: 'proximo_evento', description: 'O próximo compromisso da agenda a partir de agora.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'listar_tarefas', description: 'Tarefas da família.', parameters: { type: 'OBJECT', properties: { filtro: { type: 'STRING', enum: ['pendentes', 'alta', 'hoje', 'atrasadas', 'semana', 'concluidas', 'todas'] }, limite: { type: 'INTEGER' }, lista: { type: 'STRING', description: 'nome da lista (Casa, Trabalho...), opcional' } }, required: ['filtro'] } },
  { name: 'listar_contas', description: 'Contas/boletos. status: abertas (todas a pagar), atrasadas (vencidas e não pagas), pagas, todas. de/ate filtram o vencimento.', parameters: { type: 'OBJECT', properties: { status: { type: 'STRING', enum: ['abertas', 'atrasadas', 'pagas', 'todas'] }, de: { type: 'STRING' }, ate: { type: 'STRING' } }, required: ['status'] } },
  { name: 'criar_sugestao', description: 'Propõe criar algo (o app pede confirmação antes de gravar). Use só quando o usuário pedir para criar/anotar/marcar/lembrar.', parameters: { type: 'OBJECT', properties: {
    tipo: { type: 'STRING', enum: ['tarefa', 'compromisso', 'conta', 'lembrete', 'compras'] }, titulo: { type: 'STRING' }, data: { type: 'STRING', description: 'AAAA-MM-DD' }, hora: { type: 'STRING', description: 'HH:MM' },
    valor: { type: 'NUMBER' }, prioridade: { type: 'STRING', enum: ['alta', 'media', 'baixa'] }, itens: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['tipo', 'titulo'] } }
] }];
function json1(v, n) { try { var s = JSON.stringify(v === undefined ? {} : v); return s.length <= n ? JSON.parse(s) : null; } catch (e) { return null; } }
/* turnos do app -> contents do Gemini (puro, testável). Turno: {r:'user'|'model', t} | {r:'model', fc:[{n,a,s}]} | {r:'tool', fr:[{n,res}]} */
export function montarGemini(corpo) {
  var ts = Array.isArray(corpo && corpo.turnos) ? corpo.turnos.slice(-MAX_TURNOS) : [], out = [];
  ts.forEach(function (x) {
    if (!x) return;
    if ((x.r === 'user' || x.r === 'model') && typeof x.t === 'string' && x.t.trim()) out.push({ role: x.r, parts: [{ text: txt(x.t, MAX_TXT) }] });
    else if (x.r === 'model' && Array.isArray(x.fc) && x.fc.length) out.push({ role: 'model', parts: x.fc.slice(0, 6).map(function (c) { var p = { functionCall: { name: txt(c.n, 40), args: json1(c.a, 4000) || {} } }; if (typeof c.s === 'string' && c.s) p.thoughtSignature = c.s.slice(0, 20000); return p; }) });
    else if (x.r === 'tool' && Array.isArray(x.fr) && x.fr.length) out.push({ role: 'user', parts: x.fr.slice(0, 6).map(function (c) { return { functionResponse: { name: txt(c.n, 40), response: json1(c.res, 20000) || { erro: 'resultado grande demais' } } }; }) });
  });
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length) return null;
  var hoje = txt(corpo.hoje, 160);
  return { systemInstruction: { parts: [{ text: SISTEMA_G + (hoje ? '\nHoje é ' + hoje + '.' : '') }] }, contents: out, tools: FERRAMENTAS,
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } }, generationConfig: { temperature: 0.2, maxOutputTokens: 700, thinkingConfig: { thinkingLevel: 'minimal' } } };
}
/* resposta do Gemini -> {chamadas:[{n,a,s}]} ou {resposta} (puro) */
export function lerGemini(j) {
  var c = j && j.candidates && j.candidates[0], parts = (c && c.content && c.content.parts) || [], fc = [], tx = [];
  parts.forEach(function (p) { if (p.functionCall) fc.push({ n: p.functionCall.name, a: p.functionCall.args || {}, s: p.thoughtSignature || '' }); else if (p.text && !p.thought) tx.push(p.text); });
  if (fc.length) return { chamadas: fc };
  var t = tx.join('').trim();
  return t ? { resposta: t } : null;
}
async function conversa(req, env, origem) {
  if (!env.GEMINI_API_KEY) return resp({ erro: 'Gemini sem configuração.', fallback: true }, 503, origem);
  if (Number(req.headers.get('Content-Length') || 0) > MAX_CONVERSA) return resp({ erro: 'Conversa grande demais.' }, 413, origem);
  var bruto = await req.text();
  if (bruto.length > MAX_CONVERSA) return resp({ erro: 'Conversa grande demais.' }, 413, origem);
  var lim = limitar(req.headers.get('CF-Connecting-IP') || 'x', env);
  if (lim) return resp({ erro: lim, fallback: true }, 429, origem);
  var corpo; try { corpo = JSON.parse(bruto); } catch (e) { return resp({ erro: 'JSON inválido.' }, 400, origem); }
  var envio = montarGemini(corpo); bruto = '';
  if (!envio) return resp({ erro: 'Envie uma pergunta.' }, 400, origem);
  var modelos = [env.GEMINI_MODELO || GEMINI_PADRAO, GEMINI_RESERVA], ult = 0;
  for (var i = 0; i < modelos.length; i++) {
    var r, ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 20000);
    try { r = await fetch(GEMINI_API + modelos[i] + ':generateContent', { method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(envio), signal: ctl.signal }); }
    catch (e) { clearTimeout(tm); ult = 504; continue; }
    clearTimeout(tm);
    if (!r.ok) { ult = r.status; if (r.status === 429 || r.status >= 500) continue; return resp({ erro: 'O Gemini respondeu com erro (' + r.status + ').', fallback: true }, 502, origem); }
    var j; try { j = await r.json(); } catch (e) { ult = 502; continue; }
    var o = lerGemini(j);
    if (!o) return resp({ erro: 'O Gemini não respondeu.', fallback: true }, 502, origem);
    o.modelo = modelos[i]; return resp(o, 200, origem);
  }
  return resp({ erro: ult === 429 ? 'Limite gratuito do Gemini atingido.' : 'O Gemini está indisponível agora.', fallback: true }, ult === 429 ? 429 : 502, origem);
}
export function config() { return { PARAMS: PARAMS, SISTEMA: SISTEMA }; }  /* só funções exportadas: o runtime recusa export de valores */
export default {
  async fetch(req, env) {
    var url = new URL(req.url), origem = req.headers.get('Origin') || '';
    if (url.pathname === '/saude') return resp({ ok: true, modelo: MODELO, visao: MODELO_VISAO, conversa: env.GEMINI_MODELO || GEMINI_PADRAO, gemini: !!env.GEMINI_API_KEY }, 200, origem);
    if (req.method === 'OPTIONS') return new Response(null, { status: ORIGENS.indexOf(origem) >= 0 ? 204 : 403, headers: cors(origem) });
    if (url.pathname !== '/chat' && url.pathname !== '/ler' && url.pathname !== '/conversa') return resp({ erro: 'Rota não encontrada.' }, 404, origem);
    if (req.method !== 'POST') return resp({ erro: 'Use POST.' }, 405, origem);
    if (ORIGENS.indexOf(origem) < 0) return resp({ erro: 'Origem não permitida.' }, 403, origem);
    if (url.pathname === '/conversa') return conversa(req, env, origem);
    if (!env.LIQUID_API_KEY) return resp({ erro: 'Assistente sem configuração.' }, 503, origem);
    if (url.pathname === '/ler') return ler(req, env, origem);
    if (Number(req.headers.get('Content-Length') || 0) > MAX_CORPO) return resp({ erro: 'Pergunta grande demais.' }, 413, origem);
    var bruto = await req.text();
    if (bruto.length > MAX_CORPO) return resp({ erro: 'Pergunta grande demais.' }, 413, origem);
    var lim = limitar(req.headers.get('CF-Connecting-IP') || 'x', env);
    if (lim) return resp({ erro: lim }, 429, origem);
    var corpo; try { corpo = JSON.parse(bruto); } catch (e) { return resp({ erro: 'JSON inválido.' }, 400, origem); }
    var envio = montarCorpo(corpo);
    if (!envio) return resp({ erro: 'Envie uma pergunta.' }, 400, origem);
    var r;
    try { r = await fetch(API, { method: 'POST', headers: { 'Authorization': 'Bearer ' + env.LIQUID_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(envio) }); }
    catch (e) { return resp({ erro: 'Não consegui falar com a Liquid AI.' }, 502, origem); }
    if (!r.ok) return resp({ erro: 'A Liquid AI respondeu com erro (' + r.status + ').' }, 502, origem);
    var j; try { j = await r.json(); } catch (e) { return resp({ erro: 'Resposta inválida da Liquid AI.' }, 502, origem); }
    var c = j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content || '' : '';
    return resp({ resposta: String(c).trim() || 'Não consegui responder agora.', modelo: MODELO }, 200, origem);
  }
};
