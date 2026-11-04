#!/usr/bin/env python3
"""Teste de digitação nos campos de texto (Gerenciar e outros): nenhuma tecla pode ser engolida por atalhos. Uso: python3 tools/teste-digitar.py [--chrome CAMINHO]"""
import argparse, functools, http.server, pathlib, socketserver, threading, sys
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
TEXTO = 'Comprar arroz e pão 1234567 Rr Menu'
NOVOS = [('tarefas', 'Nova tarefa', 'tarefas', 'titulo'), ('agenda', 'Novo compromisso', 'compromissos', 'titulo')]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for vp in [(390, 844), (1280, 800)]:
        pg = b.new_page(viewport={'width': vp[0], 'height': vp[1]}); erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/gerenciar'); pg.wait_for_timeout(700)
        for aba, rot, col, k in NOVOS:
            pg.evaluate("location.hash='#/gerenciar'"); pg.wait_for_timeout(200)
            pg.locator('[data-fid="ga:%s"]' % aba).click(); pg.wait_for_timeout(250)
            btn = pg.locator('button:has-text("+ %s")' % rot)
            if not btn.count(): check(False, '%s: botão "+ %s" existe' % (aba, rot)); continue
            n0 = pg.evaluate("PS.store.get().%s.length" % col)
            btn.first.click(); pg.wait_for_timeout(250)
            novo = pg.evaluate("PS.store.get().%s.filter(function(x){return !x.%s})[0]" % (col, k))
            check(pg.evaluate("document.activeElement.tagName") == 'INPUT' and pg.evaluate("document.activeElement.value") == '', '[%dpx] %s: foco no campo vazio do item novo' % (vp[0], aba))
            pg.keyboard.type(TEXTO, delay=15); pg.wait_for_timeout(250)
            val = pg.evaluate("(PS.store.get().%s.filter(function(x){return x.id==='%s'})[0]||{}).%s" % (col, novo['id'] if novo else '', k))
            check(val == TEXTO, '[%dpx] %s: texto digitado inteiro no item novo (%r)' % (vp[0], aba, val))
            check(pg.evaluate("PS.store.get().%s.length" % col) == n0 + 1, '[%dpx] %s: um item a mais' % (vp[0], aba))
        # campo Lista (editor de listas) e Enter não perde o texto
        pg.evaluate("location.hash='#/gerenciar'"); pg.wait_for_timeout(200); pg.locator('[data-fid="ga:tarefas"]').click(); pg.wait_for_timeout(250)
        inp = pg.locator('input[aria-label="Nome da lista 1"]')
        if inp.count():
            inp.fill(''); inp.click(); pg.keyboard.type('Mercado rr', delay=15); pg.keyboard.press('Tab'); pg.wait_for_timeout(200)
            check(pg.evaluate("PS.store.get().listas[0]") == 'Mercado rr', '[%dpx] nome de lista aceita "r"' % vp[0])
        check(not erros, '[%dpx] sem erros de JS %s' % (vp[0], erros)); pg.close()
    b.close()
print('\n%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
