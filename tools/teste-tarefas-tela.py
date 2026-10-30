#!/usr/bin/env python3
"""Teste de tela de Tarefas: chip Todos, alternador Lista/Quadro, quadro por prazo, mover por seletor e por arrastar. Uso: python3 tools/teste-tarefas-tela.py [--chrome CAMINHO] [--prints PASTA]"""
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
 s.tarefas=[{id:'t1',lista:'Casa',titulo:'Pagar diarista (exemplo)',prio:'alta',vence:d(h,-2),feita:false,exemplo:true},
 {id:'t2',lista:'Trabalho',titulo:'Revisar proposta (exemplo)',prio:'media',vence:h,feita:false,exemplo:true},
 {id:'t3',lista:'Maria Alice',titulo:'Vacina (exemplo)',prio:'alta',vence:d(h,20),feita:false,exemplo:true},
 {id:'t4',lista:'Casa',titulo:'Trocar lâmpada (exemplo)',prio:'baixa',vence:'',feita:false,exemplo:true},
 {id:'t5',lista:'Trabalho',titulo:'Relatório (exemplo)',prio:'media',vence:'',feita:true,exemplo:true}];},true);"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for vp in [(390, 844), (1280, 800)]:
        w = vp[0]; pg = b.new_page(viewport={'width': w, 'height': vp[1]}); erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/'); pg.wait_for_timeout(600); pg.evaluate(DADOS); pg.evaluate("location.hash='#/tarefas'"); pg.wait_for_timeout(500)
        abas = pg.eval_on_selector_all('.abas .aba', 'e=>e.map(x=>x.firstChild.textContent)')
        check(abas[:1] == ['Todos'] and 'Casa' in abas, '[%d] chip Todos antes das listas %s' % (w, abas))
        pg.locator('[data-fid="aba:__todos"]').click(); pg.wait_for_timeout(250)
        check(pg.locator('.item.tarefa').count() == 5 and pg.locator('.item.tarefa .tag-lista').count() == 5, '[%d] Todos mostra todas com etiqueta da lista' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/tarefas-todos-lista.png', full_page=True)
        pg.locator('[data-fid="tm:quadro"]').click(); pg.wait_for_timeout(300)
        cols = pg.eval_on_selector_all('.coluna-prazo h3', 'e=>e.map(x=>x.innerText.replace(/\\s+/g," "))')
        check(cols == ['Atrasadas 1', 'Hoje 1', 'Esta semana 0', 'Depois 1', 'Sem data 1'], '[%d] colunas com contagem %s' % (w, cols))
        check(pg.locator('[data-fid="qt:t1"] .tag-lista').count() == 1 and pg.locator('[data-fid="qt:t1"] .selo').count() >= 1, '[%d] cartão com prioridade e lista' % w)
        sw = pg.evaluate('document.documentElement.scrollWidth')
        check(sw <= w, '[%d] sem rolagem horizontal da página (%d)' % (w, sw))
        if a.prints: pg.screenshot(path=a.prints + '/tarefas-quadro-%d.png' % w, full_page=True)
        # mover por seletor (teclado/celular)
        pg.locator('[data-fid="mv:t4"]').select_option('hoje'); pg.wait_for_timeout(300)
        check(pg.evaluate("PS.store.get().tarefas.filter(function(t){return t.id==='t4'})[0].vence") == pg.evaluate('PS.u.hoje()'), '[%d] Mover para Hoje define data de hoje' % w)
        check(pg.locator('[data-fid="qc:hoje"] [data-fid="qt:t4"]').count() == 1, '[%d] cartão aparece em Hoje' % w)
        pg.locator('[data-fid="mv:t4"]').select_option('semdata'); pg.wait_for_timeout(300)
        check(pg.evaluate("PS.store.get().tarefas.filter(function(t){return t.id==='t4'})[0].vence") == '', '[%d] Sem data limpa o prazo' % w)
        # arrastar
        if w == 1280:
            pg.drag_and_drop('[data-fid="qt:t2"]', '[data-fid="qc:depois"]'); pg.wait_for_timeout(300)
            check(pg.evaluate("PS.store.get().tarefas.filter(function(t){return t.id==='t2'})[0].vence") == pg.evaluate('PS.u.somaDias(PS.u.hoje(),14)'), '[%d] arrastar para Depois = hoje + 14' % w)
            pg.drag_and_drop('[data-fid="qt:t3"]', '[data-fid="qc:atrasadas"]'); pg.wait_for_timeout(300)
            check(pg.evaluate("PS.store.get().tarefas.filter(function(t){return t.id==='t3'})[0].vence") == pg.evaluate('PS.u.somaDias(PS.u.hoje(),20)'), '[%d] Atrasadas não aceita soltar' % w)
        # filtro por lista no quadro
        pg.locator('[data-fid="aba:Casa"]').click(); pg.wait_for_timeout(250)
        check(pg.locator('.cartao-tarefa').count() == 2, '[%d] quadro filtra pela lista Casa' % w)
        if a.prints and w == 390:
            pg.locator('[data-fid="tm:lista"]').click(); pg.wait_for_timeout(250); pg.screenshot(path=a.prints + '/tarefas-lista-casa.png', full_page=True)
        check(not erros, '[%d] sem erros de JS %s' % (w, erros)); pg.close()
    b.close()
print('\n%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
