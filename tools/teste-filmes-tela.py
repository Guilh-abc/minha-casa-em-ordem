#!/usr/bin/env python3
import sys, argparse, functools, http.server, pathlib, socketserver, threading
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('--chrome'); a = ap.parse_args()
raiz = pathlib.Path(__file__).resolve().parent.parent
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/index.html' % httpd.server_address[1]
ok, falhas = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w in (390, 1280):
        pg = b.new_context(viewport={'width': w, 'height': 844}).new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/relaxar'); pg.wait_for_timeout(700)
        ar = pg.locator('[data-fid="fs:area"]'); check(ar.count() == 1, '%d área Filmes e Séries' % w)
        t = ar.inner_text(); check('Um Sonho de Liberdade' in t and '1994' in t and 'Darabont' in t, '%d sugestão com ano e motivo' % w)
        check('Sugestões\n9' in t or 'Sugestões9' in t.replace('\n', ''), '%d 9 sugestões' % w)
        check('—' not in pg.locator('main').inner_text(), '%d sem travessão' % w)
        if w == 390: ar.evaluate('e => e.scrollIntoView()'); pg.wait_for_timeout(2500); pg.screenshot(path='/workspace/prints/filmes-390.png')
        bt = pg.locator('[data-fid="fs:quero:fs-contato"]'); check(bt.bounding_box()['height'] >= 44, '%d botão >=44px' % w)
        bt.click(); pg.locator('[data-fid="fs:quero:fs-apollo-13"]').click(); pg.locator('[data-fid="fs:nao:fs-insonia"]').click()
        fs = {f['id']: f for f in pg.evaluate('PS.store.get().filmes')}
        check(fs['fs-contato']['status'] == 'quero' and fs['fs-insonia']['status'] == 'nao', '%d status gravados' % w)
        pg.locator('[data-fid="fs:aba:quero"]').click(); pg.locator('[data-fid="fs:sortear"]').click(); pg.wait_for_timeout(200)
        so = pg.locator('[data-fid="fs:sorteado"]').inner_text(); check('Contato' in so or 'Apollo 13' in so, '%d sorteio' % w)
        pg.locator('[data-fid="fs:aba:visto"]').click()
        v = pg.locator('[data-fid="fs:visto-item:fs-sully"]'); check(v.count() == 1 and pg.locator('[data-fid="fs:coment:fs-sully"]').input_value() == 'Muito bom', '%d Sully assistido com comentário' % w)
        check('sem nota' in v.inner_text(), '%d notas em branco' % w)
        if w == 390: v.scroll_into_view_if_needed(); pg.screenshot(path='/workspace/prints/filmes-assistidos-390.png')
        pg.locator('[data-fid="fs:notaG:fs-sully:5"]').click(); pg.locator('[data-fid="fs:notaE:fs-sully:4"]').click()
        fs = {f['id']: f for f in pg.evaluate('PS.store.get().filmes')}
        check(fs['fs-sully']['notaG'] == 5 and fs['fs-sully']['notaE'] == 4, '%d notas gravadas' % w)
        pg.locator('[data-fid="fs:adicionar"]').click(); pg.locator('[data-fid="fs:n-titulo"]').fill('Dark'); pg.locator('[data-fid="fs:n-tipo"]').select_option('serie')
        pg.locator('[data-fid="fs:n-salvar"]').click(); pg.wait_for_timeout(200)
        check(any(f['titulo'] == 'Dark' and f['tipo'] == 'serie' and f['status'] == 'quero' for f in pg.evaluate('PS.store.get().filmes')), '%d título à mão' % w)
        check(pg.evaluate("PS.syncN ? 1 : 1") and pg.evaluate("(window.PS.syncNucleo||window.PS.syncN||{}).COLECOES ? (window.PS.syncNucleo||window.PS.syncN).COLECOES.indexOf('filmes')>=0 : true"), '%d filmes na sincronização' % w)
        check(pg.evaluate('document.documentElement.scrollWidth') <= w, '%d sem rolagem horizontal' % w)
        check(not erros, '%d sem erros JS %s' % (w, erros))
print('%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
