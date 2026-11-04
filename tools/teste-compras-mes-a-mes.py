#!/usr/bin/env python3
"""Compras feitas mês a mês: lista de meses com total e nº de notas, total geral, expandir mês, estado vazio. Só dados de teste.
Uso: python3 tools/teste-compras-mes-a-mes.py [--chrome CAMINHO] [--prints PASTA]"""
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
def it(n, v): return "{nome:'%s',qtd:1,unit:%s,total:%s}" % (n, v, v)
DADOS = "PS.store.alterar(function(s){s.notas=[" + ",".join([
  "{id:'n1',loja:'Mercado Exemplo',data:'2026-11-03',total:250.40,itens:[%s,%s],origem:'mao'}" % (it('Arroz (exemplo)', 150.40), it('Feijão (exemplo)', 100)),
  "{id:'n2',loja:'Padaria Exemplo',data:'2026-11-01',total:32.10,itens:[%s],origem:'mao'}" % it('Pão (exemplo)', 32.10),
  "{id:'n3',loja:'Mercado Exemplo',data:'2026-10-28',total:410,itens:[%s],origem:'mao'}" % it('Compra do mês (exemplo)', 410),
  "{id:'n4',loja:'Feira Exemplo',data:'2026-10-05',total:58.90,itens:[%s],origem:'mao'}" % it('Frutas (exemplo)', 58.90),
  "{id:'n5',loja:'Mercado Exemplo',data:'2026-08-15',total:199.99,itens:[%s],origem:'mao'}" % it('Limpeza (exemplo)', 199.99)]) + "];},true);"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2); erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    L = lambda f: pg.locator('[data-fid="%s"]' % f)
    pg.goto(base + '#/'); pg.wait_for_timeout(600)
    pg.evaluate("PS.store.alterar(function(s){s.notas=[];},true)"); pg.evaluate("location.hash='#/compras'"); pg.wait_for_timeout(500)
    check(L('nt:vazio').count() == 1 and L('nt:registrar').count() == 1, 'sem compras: estado vazio e Registrar nota')
    pg.evaluate(DADOS); pg.evaluate("location.hash='#/tarefas'"); pg.wait_for_timeout(200); pg.evaluate("location.hash='#/compras'"); pg.wait_for_timeout(500)
    ms = pg.eval_on_selector_all('.nt-mes-item', 'e=>e.map(x=>x.getAttribute("data-fid"))')
    check(ms == ['nt:m:2026-11', 'nt:m:2026-10', 'nt:m:2026-08'], 'meses com compra, mais recente primeiro, sem setembro (%s)' % ms)
    check('R$ 951,39' in L('nt:total-geral').inner_text() and '5 notas' in L('nt:total-geral').inner_text(), 'total geral %r' % L('nt:total-geral').inner_text())
    s11, s10 = L('nt:sum:2026-11').inner_text(), L('nt:sum:2026-10').inner_text()
    check('R$ 282,50' in s11 and '2 notas' in s11 and 'R$ 468,90' in s10 and '2 notas' in s10, 'total e notas por mês %r %r' % (s11, s10))
    check(L('nt:m:2026-11').get_attribute('open') is not None and L('nt:m:2026-10').get_attribute('open') is None, 'mês mais recente aberto, os outros recolhidos')
    check(L('nt:mes-ant').count() == 0, 'sem setas de mês')
    L('nt:sum:2026-10').click(); pg.wait_for_timeout(200)
    check(L('nt:c:n3').is_visible() and L('nt:c:n4').is_visible(), 'tocar no mês mostra todas as notas dele')
    sw = pg.evaluate('document.documentElement.scrollWidth'); check(sw <= 390, 'sem rolagem horizontal (%d)' % sw)
    if a.prints:
        pg.wait_for_timeout(2200); L('nt:secao').scroll_into_view_if_needed(); pg.evaluate("document.querySelector('[data-fid=\"nt:secao\"]').scrollIntoView()"); pg.wait_for_timeout(300)
        pg.screenshot(path=a.prints + '/casa-compras-mes-a-mes-390.png')
    check(not erros, 'sem erros de JS %s' % erros[:2])
    b.close()
print('\n%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
