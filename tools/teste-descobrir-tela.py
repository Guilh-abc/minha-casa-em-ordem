#!/usr/bin/env python3
# Descobrir: TMDB simulada (rota interceptada), arrastar com o mouse/dedo, botões, desfazer, exclusões e atribuição.
import sys, json, argparse, functools, http.server, pathlib, socketserver, threading, urllib.parse
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('--chrome'); ap.add_argument('--print'); a = ap.parse_args()
raiz = pathlib.Path(__file__).resolve().parent.parent
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/index.html' % httpd.server_address[1]
PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
def item(i, t, g, tv=False):
    d = {'id': i, 'poster_path': '/p%d.jpg' % i, 'genre_ids': g, 'vote_count': 900, 'vote_average': 7.8, 'overview': 'Sinopse de teste do título %d.' % i}
    d.update({'name': t, 'first_air_date': '2019-01-01'} if tv else {'title': t, 'release_date': '2010-05-01'})
    return d
REC = [item(1001, 'Filme Recomendado A', [53, 18]), item(1002, 'Animação Proibida', [16, 35]), item(278, 'Um Sonho de Liberdade', [18]), item(1003, 'Filme Recomendado B', [28])]
DISC = [item(2001, 'Série Boa', [80, 18], True), item(2002, 'Musical Proibido', [10402, 18]), item(2003, 'Ficção Boa', [878])]
pedidos = []
def rota(r):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(r.request.url).query); p = q.get('p', [''])[0]; pedidos.append(p)
    if p.endswith('/recommendations'): body = {'results': REC}
    elif p.startswith('discover/'): body = {'results': [d for d in DISC if ('name' in d) == (p == 'discover/tv')]}
    else:
        tm, i = p.split('/')[:2]
        body = {'id': int(i), 'genres': [{'name': 'Suspense'}], 'runtime': 118, 'created_by': [{'name': 'Criadora Teste'}],
                'credits': {'crew': [{'job': 'Director', 'name': 'Diretor Teste'}], 'cast': [{'name': 'Ator Um'}, {'name': 'Atriz Dois'}, {'name': 'Ator Três'}, {'name': 'Ator Quatro'}]},
                'watch/providers': {'results': {'BR': {'flatrate': [{'provider_name': 'Netflix'}]}}}}
    r.fulfill(status=200, content_type='application/json', body=json.dumps(body))
ok, falhas = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)
def titulo(pg):
    pg.locator('[data-fid="ds:cartao"]').scroll_into_view_if_needed(); return pg.locator('[data-fid="ds:cartao"] .ds-titulo').inner_text()
def filmes(pg): return {f['id']: f for f in pg.evaluate('PS.store.get().filmes')}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w in (390, 1280):
        pg = b.new_context(viewport={'width': w, 'height': 844}, has_touch=True).new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.route('**/tmdb?**', rota)
        pg.route('https://image.tmdb.org/**', lambda r: r.fulfill(status=200, content_type='image/png', body=__import__('base64').b64decode(PX)))
        pg.goto(base + '#/relaxar'); pg.wait_for_timeout(1500)
        cart = pg.locator('[data-fid="ds:cartao"]'); check(cart.count() == 1, '%d cartão aparece' % w)
        txt = pg.locator('[data-fid="ds:area"]').inner_text()
        check('Animação Proibida' not in json.dumps(pg.evaluate('PS.descobrir._fila().map(function(c){return c.titulo})')) and 'Musical Proibido' not in json.dumps(pg.evaluate('PS.descobrir._fila().map(function(c){return c.titulo})')), '%d sem animação e musical' % w)
        check('Um Sonho de Liberdade' not in json.dumps(pg.evaluate('PS.descobrir._fila().map(function(c){return c.titulo})')), '%d exclui o que já está na lista' % w)
        check(all(s in txt for s in ['TMDB 7,8', 'Diretor Teste', 'Ator Um', 'Netflix', 'Sinopse de teste', 'Onde assistir']) or ('Criadora Teste' in txt and 'Netflix' in txt), '%d cartão completo: %s' % (w, txt[:160].replace('\n', ' | ')))
        check(any(s in txt for s in ['Porque vocês gostaram de', 'Parecido com', 'como vocês curtem', 'Série', 'Ficção', 'Drama', 'Desastre', 'história real']), '%d motivo da sugestão' % w)
        check('não é endossado nem certificado pela TMDB' in txt, '%d atribuição TMDB' % w)
        check('—' not in pg.locator('main').inner_text(), '%d sem travessão' % w)
        for f in ('ds:nao', 'ds:quero', 'ds:visto', 'ds:desfazer'):
            bb = pg.locator('[data-fid="%s"]' % f).bounding_box(); check(bb['height'] >= 44 and bb['width'] >= 44, '%d botão %s >=44px' % (w, f))
        if w == 390 and a.print: pg.locator('[data-fid="fs:area"]').evaluate('e => e.scrollIntoView()'); pg.wait_for_timeout(2500); pg.screenshot(path=a.print)
        # arrastar para a direita (mouse)
        t1 = titulo(pg); bb = cart.bounding_box(); x, y = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 3
        pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 60, y, steps=4); pg.mouse.move(x + 180, y, steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
        st = [f for f in filmes(pg).values() if f['titulo'] == t1]
        check(st and st[0]['status'] == 'quero' and st[0]['tmdb'] and st[0]['poster'], '%d arrastar à direita: Quero ver (%s)' % (w, t1))
        # arrastar para a esquerda (toque via eventos de ponteiro)
        t2 = titulo(pg); bb = pg.locator('[data-fid="ds:cartao"]').bounding_box(); x, y = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 3
        pg.locator('[data-fid="ds:cartao"]').evaluate('''(el, a) => { const o = { pointerId: 7, pointerType: 'touch', bubbles: true, isPrimary: true };
          el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: a[0], clientY: a[1] }, o)));
          [40, 100, 160].forEach(d => el.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: a[0] - d, clientY: a[1] }, o))));
          el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ clientX: a[0] - 160, clientY: a[1] }, o))); }''', [x, y]); pg.wait_for_timeout(500)
        st = [f for f in filmes(pg).values() if f['titulo'] == t2]
        check(st and st[0]['status'] == 'nao', '%d arrastar à esquerda (toque): descartado (%s)' % (w, t2))
        # arrasto curto não decide
        t3 = titulo(pg); bb = pg.locator('[data-fid="ds:cartao"]').bounding_box(); x, y = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 3
        pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 30, y, steps=3); pg.mouse.up(); pg.wait_for_timeout(300)
        check(titulo(pg) == t3, '%d arrasto curto volta ao lugar' % w)
        pg.locator('[data-fid="ds:desfazer"]').click(); pg.wait_for_timeout(200)
        check(titulo(pg) == t2 and not [f for f in filmes(pg).values() if f['titulo'] == t2], '%d desfazer devolve o cartão' % w)
        pg.locator('[data-fid="ds:visto"]').click(); pg.wait_for_timeout(200)
        st = [f for f in filmes(pg).values() if f['titulo'] == t2]; check(st and st[0]['status'] == 'visto' and st[0]['data'], '%d Já assistimos' % w)
        t4 = titulo(pg); pg.locator('[data-fid="ds:quero"]').click(); pg.wait_for_timeout(200)
        check([f for f in filmes(pg).values() if f['titulo'] == t4][0]['status'] == 'quero', '%d coração: Quero ver %s %s' % (w, t4, [(f['titulo'], f['status']) for f in filmes(pg).values() if f['id'].startswith('tm-')]))
        t5 = titulo(pg) if pg.locator('[data-fid="ds:cartao"]').count() else ''
        if t5: pg.locator('[data-fid="ds:nao"]').click(); pg.wait_for_timeout(200); check([f for f in filmes(pg).values() if f['titulo'] == t5][0]['status'] == 'nao', '%d X: descarta' % w)
        check(any(x.endswith('/recommendations') for x in pedidos) and any(x.startswith('discover/') for x in pedidos), '%d usa recommendations e discover' % w)
        check(pg.evaluate("PS.store.sanear({filmes:[{id:'tm-movie-1',titulo:'X',status:'quero',tmdb:1,tm:'movie',poster:'javascript:x'}]}).filmes[0].poster") == '', '%d pôster saneado' % w)
        pg.locator('[data-fid="fs:aba:quero"]').click(); check(t1 in pg.locator('[data-fid="fs:area"]').inner_text(), '%d aprovado aparece em Quero ver' % w)
        check(pg.evaluate('document.documentElement.scrollWidth') <= w, '%d sem rolagem horizontal' % w)
        check(not erros, '%d sem erros JS %s' % (w, erros))
print('%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
