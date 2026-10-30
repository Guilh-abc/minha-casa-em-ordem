/* Worker minha-casa-assistente: ponte entre o Ajudante do app e a Liquid AI (LFM3-1.7B).
   Fonte trazida do deploy de 30/10/2026 e ajustada: prompt curto em PT-BR, menos tokens, penalidade de repetição e stop.
   Chave em secret LIQUID_API_KEY (nunca no código). Deploy manual: cd assistente-worker && wrangler deploy. byGui */
var API = 'https://api.liquid.ai/openai/v1/chat/completions';
var MODELO = 'lfm3-1.7b';
var ORIGENS = ['https://minha-casa-em-ordem.guilhermeromionetto.workers.dev', 'https://guilhermeromio-netto-prog.github.io', 'https://guilh-abc.github.io', 'http://localhost:8787', 'http://127.0.0.1:8787', 'http://localhost:8099'];
export var MODELO_FOTO = 'lfm3-vl-2b';
var MAX_FOTO = 2.2e6;
var MAX_CORPO = 24e3, MAX_MSGS = 12, MAX_TXT = 4e3, LIM_IP = 20, JANELA = 6e5, LIM_DIA = 400;
var porIp = new Map(), dia = { d: '', n: 0 };
/* parâmetros do modelo (exportados para teste) */
export var PARAMS = { max_tokens: 280, temperature: 0.2, frequency_penalty: 0.6, presence_penalty: 0.3, repetition_penalty: 1.15, stop: ['...', '…', '\n\n\n', '<<FIM>>'] };
export var SISTEMA = 'Você é o Ajudante do app Minha Casa em Ordem, de uma família brasileira. ' +
  'Regras: responda SEMPRE em português do Brasil, em no máximo 5 linhas, sem repetir frases e sem reticências. ' +
  'Use SÓ os dados do app abaixo. Se não estiver nos dados, diga: "Não encontrei isso no app." ' +
  'Nunca invente contas, valores, datas, horários ou compromissos. Use as datas de hoje e amanhã informadas, não calcule outras. ' +
  'Se vier LISTA FECHADA, apenas reescreva essa lista, sem acrescentar nada. Você não grava nada. ' +
  'Se pedirem para criar tarefa, conta ou compromisso, explique em uma frase e termine com um bloco numa linha: ' +
  '<<SUGESTAO {"tipo":"tarefa","titulo":"...","data":"AAAA-MM-DD"}>> ou <<SUGESTAO {"tipo":"conta","titulo":"...","valor":123.45,"vence":"AAAA-MM-DD"}>> ou <<SUGESTAO {"tipo":"compromisso","titulo":"...","data":"AAAA-MM-DD","hora":"HH:MM"}>>. ' +
  'O app pede confirmação antes de gravar. Em perguntas (o que, qual, quando, quanto) responda só em texto curto, NUNCA use o bloco SUGESTAO, e nunca responda só com o bloco.';
var MODELO_VISAO = 'lfm3-vl-2b', MAX_IMG = 1500000;
/* rota /ler (leitura de documentos do outro fluxo de câmera): mantida para clientes antigos */
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
  var LIM = env && +env.LIMITE_IP > 0 ? +env.LIMITE_IP : LIM_IP;   /* LIMITE_IP só em testes locais */
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
/* rota /foto: lê etiqueta de preço, boleto, convite ou print. A imagem só passa pela memória: não é guardada, nem logada, nem devolvida. */
var SISTEMA_FOTO = 'Você lê fotos e prints para o app Minha Casa em Ordem, de uma família brasileira. ' +
  'Responda SÓ com um objeto JSON numa linha, sem texto em volta. Escolha o destino: ' +
  '"compras" para etiqueta de preço ou produto; "tarefa" para boleto, conta ou fatura a pagar; "agenda" só para convite, consulta ou evento com dia e hora. ' +
  'Formato para compras: {"destino":"compras","nome":"produto","preco":"R$ 0,00","unidade":"kg","local":"nome da loja escrito na imagem"}. ' +
  'Para boleto: {"destino":"tarefa","titulo":"Pagar boleto <beneficiário>","data":"vencimento DD/MM/AAAA","valor":"R$ 0,00"}. ' +
  'Para evento: {"destino":"agenda","titulo":"...","data":"DD/MM/AAAA","hora":"HH:MM","local":"..."}. ' +
  'Datas SEMPRE no formato brasileiro DD/MM/AAAA (dia primeiro). Copie números exatamente como aparecem. Deixe "" no que não aparecer. Nunca invente.';
/* modo nota fiscal (cupom de mercado): loja, data, itens, desconto e total, copiados como aparecem */
var SISTEMA_NOTA = 'Você lê fotos de nota fiscal ou cupom de compra para o app Minha Casa em Ordem, de uma família brasileira. ' +
  'Responda SÓ com um objeto JSON numa linha, sem texto em volta, neste formato: ' +
  '{"loja":"nome da loja","data":"DD/MM","itens":[{"nome":"produto","qtd":"1","unit":"R$ 0,00","total":"R$ 0,00"}],"desconto":"R$ 0,00","total":"R$ 0,00"}. ' +
  'Um item por linha da nota, na ordem. Copie nomes e números exatamente como aparecem. Deixe "" no que não aparecer. Nunca invente nem calcule valores.';
var CHAVES_NOTA = ['loja', 'data', 'desconto', 'total'], CHAVES_ITEM = ['nome', 'qtd', 'unit', 'total'];
function campoTxt(v, n) { return typeof v === 'string' ? v.slice(0, n) : (typeof v === 'number' && isFinite(v) ? String(v) : ''); }
export function lerNota(t) {
  var s = String(t || ''), i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  var o; try { o = JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
  if (!o || typeof o !== 'object') return null;
  var r = {}; CHAVES_NOTA.forEach(function (k) { r[k] = campoTxt(o[k], 80); });
  r.itens = (Array.isArray(o.itens) ? o.itens : []).slice(0, 80).filter(function (x) { return x && typeof x === 'object'; })
    .map(function (x) { var y = {}; CHAVES_ITEM.forEach(function (k) { y[k] = campoTxt(x[k], k === 'nome' ? 80 : 20); }); return y; });
  return r;
}
var CHAVES_FOTO = ['destino', 'nome', 'preco', 'unidade', 'local', 'titulo', 'data', 'hora', 'valor'];
export function montarFoto(corpo) {
  var img = corpo && typeof corpo.imagem === 'string' ? corpo.imagem : '';
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(img)) return null;
  var hoje = txt(corpo.hoje, 40), nota = corpo.modo === 'nota';
  return { model: MODELO_FOTO, max_tokens: nota ? 1200 : 300, temperature: 0.1, chat_template_kwargs: { enable_thinking: false },
    messages: [{ role: 'system', content: (nota ? SISTEMA_NOTA : SISTEMA_FOTO) + (hoje ? ' Hoje é ' + hoje + '.' : '') },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: img } }, { type: 'text', text: nota ? 'Leia esta nota fiscal.' : 'Extraia os dados desta imagem.' }] }] };
}
export function lerFoto(t) {
  var s = String(t || ''), i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  var o; try { o = JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
  if (!o || typeof o !== 'object') return null;
  var r = {}; CHAVES_FOTO.forEach(function (k) { if (typeof o[k] === 'string' || typeof o[k] === 'number') r[k] = typeof o[k] === 'string' ? o[k].slice(0, 160) : o[k]; });
  return r;
}
async function rotaFoto(req, env, origem) {
  if (Number(req.headers.get('Content-Length') || 0) > MAX_FOTO) return resp({ erro: 'Foto grande demais.' }, 413, origem);
  var bruto = await req.text();
  if (bruto.length > MAX_FOTO) return resp({ erro: 'Foto grande demais.' }, 413, origem);
  var lim = limitar(req.headers.get('CF-Connecting-IP') || 'x', env);
  if (lim) return resp({ erro: lim }, 429, origem);
  var corpo; try { corpo = JSON.parse(bruto); } catch (e) { return resp({ erro: 'JSON inválido.' }, 400, origem); }
  bruto = null;
  var modoNota = corpo && corpo.modo === 'nota';
  var envio = montarFoto(corpo); corpo = null;
  if (!envio) return resp({ erro: 'Envie uma imagem JPEG, PNG ou WebP.' }, 400, origem);
  var r;
  try { r = await fetch(API, { method: 'POST', headers: { 'Authorization': 'Bearer ' + env.LIQUID_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(envio) }); }
  catch (e) { return resp({ erro: 'Não consegui falar com a Liquid AI.' }, 502, origem); }
  finally { envio = null; }
  if (!r.ok) return resp({ erro: 'A Liquid AI respondeu com erro (' + r.status + ').' }, 502, origem);
  var j; try { j = await r.json(); } catch (e) { return resp({ erro: 'Resposta inválida da Liquid AI.' }, 502, origem); }
  var c = j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content || '' : '';
  if (modoNota) {
    var nota = lerNota(c);
    if (!nota) return resp({ erro: 'Não consegui ler a nota. Tente outra foto, com a nota inteira e reta.' }, 422, origem);
    return resp({ nota: nota, modelo: MODELO_FOTO }, 200, origem);
  }
  var campos = lerFoto(c);
  if (!campos) return resp({ erro: 'Não consegui ler a imagem. Tente outra foto.' }, 422, origem);
  return resp({ campos: campos, modelo: MODELO_FOTO }, 200, origem);
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
  'Você é a secretária da família (ele e a esposa): consulta e registra na Agenda, nas Tarefas e na Lista de Compra. ' +
  'Se faltar um dado essencial para registrar (data e hora de compromisso, quem, quantidade, o que exatamente), PERGUNTE de forma curta e conversacional antes; nunca preencha com suposição. ' +
  'Quando tiver o que precisa e o usuário pedir para criar, anotar, marcar, agendar ou lembrar algo, chame criar_sugestao (o app mostra um cartão e só grava se ele confirmar); diga que está aguardando a confirmação. Nunca diga que gravou. ' +
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
/* ---------- /lugares: restaurantes perto (Google Places API New). Chave só como secret PLACES_API_KEY; sem chave, 503 semChave (o app mostra o link do Maps). ---------- */
var PLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby';
var PLACES_CAMPOS = 'places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.priceRange,places.currentOpeningHours.openNow,places.googleMapsUri,places.location,places.reviewSummary,places.generativeSummary,places.formattedAddress';
var PRECO = { PRICE_LEVEL_FREE: 'grátis', PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$', PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' };
function txtG(o) { return o && typeof o.text === 'string' ? o.text.slice(0, 400) : ''; }
function faixa(r) {
  if (!r || !r.startPrice) return '';
  var a = r.startPrice, b = r.endPrice, f = function (m) { return m && m.units != null ? 'R$ ' + m.units : ''; };
  return f(a) + (b ? ' a ' + f(b) : '+');
}
export function lerLugares(j) {
  return (j && Array.isArray(j.places) ? j.places : []).slice(0, 12).map(function (p) {
    return { id: p.id || '', nome: txtG(p.displayName), nota: typeof p.rating === 'number' ? p.rating : null, avaliacoes: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
      preco: PRECO[p.priceLevel] || '', faixa: faixa(p.priceRange), aberto: p.currentOpeningHours && typeof p.currentOpeningHours.openNow === 'boolean' ? p.currentOpeningHours.openNow : null,
      resumo: txtG(p.reviewSummary && p.reviewSummary.text) || txtG(p.generativeSummary && p.generativeSummary.overview), endereco: String(p.formattedAddress || '').slice(0, 160),
      maps: typeof p.googleMapsUri === 'string' ? p.googleMapsUri : '', lat: p.location ? p.location.latitude : null, lng: p.location ? p.location.longitude : null };
  }).filter(function (x) { return x.nome; });
}
async function lugares(req, env, origem) {
  if (!env.PLACES_API_KEY) return resp({ erro: 'Busca de restaurantes sem chave do Google Maps Platform.', semChave: true }, 503, origem);
  var lim = limitar(req.headers.get('CF-Connecting-IP') || 'x', env); if (lim) return resp({ erro: lim }, 429, origem);
  var c; try { c = JSON.parse((await req.text()).slice(0, 2000)); } catch (e) { return resp({ erro: 'JSON inválido.' }, 400, origem); }
  var lat = +c.lat, lng = +c.lng, raio = Math.min(Math.max(+c.raio || 1500, 200), 5000);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return resp({ erro: 'Localização inválida.' }, 400, origem);
  var corpo = { includedTypes: ['restaurant'], maxResultCount: 10, rankPreference: 'POPULARITY', languageCode: 'pt-BR', regionCode: 'BR', locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: raio } } };
  async function chamar(campos) { return fetch(PLACES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.PLACES_API_KEY, 'X-Goog-FieldMask': campos }, body: JSON.stringify(corpo) }); }
  var r; try { r = await chamar(PLACES_CAMPOS); if (r.status === 400) r = await chamar(PLACES_CAMPOS.replace(',places.reviewSummary,places.generativeSummary', '')); }
  catch (e) { return resp({ erro: 'Não consegui falar com o Google Maps.' }, 502, origem); }
  if (!r.ok) return resp({ erro: 'O Google Maps recusou a busca (' + r.status + ').' }, 502, origem);
  return resp({ lugares: lerLugares(await r.json()) }, 200, origem);
}
export function config() { return { PARAMS: PARAMS, SISTEMA: SISTEMA }; }
export default {
  async fetch(req, env) {
    var url = new URL(req.url), origem = req.headers.get('Origin') || '';
    if (url.pathname === '/saude') return resp({ ok: true, modelo: MODELO, visao: MODELO_VISAO, foto: MODELO_FOTO, conversa: env.GEMINI_MODELO || GEMINI_PADRAO, gemini: !!env.GEMINI_API_KEY, lugares: !!env.PLACES_API_KEY }, 200, origem);
    if (['/chat', '/foto', '/ler', '/conversa', '/lugares'].indexOf(url.pathname) < 0) return resp({ erro: 'Rota não encontrada.' }, 404, origem);
    if (req.method === 'OPTIONS') return new Response(null, { status: ORIGENS.indexOf(origem) >= 0 ? 204 : 403, headers: cors(origem) });
    if (req.method !== 'POST') return resp({ erro: 'Use POST.' }, 405, origem);
    if (ORIGENS.indexOf(origem) < 0) return resp({ erro: 'Origem não permitida.' }, 403, origem);
    if (url.pathname === '/conversa') return conversa(req, env, origem);
    if (url.pathname === '/lugares') return lugares(req, env, origem);
    if (!env.LIQUID_API_KEY) return resp({ erro: 'Assistente sem configuração.' }, 503, origem);
    if (url.pathname === '/ler') return ler(req, env, origem);
    if (url.pathname === '/foto') return rotaFoto(req, env, origem);
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
