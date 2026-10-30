/* node tools/teste-assistente-worker.mjs  byGui */
import { montarCorpo, PARAMS, SISTEMA } from '../assistente-worker/worker.js';
var ok = 0, f = 0; function t(n, c) { if (c) ok++; else { f++; console.log('  FALHA ' + n); } }
var o = montarCorpo({ mensagens: [{ papel: 'user', texto: 'oi' }], contexto: 'X', hoje: 'sexta-feira, 30/10/2026' });
t('max_tokens <= 300', o.max_tokens <= 300);
t('penalidade de repetição', o.frequency_penalty > 0 && o.repetition_penalty > 1);
t('stop com reticências', o.stop.indexOf('...') >= 0 && o.stop.indexOf('…') >= 0);
t('prompt PT-BR curto', /português do Brasil/.test(SISTEMA) && SISTEMA.length < 1400);
t('hoje no sistema', /Hoje é sexta-feira, 30\/10\/2026/.test(o.messages[0].content));
t('sem pergunta => null', montarCorpo({ mensagens: [] }) === null);
t('sem pensar', o.chat_template_kwargs.enable_thinking === false);
console.log(ok + ' ok, ' + f + ' falhas'); process.exit(f ? 1 : 0);
