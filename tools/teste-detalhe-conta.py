#!/usr/bin/env python3
"""Teste de tela: Família > Contas, tocar no cartão abre o detalhe com Editar; Marcar paga continua direto. Uso: python3 tools/teste-detalhe-conta.py [--chrome CAMINHO] [--prints PASTA]  byGui"""
import argparse, functools, http.server, pathlib, socketserver, threading, sys
from playwright.sync_api import sync_playwright
raiz = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument('--chrome'); ap.add_argument('--prints'); a = ap.parse_args()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/index.html' % httpd.server_address[1]
ok, falhas = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)
DADOS = """PS.store.alterar(function(s){var h=PS.u.hoje(),m=PS.u.ym(h),ant=PS.u.somaMes(m,-1),ant2=PS.u.somaMes(m,-2);
 var pg={};pg[ant]=PS.u.somaDias(h,-25);pg[ant2]=PS.u.somaDias(h,-55);var vs={};vs[ant]=118.4;
 s.contas=[{id:'cx',titulo:'Luz',mensal:true,anual:false,mes:0,dia:+PS.u.somaDias(h,3).slice(8),data:'',valor:120,paga:false,pagas:pg,valores:vs,desde:'',cat:'casa',dono:'casal',forma:'debito',obs:'Bradesco',cartaoRef:'',arquivada:false}];
 s.faturas=[];s.lembretes=[];},true);"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w, hh in [(390, 844), (1280, 800)]:
        pg = b.new_page(viewport={'width': w, 'height': hh}); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/'); pg.wait_for_timeout(700); pg.evaluate(DADOS); pg.evaluate("location.hash='#/familia'"); pg.wait_for_timeout(400)
        pg.locator('[data-fid="fa:abertas"]').click(); pg.wait_for_timeout(250)
        card = pg.locator('[data-fid^="dc:cx"]').first
        bb = card.bounding_box()
        check(card.count() == 1 and bb['height'] >= 44 and card.get_attribute('aria-label') == 'Ver detalhes de Luz', '[%d] cartão é botão 44px com aria-label' % w)
        card.click(); pg.wait_for_timeout(250)
        t = pg.locator('.modal [data-fid="dc:corpo"]').inner_text().replace('\xa0', ' ')
        check(all(x in t for x in ['Luz', 'R$', 'Casa/contas', 'Débito aut', 'Todo mês, dia', 'Bradesco', 'Histórico de pagamentos', 'pago em']), '[%d] detalhe mostra nome, valor, categoria, forma, recorrência, obs e histórico' % w)
        check(pg.locator('[data-fid="dc:hist"] li').count() == 2 and 'R$ 118,40' in t, '[%d] histórico com 2 pagamentos e valor do mês' % w)
        check(pg.evaluate("document.activeElement.getAttribute('data-fid')") == 'dc:editar', '[%d] foco vai para Editar' % w)
        if a.prints: pg.screenshot(path=a.prints + '/contas-detalhe-%d.png' % w)
        pg.locator('[data-fid="dc:editar"]').click(); pg.wait_for_timeout(200)
        f = pg.locator('[data-fid="dc:form"]')
        check(f.count() == 1 and f.locator('input, select').count() >= 8, '[%d] Editar abre o mesmo formulário de Gerenciar' % w)
        inp = f.locator('label:has-text("Valor (R$)") input'); inp.fill('135.5'); inp.dispatch_event('input')
        ob = f.locator('label:has-text("Banco / observação") input'); ob.fill('Pagar no app'); ob.dispatch_event('input')
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/contas-editar-390.png')
        pg.locator('[data-fid="dc:concluir"]').click(); pg.wait_for_timeout(200)
        c = pg.evaluate("PS.store.get().contas[0]")
        check(c['valor'] == 135.5 and c['obs'] == 'Pagar no app' and isinstance(c['pagas'], dict) and len(c['pagas']) == 2, '[%d] salvou no mesmo formato (valor, obs, pagas intacto)' % w)
        check('R$ 135,50' in pg.locator('[data-fid="dc:corpo"]').inner_text().replace('\xa0', ' '), '[%d] detalhe atualizado após editar' % w)
        pg.locator('.modal .acoes button:has-text("Fechar")').last.click(); pg.wait_for_timeout(300)
        check(pg.locator('.modal').count() == 0 and 'R$ 135,50' in pg.locator('.conta-linha').all_inner_texts()[0].replace('\xa0', ' ') + ' '.join(pg.locator('.conta-linha').all_inner_texts()).replace('\xa0', ' '), '[%d] fechar atualiza a lista' % w)
        pg.locator('[data-fid^="mp:contacx"]').first.click(); pg.wait_for_timeout(200)
        check('Marcar como paga?' in pg.locator('.modal h2').inner_text(), '[%d] Marcar paga abre só a confirmação, sem detalhe' % w)
        pg.locator('.modal .acoes button:has-text("Marcar como paga")').click(); pg.wait_for_timeout(300)
        check(pg.locator('[data-fid="fa:pagas"]').count() == 1 and len(pg.evaluate("PS.store.get().contas[0].pagas")) == 3, '[%d] Marcar paga continua funcionando' % w)
        pg.locator('[data-fid="fa:pagas"]').click(); pg.wait_for_timeout(250)
        pg.locator('[data-fid^="dc:cx"]').first.click(); pg.wait_for_timeout(200)
        check(pg.locator('[data-fid="dc:hist"] li').count() == 3, '[%d] detalhe também abre em Pagas, com o novo pagamento' % w)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        sw = pg.evaluate('document.documentElement.scrollWidth'); check(sw <= w, '[%d] sem rolagem horizontal (%d)' % (w, sw))
        check(not erros, '[%d] sem erros de JS %s' % (w, erros)); pg.close()
    b.close()
print('\n%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
