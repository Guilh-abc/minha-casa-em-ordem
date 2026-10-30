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
  var lim = limitar(req.headers.get('CF-Connecting-IP') || 'x');
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
export default {
  async fetch(req, env) {
    var url = new URL(req.url), origem = req.headers.get('Origin') || '';
    if (url.pathname === '/saude') return resp({ ok: true, modelo: MODELO }, 200, origem);
    if (url.pathname !== '/chat' && url.pathname !== '/foto') return resp({ erro: 'Rota não encontrada.' }, 404, origem);
    if (req.method === 'OPTIONS') return new Response(null, { status: ORIGENS.indexOf(origem) >= 0 ? 204 : 403, headers: cors(origem) });
    if (req.method !== 'POST') return resp({ erro: 'Use POST.' }, 405, origem);
    if (ORIGENS.indexOf(origem) < 0) return resp({ erro: 'Origem não permitida.' }, 403, origem);
    if (!env.LIQUID_API_KEY) return resp({ erro: 'Assistente sem configuração.' }, 503, origem);
    if (url.pathname === '/foto') return rotaFoto(req, env, origem);
    if (Number(req.headers.get('Content-Length') || 0) > MAX_CORPO) return resp({ erro: 'Pergunta grande demais.' }, 413, origem);
    var bruto = await req.text();
    if (bruto.length > MAX_CORPO) return resp({ erro: 'Pergunta grande demais.' }, 413, origem);
    var lim = limitar(req.headers.get('CF-Connecting-IP') || 'x');
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
