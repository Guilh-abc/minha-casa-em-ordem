/* node tools/teste-assistente-worker.mjs  byGui */
import { montarCorpo, config, montarGemini, lerGemini } from '../assistente-worker/worker.js';
var PARAMS = config().PARAMS, SISTEMA = config().SISTEMA;
var ok = 0, f = 0; function t(n, c) { if (c) ok++; else { f++; console.log('  FALHA ' + n); } }
var o = montarCorpo({ mensagens: [{ papel: 'user', texto: 'oi' }], contexto: 'X', hoje: 'sexta-feira, 30/10/2026' });
t('max_tokens <= 300', o.max_tokens <= 300);
t('penalidade de repetição', o.frequency_penalty > 0 && o.repetition_penalty > 1);
t('stop com reticências', o.stop.indexOf('...') >= 0 && o.stop.indexOf('…') >= 0);
t('prompt PT-BR curto', /português do Brasil/.test(SISTEMA) && SISTEMA.length < 1400);
t('hoje no sistema', /Hoje é sexta-feira, 30\/10\/2026/.test(o.messages[0].content));
t('sem pergunta => null', montarCorpo({ mensagens: [] }) === null);
t('sem pensar', o.chat_template_kwargs.enable_thinking === false);
/* Gemini (/conversa) */
var g = montarGemini({ turnos: [{ r: 'model', t: 'antes' }, { r: 'user', t: 'tem conta atrasada?' }, { r: 'model', fc: [{ n: 'listar_contas', a: { status: 'atrasadas' }, s: 'SIG' }] }, { r: 'tool', fr: [{ n: 'listar_contas', res: { total: 0 } }] }], hoje: 'sexta-feira, 30/10/2026' });
t('gemini: descarta model inicial', g.contents[0].role === 'user' && g.contents.length === 3);
t('gemini: mantém thoughtSignature', g.contents[1].parts[0].thoughtSignature === 'SIG' && g.contents[1].parts[0].functionCall.name === 'listar_contas');
t('gemini: functionResponse como user', g.contents[2].role === 'user' && g.contents[2].parts[0].functionResponse.response.total === 0);
t('gemini: hoje no sistema + semana +7', /30\/10\/2026/.test(g.systemInstruction.parts[0].text) && /7/.test(g.systemInstruction.parts[0].text));
t('gemini: 5 ferramentas', g.tools[0].functionDeclarations.length === 5);
t('gemini: vazio => null', montarGemini({ turnos: [] }) === null && montarGemini({}) === null);
t('gemini: resultado enorme vira erro', montarGemini({ turnos: [{ r: 'user', t: 'x' }, { r: 'tool', fr: [{ n: 'a', res: { s: 'x'.repeat(30000) } }] }] }).contents[1].parts[0].functionResponse.response.erro);
t('ler: chamada', lerGemini({ candidates: [{ content: { parts: [{ functionCall: { name: 'proximo_evento' }, thoughtSignature: 'Z' }] } }] }).chamadas[0].s === 'Z');
t('ler: ignora thought', lerGemini({ candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: 'Olá' }] } }] }).resposta === 'Olá');
t('ler: vazio null', lerGemini({}) === null);
console.log(ok + ' ok, ' + f + ' falhas'); process.exit(f ? 1 : 0);
