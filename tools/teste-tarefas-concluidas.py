#!/usr/bin/env python3
"""Tela de Tarefas: filtro sempre em Todos (ao abrir e ao voltar à aba), concluídas (comuns e recorrentes) só em Concluídas, e barra de ícones.
Uso: python3 tools/teste-tarefas-concluidas.py [--chrome CAMINHO] [--prints PASTA]"""
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
DADOS = """PS.store.alterar(function(s){var h=PS.u.hoje(),d=PS.u.somaDias;
 s.listas=['Casa','Trabalho','Maria Alice'];
 s.tarefas=[{id:'r1',lista:'Trabalho',titulo:'Comprovante da escola (exemplo)',prio:'media',vence:d(h,2),feita:false,repete:'mensal',exemplo:true},
 {id:'t2',lista:'Casa',titulo:'Piso da laje (exemplo)',prio:'media',vence:d(h,9),feita:false,exemplo:true},
 {id:'t3',lista:'Maria Alice',titulo:'Vacina (exemplo)',prio:'media',vence:d(h,3),feita:false,exemplo:true},
 {id:'t4',lista:'Casa',titulo:'Lâmpada (exemplo)',prio:'baixa',vence:'',feita:true,exemplo:true}];},true);"""
def ativas(pg): return pg.eval_on_selector_all('.item.tarefa:not(.concluidas .item)', 'e=>e.map(x=>x.getAttribute("data-fid"))')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w in (360, 390):
        pg = b.new_page(viewport={'width': w, 'height': 844}, device_scale_factor=2); erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/'); pg.wait_for_timeout(600); pg.evaluate(DADOS)
        pg.evaluate("location.hash='#/tarefas'"); pg.wait_for_timeout(400)
        check(pg.get_attribute('[data-fid="aba:__todos"]', 'aria-selected') == 'true', '[%d] abre em Todos' % w)
        check(ativas(pg) == ['tr:r1', 'tr:t3', 'tr:t2'], '[%d] concluída comum fora da lista ativa %s' % (w, ativas(pg)))
        pg.locator('[data-fid="tr:r1"]').click(); pg.wait_for_timeout(300)
        at = ativas(pg)
        check(len(at) == 3 and 'tr:r1' not in at, '[%d] recorrente concluída sai da lista; só a próxima fica (%s)' % (w, at))
        check(pg.locator('.concluidas [data-fid="tr:r1"]').count() == 1 and pg.locator('.concluidas summary small').inner_text() == '2', '[%d] Concluídas tem 2 (recorrente e comum)' % w)
        check(not pg.evaluate("document.querySelector('.concluidas').open"), '[%d] Concluídas começa recolhida' % w)
        check(pg.locator('.item.tarefa.feito:visible').count() == 0, '[%d] nenhuma riscada visível na lista' % w)
        pg.locator('[data-fid="tm:quadro"]').click(); pg.wait_for_timeout(250)
        check(pg.locator('[data-fid="qt:r1"]').count() == 0 and pg.locator('[data-fid="qt:t4"]').count() == 0, '[%d] Quadro sem concluídas' % w)
        pg.locator('[data-fid="tm:lista"]').click(); pg.wait_for_timeout(200)
        if a.prints and w == 390:
            pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(2200); pg.screenshot(path=a.prints + '/casa-barra-icones-tarefas-390.png')
            pg.locator('.concluidas summary').click(); pg.wait_for_timeout(200)
            pg.screenshot(path=a.prints + '/casa-barra-icones-tarefas-concluidas-390.png', full_page=True)
            pg.locator('.concluidas summary').click()
        # filtro: escolhe Casa, sai e volta: Todos de novo
        pg.locator('[data-fid="aba:Casa"]').click(); pg.wait_for_timeout(200)
        check(pg.get_attribute('[data-fid="aba:Casa"]', 'aria-selected') == 'true', '[%d] escolheu Casa' % w)
        pg.evaluate("location.hash='#/agenda'"); pg.wait_for_timeout(250); pg.evaluate("location.hash='#/tarefas'"); pg.wait_for_timeout(300)
        check(pg.get_attribute('[data-fid="aba:__todos"]', 'aria-selected') == 'true', '[%d] voltar à aba reabre em Todos' % w)
        pg.locator('[data-fid="aba:Casa"]').click(); pg.wait_for_timeout(150); pg.reload(); pg.wait_for_timeout(700)
        check(pg.get_attribute('[data-fid="aba:__todos"]', 'aria-selected') == 'true', '[%d] reabrir o app volta em Todos' % w)
        # barra de ícones
        m = pg.evaluate("""(function(){var n=document.querySelector('.menu'),r=n.getBoundingClientRect(),as=[].slice.call(n.querySelectorAll('a')),rs=as.map(function(a){return a.getBoundingClientRect()});
          return {h:r.height,l:r.left,rr:r.right,linhas:rs.map(function(x){return Math.round(x.top)}).filter(function(v,i,l){return l.indexOf(v)===i}).length,
          n:as.length,vis:rs.filter(function(x){return x.width>=30&&x.left>=0&&x.right<=innerWidth&&x.bottom<=innerHeight}).length,minh:Math.min.apply(null,rs.map(function(x){return x.height})),
          rot:as.every(function(a){return a.getAttribute('aria-label')&&a.getAttribute('title')===a.getAttribute('aria-label')}),
          txt:as.filter(function(a){var t=a.querySelector('.menu-txt');return t&&t.getBoundingClientRect().width>1}).length,ico:n.querySelectorAll('a .menu-ico svg').length,sw:document.documentElement.scrollWidth}})()""")
        check(m['n'] == 9 and m['vis'] == 9 and m['linhas'] == 1, '[%d] 9 ícones visíveis numa faixa só (%s)' % (w, m))
        check(m['h'] <= 60 and m['minh'] >= 44, '[%d] barra baixa (%.0fpx) e alvos >= 44px' % (w, m['h']))
        check(m['rot'] and m['txt'] == 0 and m['ico'] == 9, '[%d] sem texto visível, com aria-label e title' % w)
        check(m['sw'] <= w and m['rr'] <= w, '[%d] sem estourar a largura' % w)
        at = pg.evaluate("getComputedStyle(document.querySelector('.menu a[aria-current=\"page\"]')).backgroundImage")
        check('gradient' in at and pg.get_attribute('.menu a[aria-current="page"]', 'href') == '#/tarefas', '[%d] item ativo destacado' % w)
        if a.prints and w == 390:
            pg.wait_for_timeout(2200); pg.locator('.menu').screenshot(path=a.prints + '/casa-barra-icones-barra-390.png')
            pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(2500); pg.screenshot(path=a.prints + '/casa-barra-icones-hoje-390.png')
        if a.prints and w == 360: pg.wait_for_timeout(2200); pg.screenshot(path=a.prints + '/casa-barra-icones-tarefas-360.png')
        check(not erros, '[%d] sem erros de JS %s' % (w, erros[:2]))
        pg.close()
    b.close()
print('\n%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
