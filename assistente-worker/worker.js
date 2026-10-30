/* Minha Casa em Ordem: proxy do Assistente (Liquid AI, LFM3-1.7B). Módulo único, sem dependências. byGui
   Segredo: LIQUID_API_KEY (secret_text). Nunca logar o corpo nem a chave. */
var API = 'https://api.liquid.ai/openai/v1/chat/completions';
var MODELO = 'lfm3-1.7b';
var ORIGENS = ['https://minha-casa-em-ordem.guilhermeromionetto.workers.dev', 'https://guilh-abc.github.io', 'http://localhost:8787', 'http://127.0.0.1:8787', 'http://localhost:8099'];
var MAX_CORPO = 24000;          /* bytes do pedido */
var MAX_MSGS = 12;
var MAX_TXT = 4000;             /* caracteres por mensagem */
var LIM_IP = 20, JANELA = 600000; /* 20 pedidos por IP a cada 10 min (por isolate) */
var LIM_DIA = 400;              /* teto diário por isolate */
var porIp = new Map(), dia = { d: '', n: 0 };
var SISTEMA = 'Você é o Assistente do app Minha Casa em Ordem, de uma família brasileira. Responda sempre em português do Brasil, de forma curta e prática. ' +
  'Use apenas os dados do app enviados no contexto; se faltar informação, diga que não encontrou no app. Não invente valores, datas nem contas. ' +
  'Você não grava nada. Se o usuário pedir para criar uma tarefa, conta ou compromisso, explique em uma frase e, no FINAL da resposta, inclua exatamente um bloco assim (JSON numa linha): ' +
  '<<SUGESTAO {"tipo":"tarefa","titulo":"...","data":"AAAA-MM-DD"}>> ou <<SUGESTAO {"tipo":"conta","titulo":"...","valor":123.45,"vence":"AAAA-MM-DD"}>> ou <<SUGESTAO {"tipo":"compromisso","titulo":"...","data":"AAAA-MM-DD","hora":"HH:MM"}>>. ' +
  'O app pede confirmação ao usuário antes de gravar.';

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
    if (url.pathname === '/saude') return resp({ ok: true, modelo: MODELO }, 200, origem);
    if (url.pathname !== '/chat') return resp({ erro: 'Rota não encontrada.' }, 404, origem);
    if (req.method === 'OPTIONS') return new Response(null, { status: ORIGENS.indexOf(origem) >= 0 ? 204 : 403, headers: cors(origem) });
    if (req.method !== 'POST') return resp({ erro: 'Use POST.' }, 405, origem);
    if (ORIGENS.indexOf(origem) < 0) return resp({ erro: 'Origem não permitida.' }, 403, origem);
    if (!env.LIQUID_API_KEY) return resp({ erro: 'Assistente sem configuração.' }, 503, origem);
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
