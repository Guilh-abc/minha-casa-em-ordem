#!/usr/bin/env python3
import sys, argparse, functools, http.server, pathlib, socketserver, threading, json
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('--chrome'); a = ap.parse_args()
raiz = pathlib.Path(__file__).resolve().parent.parent
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/index.html' % httpd.server_address[1]
link = open('/workspace/backups/compra-wms-link.txt').read().strip()
ok, falhas = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    pg = b.new_context(viewport={'width': 390, 'height': 844}).new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(base + '#/compras'); pg.wait_for_timeout(600)
    pg.evaluate("localStorage.setItem('mco-autor','Guilherme')")
    pg.goto(base + '#/compras/nota=' + link); pg.wait_for_timeout(900)
    check(pg.locator('[data-fid="nt:editor"]').count() == 1, 'editor aberto pelo link')
    check('nota=' not in pg.url, 'hash limpo')
    pg.get_by_role('button', name='Salvar').last.click(); pg.wait_for_timeout(800)
    ns = pg.evaluate("PS.store.get().notas")
    check(len(ns) == 1, 'uma compra gravada (%d)' % len(ns))
    n = ns[0] if ns else {}
    check(len(n.get('itens', [])) == 151, 'itens 151 (%d)' % len(n.get('itens', [])))
    check(abs((n.get('total') or 0) - 1404.46) < 0.001, 'total %s' % n.get('total'))
    check(n.get('desconto') == 7, 'desconto %s' % n.get('desconto'))
    check(n.get('por') == 'Guilherme', 'autor %s' % n.get('por'))
    check(round(sum(x['total'] for x in n.get('itens', [])), 2) == 1404.46, 'soma linhas')
    pg.wait_for_timeout(500); pg.reload(); pg.wait_for_timeout(800)
    check(pg.locator('[data-fid="nt:editor"]').count() == 0, 'não reabre')
    txt = pg.inner_text('body'); check('1.404,46' in txt, 'mês mostra 1.404,46')
    pg.screenshot(path='/workspace/prints/notas-link-390.png', full_page=True)
    check(not erros, 'sem erros JS %s' % erros)
print('%d/%d' % (len(ok), len(ok) + len(falhas))); sys.exit(1 if falhas else 0)
