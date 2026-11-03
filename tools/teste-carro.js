/* Testes de lógica do Carro (node tools/teste-carro.js) */
var C = require('../js/carro-calc.js'), ok = 0, falha = 0;
function t(c, m) { if (c) ok++; else { falha++; console.log('FALHA ' + m); } }
t(C.precoLitro(250, 50) === 5, 'preço por litro');
t(C.precoLitro(250, 0) === null, 'sem litros');
t(C.proximoVenc('2026-03-10', '2026-11-03') === '2027-03-10', 'repete no ano seguinte');
t(C.proximoVenc('2024-02-29', '2026-01-01') === '2026-02-28', '29/02 vira 28/02');
t(C.proximoVenc('2026-11-15', '2026-11-03') === '2026-11-15', 'futuro mantém');
var it = [{ tipo: 'vencimento', cat: 'ipva', data: '2025-11-10', antec: 15 }, { tipo: 'vencimento', cat: 'seguro', data: '2026-12-30', antec: 15 }];
var a = C.avisos(it, '2026-11-03'); t(a.length === 1 && a[0].dias === 7 && a[0].rotulo === 'IPVA', 'aviso 7 dias antes');
var l = [{ tipo: 'abastecimento', data: '2026-10-01', valor: 200, litros: 40, km: 1000 }, { tipo: 'abastecimento', data: '2026-10-15', valor: 250, litros: 40, km: 1250 },
  { tipo: 'oleo', data: '2026-10-20', valor: 180, km: 1300 }, { tipo: 'multa', data: '2026-09-02', valor: 130.16 }, { tipo: 'pendencia', data: '2026-10-01', valor: 999 }];
var r = C.resumo(l);
t(r.total === 760.16, 'total ' + r.total); t(r.porCat.multa === 130.16 && r.porMes['2026-10'] === 630, 'por categoria e mês');
t(r.ultAbast.data === '2026-10-15' && r.ultOleo.km === 1300, 'últimos');
var s = C.series(l); t(s.consumo.length === 1 && s.consumo[0].v === 6.25 && s.custoKm[0].v === 1, 'séries');
var cfg = C.config([]); t(cfg.consMin === 6.2 && cfg.consMax === 6.3 && cfg.precoAlcool === 3.5 && cfg.tanque === null && cfg.kmMes === 1170 && cfg.oleoAte === '2026-11-07' && cfg.oleoIntervalo === 10000 && cfg.precoGasolina === null, 'padrões');
t(C.tanque(cfg) === null, 'tanque vazio sem autonomia');
cfg.tanque = 50; var tq = C.tanque(cfg); t(tq.kmMin === 310 && tq.kmMax === 315 && tq.encherAlcool === 175, 'autonomia');
var cu = C.custos(C.config([{ tipo: 'config', consMin: 6.2, consMax: 6.3, precoAlcool: 5 }]), 1000); t(cu.alcool.porKm === 0.8 && cu.alcool.por100 === 80 && cu.alcool.mes === 800 && !cu.gasolina, 'custo por km');
t(C.kmMes(l) === 480, 'km por mês ' + C.kmMes(l));
t(C.porMesCat(l, 6).length === 2, 'meses');
var pa = C.proximoAbast(l, cfg, 912); t(pa && pa.data === '2026-10-25' && pa.kmPrevisto === 1563, 'previsão ' + JSON.stringify(pa));
var o = C.oleo([], C.config([]), '2026-11-03'); t(o.urgente && o.dias === 4 && o.ate === '2026-11-07', 'óleo urgente ' + JSON.stringify(o));
var o2 = C.oleo([{ tipo: 'oleo', data: '2026-11-05', km: 1300 }], C.config([{ tipo: 'config', kmAtual: 1500, oleoAte: '2026-11-07' }]), '2026-11-05'); t(!o2.urgente && o2.proxKm === 11300 && o2.restantes === 9800, 'troca lançada apaga o aviso ' + JSON.stringify(o2));
console.log((falha ? 'FALHOU' : 'OK') + ': ' + ok + ' ok, ' + falha + ' falha(s)');
process.exit(falha ? 1 : 0);
