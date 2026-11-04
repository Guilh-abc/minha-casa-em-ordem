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
XLSX = str(raiz / 'tools/fixtures-nota-wms.xlsx')
CSV = '/tmp/nota-teste.csv'
open(CSV, 'w', encoding='utf-8').write('Mercado Teste\nData: 15/10/2026\nValor Total: R$ 12,00 | Desconto: R$ 2,00 | Valor a Pagar: R$ 10,00\n\nProduto;Quantidade;Preço unitário;Valor\nARROZ;2;"2,50";"5,00"\nFEIJÃO;1;5;5,00\n')
ok, falhas = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w in (390, 1280):
        pg = b.new_context(viewport={'width': w, 'height': 844}).new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/compras'); pg.wait_for_timeout(700)
        pg.locator('[data-fid="nt:registrar"]').click(); bt = pg.locator('[data-fid="nt:planilha"]'); check(bt.count() == 1 and bt.bounding_box()['height'] >= 44, '%d botão Importar planilha >=44px' % w)
        with pg.expect_file_chooser() as fc: bt.click()
        fc.value.set_files(XLSX); pg.wait_for_timeout(1200)
        av = pg.locator('[data-fid="nt:editor"]').inner_text()
        check('151 itens' in av and 'confere com o valor pago' in av and 'Informe a data' in av, '%d aviso xlsx: %s' % (w, av[:120]))
        pg.get_by_role('button', name='Salvar').last.click(); pg.wait_for_timeout(500)
        check(len(pg.evaluate('PS.store.get().notas||[]')) == 0, '%d sem data não grava' % w)
        pg.locator('[data-fid="nt:data"] input, input[data-fid="nt:data"]').first.fill('2026-10-30')
        pg.get_by_role('button', name='Salvar').last.click(); pg.wait_for_timeout(700)
        ns = pg.evaluate('PS.store.get().notas'); n = ns[0] if ns else {}
        check(len(n.get('itens', [])) == 151 and abs(n.get('total', 0) - 1404.46) < .001 and n.get('desconto') == 7 and n.get('loja', '').startswith('WMS'), '%d xlsx gravada 151 itens, 1404,46, desc 7' % w)
        it = n['itens'][150] if n else {}
        check(it.get('qtd') == 12 and it.get('unit') == 1.69 and it.get('total') == 20.28, '%d último item 12 x 1,69 = 20,28' % w)
        check(sum(1 for x in n['itens'] if x['nome'].startswith('BISNAGUINHA')) >= 2, '%d linhas repetidas mantidas' % w)
        with pg.expect_file_chooser() as fc:
            if not pg.locator('[data-fid="nt:planilha"]').is_visible(): pg.locator('[data-fid="nt:registrar"]').click()
            pg.locator('[data-fid="nt:planilha"]').click()
        fc.value.set_files(CSV); pg.wait_for_timeout(800)
        av = pg.locator('[data-fid="nt:editor"]').inner_text()
        check('2 itens' in av and 'confere com o valor pago' in av and 'Informe a data' not in av, '%d csv aviso: %s' % (w, av[:100]))
        pg.get_by_role('button', name='Salvar').last.click(); pg.wait_for_timeout(700)
        ns = pg.evaluate('PS.store.get().notas'); c = [x for x in ns if x['loja'] == 'Mercado Teste']
        check(c and c[0]['data'] == '2026-10-15' and c[0]['total'] == 10 and c[0]['desconto'] == 2, '%d csv com data e totais' % w)
        if w == 390: pg.screenshot(path='/workspace/prints/planilha-390.png', full_page=True)
        check(not erros, '%d sem erros JS %s' % (w, erros))
print('%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
