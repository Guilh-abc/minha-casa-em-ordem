/* Minha Casa em Ordem: proxy do Assistente (Liquid AI, LFM3-1.7B). Módulo único, sem dependências. byGui
   Segredo: LIQUID_API_KEY (secret_text). Nunca logar o corpo nem a chave. */
var API = 'https://api.liquid.ai/openai/v1/chat/completions';
var MODELO = 'lfm3-1.7b';
var MODELO_VISAO = 'lfm3-vl-2b';
var MAX_IMG = 1500000;          /* bytes do pedido com imagem (dataURL JPEG); a imagem nunca é guardada nem logada */
var ORIGENS = ['https://minha-casa-em-ordem.guilhermeromionetto.workers.dev', 'https://guilh-abc.github.io', 'http://localhost:8787', 'http://127.0.0.1:8787', 'http://localhost:8099'];
var MAX_CORPO = 24000;          /* bytes do pedido */
var MAX_MSGS = 12;
var MAX_TXT = 4000;             /* caracteres por mensagem */
var LIM_IP = 20, JANELA = 600000; /* 20 pedidos por IP a cada 10 min (por isolate) */
var LIM_DIA = 400;              /* teto diário por isolate */
var porIp = new Map(), dia = { d: '', n: 0 };
var SISTEMA = 'Você é o Assistente do app Minha Casa em Ordem, de uma família brasileira. Responda sempre em português do Brasil, de forma curta e prática. ' +
  'Use apenas os dados do app enviados no contexto; se faltar informação, diga que não encontrou no app. Não invente valores, datas, horários, compromissos nem contas: NUNCA acrescente itens que não estejam nos dados. Se o contexto vier como LISTA FECHADA, apenas reformule essa lista, sem adicionar nada. Use exatamente a data de hoje e de amanhã informadas abaixo. ' +
  'Você não grava nada. Se o usuário pedir para criar uma tarefa, conta ou compromisso, explique em uma frase e, no FINAL da resposta, inclua exatamente um bloco assim (JSON numa linha): ' +
  '<<SUGESTAO {"tipo":"tarefa","titulo":"...","data":"AAAA-MM-DD"}>> ou <<SUGESTAO {"tipo":"conta","titulo":"...","valor":123.45,"vence":"AAAA-MM-DD"}>> ou <<SUGESTAO {"tipo":"compromisso","titulo":"...","data":"AAAA-MM-DD","hora":"HH:MM"}>>. ' +
  'O app pede confirmação ao usuário antes de gravar.';

var LEITOR = 'Você lê fotos e prints de documentos domésticos brasileiros e devolve SOMENTE um JSON (sem texto fora dele, sem markdown). ' +
  'Escolha "tipo" entre: boleto, comprovante, acordo, compromisso, lista, cupom, outro. Campos por tipo: ' +
  'boleto: {"tipo":"boleto","beneficiario":"","valor":"","vencimento":"","linha_digitavel":""} (linha_digitavel: copie TODOS os 47 ou 48 dígitos da linha, inclusive o último grupo longo); ' +
  'comprovante (de pagamento/Pix/transferência): {"tipo":"comprovante","beneficiario":"quem RECEBEU (favorecido), não o banco","valor":"","data_pagamento":""}; ' +
  'acordo ou parcelamento: {"tipo":"acordo","beneficiario":"","parcelas":0,"parcela_atual":1,"valor_parcela":"","primeiro_vencimento":""}; ' +
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
  var ip = req.headers.get('CF-Connecting-IP') || 'x', lim = limitar(ip);
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
function limitar(ip) {
  var agora = Date.now(), hoje = new Date().toISOString().slice(0, 10);
  if (dia.d !== hoje) { dia.d = hoje; dia.n = 0; porIp.clear(); }
  if (dia.n >= LIM_DIA) return 'Limite diário do assistente atingido. Tente amanhã.';
  var l = (porIp.get(ip) || []).filter(function (t) { return agora - t < JANELA; });
  if (l.length >= LIM_IP) return 'Muitas perguntas seguidas. Espere alguns minutos.';
  l.push(agora); porIp.set(ip, l); dia.n++;
  return '';
}
function txt(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').slice(0, n) : ''; }

export default {
  async fetch(req, env) {
    var url = new URL(req.url), origem = req.headers.get('Origin') || '';
    if (url.pathname === '/saude') return resp({ ok: true, modelo: MODELO, visao: MODELO_VISAO }, 200, origem);
    if (url.pathname !== '/chat' && url.pathname !== '/ler') return resp({ erro: 'Rota não encontrada.' }, 404, origem);
    if (req.method === 'OPTIONS') return new Response(null, { status: ORIGENS.indexOf(origem) >= 0 ? 204 : 403, headers: cors(origem) });
    if (req.method !== 'POST') return resp({ erro: 'Use POST.' }, 405, origem);
    if (ORIGENS.indexOf(origem) < 0) return resp({ erro: 'Origem não permitida.' }, 403, origem);
    if (!env.LIQUID_API_KEY) return resp({ erro: 'Assistente sem configuração.' }, 503, origem);
    if (url.pathname === '/ler') return ler(req, env, origem);
    var tam = Number(req.headers.get('Content-Length') || 0);
    if (tam > MAX_CORPO) return resp({ erro: 'Pergunta grande demais.' }, 413, origem);
    var bruto = await req.text();
    if (bruto.length > MAX_CORPO) return resp({ erro: 'Pergunta grande demais.' }, 413, origem);
    var ip = req.headers.get('CF-Connecting-IP') || 'x', lim = limitar(ip);
    if (lim) return resp({ erro: lim }, 429, origem);
    var corpo; try { corpo = JSON.parse(bruto); } catch (e) { return resp({ erro: 'JSON inválido.' }, 400, origem); }
    var msgs = Array.isArray(corpo.mensagens) ? corpo.mensagens.slice(-MAX_MSGS) : [];
    msgs = msgs.filter(function (m) { return m && (m.papel === 'user' || m.papel === 'assistant') && typeof m.texto === 'string' && m.texto.trim(); })
      .map(function (m) { return { role: m.papel, content: txt(m.texto, MAX_TXT) }; });
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return resp({ erro: 'Envie uma pergunta.' }, 400, origem);
    var ctx = txt(corpo.contexto, 12000), hoje = txt(corpo.hoje, 40);
    var sys = SISTEMA + (hoje ? '\nHoje é ' + hoje + '.' : '') + (ctx ? '\n\nDados do app:\n' + ctx : '\n\n(O app não enviou dados.)');
    var r;
    try {
      r = await fetch(API, { method: 'POST', headers: { 'Authorization': 'Bearer ' + env.LIQUID_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODELO, messages: [{ role: 'system', content: sys }].concat(msgs), max_tokens: 600, temperature: 0.2, chat_template_kwargs: { enable_thinking: false } }) });
    } catch (e) { return resp({ erro: 'Não consegui falar com a Liquid AI.' }, 502, origem); }
    if (!r.ok) return resp({ erro: 'A Liquid AI respondeu com erro (' + r.status + ').' }, 502, origem);
    var j; try { j = await r.json(); } catch (e) { return resp({ erro: 'Resposta inválida da Liquid AI.' }, 502, origem); }
    var c = j && j.choices && j.choices[0] && j.choices[0].message ? (j.choices[0].message.content || '') : '';
    return resp({ resposta: String(c).trim() || 'Não consegui responder agora.', modelo: MODELO }, 200, origem);
  }
};
