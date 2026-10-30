#!/usr/bin/env python3
"""Teste headless das contas fixas sugeridas: carga automática única, botão idempotente, desfazer, forma de pagamento (selo/filtro/edição),
destaque em "Atenção agora", sanear. Uso: python3 tools/teste-contas-fixas.py [--chrome CAMINHO]"""
import argparse, functools, http.server, pathlib, socketserver, threading
from playwright.sync_api import sync_playwright
raiz = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument('--chrome'); a = ap.parse_args()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/index.html' % httpd.server_address[1]
ok, falhas = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)
FIX = "PS.store.get().contas.filter(function(c){return c.fixa})"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 720}); pg = ctx.new_page(); erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(base + '#/'); pg.wait_for_selector('.hoje'); pg.wait_for_timeout(400)
    cs = pg.evaluate("PS.store.get().contas")
    check(len(cs) == 11 and all(c['fixa'] and c['valor'] is None and not c['exemplo'] for c in cs), '1ª abertura: 11 contas fixas, sem valores, sem exemplos')
    check(pg.evaluate("PS.store.get().config.fixasAuto === true && PS.store.get().config.fixasAviso === true"), 'flags fixasAuto/fixasAviso gravadas')
    check(sorted(c['titulo'] for c in cs)[:2] == ['Aluguel', 'Cartão Itaú Black'], 'nomes genéricos')
    ip = [c for c in cs if c['fixa'] == 'ipva'][0]
    check(ip['anual'] and ip['mes'] == 7 and not ip['mensal'], 'IPVA é anual em julho')
    # Atenção agora = primeiros itens de pendencias (≤5 dias destacados)
    top = pg.evaluate("PS.fin.pendencias(PS.store.get(), PS.u.hoje(), 7).slice(0,1).map(function(p){return p.titulo})")
    if top: check(top[0] in pg.inner_text('.atencao'), 'Atenção agora lista a conta mais urgente (%s)' % top[0])
    check('sem valor' in pg.text_content('.atencao').lower(), '"sem valor" discreto em Atenção agora')
    # recarregar: não duplica nem recarrega
    pg.evaluate("location.hash='#/'"); pg.reload(); pg.wait_for_selector('.hoje'); pg.wait_for_timeout(400)
    check(pg.evaluate("PS.store.get().contas.length") == 11, 'reabrir não duplica')
    # Contas a pagar: aviso, selos, filtro
    pg.evaluate("location.hash='#/contas'"); pg.wait_for_selector('.conta-linha'); pg.wait_for_timeout(300)
    check(pg.locator('.aviso-fixas').count() == 1 and pg.locator('[data-fid="fx:desfazer"]').count() == 1, 'aviso discreto com botão Desfazer')
    check(pg.locator('.conta-linha .selo.forma').count() >= 8, 'selo da forma de pagamento nas linhas')
    pg.select_option('[data-fid="fx:filtro"]', 'pix'); pg.wait_for_timeout(300)
    nl = pg.locator('.conta-linha').count()
    check(nl >= 2 and all(t == 'Pix' for t in pg.eval_on_selector_all('.conta-linha .selo.forma', 'els=>els.map(e=>e.textContent.trim())')), 'filtro por forma (Pix): %d linhas' % nl)
    pg.select_option('[data-fid="fx:filtro"]', ''); pg.wait_for_timeout(300)
    check(pg.locator('.conta-linha').count() > nl, 'filtro "todas" volta tudo')
    # aviso por forma: simula data para "gerar" (5 dias antes) e débito (≤2 dias)
    r = pg.evaluate("""(function(){var s=PS.store.get(),h=PS.u.hoje();var iptu=s.contas.filter(function(c){return c.fixa==='iptu'})[0];
      iptu.dia=+PS.u.somaDias(h,5).slice(8);var luz=s.contas.filter(function(c){return c.fixa==='luz'})[0];luz.dia=+PS.u.somaDias(h,1).slice(8);
      return PS.fin.pendencias(s,h,7).filter(function(p){return p.id==='fixa-iptu'||p.id==='fixa-luz'}).map(function(p){return p.aviso})})()""")
    check('Gerar o boleto' in r and 'Confira o saldo na conta' in r, 'avisos por forma calculados: %s' % r)
    # desfazer
    pg.locator('[data-fid="fx:desfazer"]').click(); pg.wait_for_timeout(400)
    check(pg.evaluate(FIX + ".length") == 0 and pg.locator('.aviso-fixas').count() == 0, 'Desfazer remove as fixas e o aviso')
    pg.evaluate("location.hash='#/'"); pg.reload(); pg.wait_for_selector('.hoje'); pg.wait_for_timeout(400)
    check(pg.evaluate("PS.store.get().contas.length") == 0, 'depois de desfazer, reabrir NÃO recarrega (carga única)')
    # botão idempotente
    pg.evaluate("location.hash='#/contas'"); pg.wait_for_selector('[data-fid="fx:add"]')
    pg.locator('[data-fid="fx:add"]').click(); pg.wait_for_timeout(400)
    check(pg.evaluate("PS.store.get().contas.length") == 11, 'botão "Adicionar contas fixas sugeridas" cria as 11')
    check(pg.locator('[data-fid="fx:add"]').count() == 0, 'botão some quando não falta nenhuma')
    check(pg.evaluate("PS.fin.adicionarFixas(PS.store.get(), PS.u.hoje()).adicionadas") == 0 and pg.evaluate("PS.store.get().contas.length") == 11, 'segundo clique não duplica')
    pg.evaluate("PS.store.alterar(function(s){s.contas=s.contas.filter(function(c){return c.fixa!=='agua'})})"); pg.wait_for_timeout(200); pg.evaluate("PS.redesenhar()"); pg.wait_for_timeout(300)
    pg.locator('[data-fid="fx:add"]').click(); pg.wait_for_timeout(300)
    check(pg.evaluate("PS.store.get().contas.length") == 11, 'só repõe a que faltava')
    # Gerenciar: editar forma/obs, arquivar, excluir
    pg.evaluate("location.hash='#/gerenciar/contas'"); pg.wait_for_selector('[data-fid="fx:add-ger"]'); pg.wait_for_timeout(300)
    check(pg.locator('[data-fid="fx:add-ger"]').is_disabled(), 'em Gerenciar o botão fica desativado quando já adicionadas')
    nomes = pg.evaluate("Array.prototype.map.call(document.querySelectorAll('.bloco'), function(b){return b.querySelector('h3')&&b.querySelector('h3').textContent})")
    check('Contas de casa' in nomes, 'bloco "Contas de casa" em Gerenciar')
    blk = pg.locator('.bloco:has(h3:text("Contas de casa")) .form-linha').first
    sels = blk.locator('select')
    check(blk.locator('label:has-text("Forma de pagamento")').count() == 1 and blk.locator('label:has-text("Banco / observação")').count() == 1, 'campos Forma de pagamento e Banco/observação')
    first_id = pg.evaluate("PS.fin.proximoVencimento && PS.store.get().contas.slice().sort(function(a,b){return PS.fin.proximoVencimento(a,PS.u.hoje())<PS.fin.proximoVencimento(b,PS.u.hoje())?-1:1})[0].id")
    blk.locator('label:has-text("Forma de pagamento") select').select_option('outro'); pg.wait_for_timeout(200)
    blk.locator('label:has-text("Banco / observação") input').fill('Banco teste'); pg.wait_for_timeout(200)
    c0 = pg.evaluate("PS.store.get().contas.filter(function(c){return c.id==='%s'})[0]" % first_id)
    check(c0['forma'] == 'outro' and c0['obs'] == 'Banco teste', 'edição da forma e do banco/observação persiste (1ª da lista = próximo vencimento)')
    blk.locator('label:has-text("Arquivada") input').check(); pg.wait_for_timeout(200)
    check(pg.evaluate("PS.fin.pendencias(PS.store.get(),PS.u.hoje(),400).filter(function(p){return p.id==='%s'}).length" % first_id) == 0, 'arquivada some das pendências')
    # sanear
    sn = pg.evaluate("PS.store.sanearItem('contas','x',{id:'x',titulo:'T',forma:'zzz',obs:new Array(100).join('a'),anual:true,mes:99,fixa:'Ruim!',cartaoRef:'c'})")
    check(sn['forma'] == '' and len(sn['obs']) == 60 and sn['anual'] and sn['mes'] == 12 and sn['fixa'] == '', 'sanear: forma inválida, obs 60, mês 1–12, chave inválida')
    sn = pg.evaluate("PS.store.sanearItem('contas','y',{id:'y',titulo:'T'})")
    check(sn['forma'] == '' and sn['valor'] is None and sn['arquivada'] is False, 'sanear: conta antiga continua válida, sem valor')
    # link de configuração não carrega campos vazios
    check(pg.evaluate("PS.store.montarPayload().contas.every(function(c){return !('cartaoRef' in c) || c.cartaoRef})"), 'payload do link enxuto')
    check(not erros, 'sem erros de página %s' % erros)
    b.close()
print('\n%d ok, %d falhas' % (len(ok), len(falhas))); raise SystemExit(1 if falhas else 0)
