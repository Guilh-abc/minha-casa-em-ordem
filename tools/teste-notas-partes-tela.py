#!/usr/bin/env python3
"""Teste de tela de Compras feitas (nota fiscal com /foto simulada, lançamento à mão, mês a mês, detalhe). Uso: python3 tools/teste-notas-tela.py [--chrome CAMINHO] [--prints PASTA]  byGui"""
import sys, argparse, functools, http.server, pathlib, socketserver, threading, json
from playwright.sync_api import sync_playwright
raiz = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument('--chrome'); ap.add_argument('--prints'); ap.add_argument('--etiqueta'); ap.add_argument('--boleto'); a = ap.parse_args()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/index.html' % httpd.server_address[1]
ok, falhas = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)
RELOGIO = "(function(){var T=Date.UTC(2026,9,30,15,0,0),D=Date;function F(a,b,c,d,e,f,g){if(!arguments.length)return new D(T);return new (Function.prototype.bind.apply(D,[null].concat([].slice.call(arguments))))();}F.now=function(){return T};F.UTC=D.UTC;F.parse=D.parse;F.prototype=D.prototype;window.Date=F;})();"
def png(cor):  # imagem mínima válida se não vier arquivo
    import base64; return base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
ETQ = pathlib.Path(a.etiqueta).read_bytes() if a.etiqueta else png(0)
BOL = pathlib.Path(a.boleto).read_bytes() if a.boleto else png(0)
NOTA = {'loja': 'ATACADÃO', 'data': '28/10', 'itens': [{'nome': 'Arroz 5kg', 'qtd': '2', 'unit': 'R$ 22,90', 'total': 'R$ 45,80'}, {'nome': 'Leite', 'qtd': '1', 'unit': '4,99', 'total': '4,99'}], 'desconto': 'R$ 1,00', 'total': 'R$ 52,00'}
P1 = {'loja': 'SUPERMERCADOS DO BRASIL LTDA', 'data': '30/10/2026', 'itens': [{'nome': 'ARROZ TIO JOAO 5KG', 'qtd': '1', 'unit': '25,90', 'total': '25,90'}, {'nome': 'FEIJAO CARIOCA 1KG', 'qtd': '2', 'unit': '8,49', 'total': '16,98'}, {'nome': 'OLEO SOJA 900ML', 'qtd': '1', 'unit': '7,99', 'total': '7,99'}], 'desconto': '', 'total': 'R$ 0,00'}
P2 = {'loja': '', 'data': '', 'itens': [{'nome': 'OLEO SOJA 900ML', 'qtd': '1', 'unit': '7,99', 'total': '7,99'}, {'nome': 'LEITE INTEGRAL 1L', 'qtd': '6', 'unit': '4,79', 'total': '28,74'}, {'nome': 'CAFE PILAO 500G', 'qtd': '1', 'unit': '19,90', 'total': '19,90'}], 'desconto': '', 'total': ''}
P3 = {'loja': '', 'data': '', 'itens': [{'nome': 'CAFE PILAO 500G', 'qtd': '1', 'unit': '19,90', 'total': '19,90'}, {'nome': 'BANANA PRATA KG', 'qtd': '1,2', 'unit': '6,99', 'total': '8,39'}], 'desconto': '', 'total': 'VALOR TOTAL R$ 107,90'}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w in (390, 1280):
        ctx = b.new_context(viewport={'width': w, 'height': 844}); ctx.add_init_script(RELOGIO)
        fila = []; pedidos = []
        def rota(r):
            if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type'})
            pedidos.append(json.loads(r.request.post_data or '{}')); n = fila.pop(0)
            if n == 'erro': return r.fulfill(status=422, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, body=json.dumps({'erro': 'Não consegui ler a nota.'}))
            r.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, body=json.dumps({'nota': n}))
        ctx.route('**/minha-casa-assistente**', rota)
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/compras'); pg.wait_for_timeout(700)
        # compra antiga com o bug: total 0 e 16 itens com valores
        pg.evaluate("""PS.store.alterar(function(s){s.compras=[];s.notas=[{id:'nb',loja:'SUPERMERCADOS DO BRASIL LITA',data:'2026-10-30',total:0,desconto:null,origem:'foto',itens:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map(function(i){return {nome:'ITEM '+i,qtd:1,unit:10,total:10}})},{id:'nz',loja:'LOJA ZERO',data:'2026-10-29',total:0,desconto:null,origem:'foto',itens:[{nome:'A',qtd:null,unit:null,total:null}]}];},true)""")
        pg.evaluate("location.hash='#/tarefas'"); pg.wait_for_timeout(300); pg.evaluate("location.hash='#/compras'"); pg.wait_for_timeout(500)
        L = lambda f: pg.locator('[data-fid="%s"]' % f)
        t = L('nt:c:nb').inner_text()
        check('R$ 160,00 (soma)' in t and '16 itens' in t, '[%d] compra com total 0 mostra a soma dos itens, marcada: %r' % (w, t))
        check('sem valor' in L('nt:c:nz').inner_text(), '[%d] compra sem valor nenhum pede correção' % w)
        check('R$ 160,00' in L('nt:total-mes').inner_text(), '[%d] total do mês não fica em 0: %r' % (w, L('nt:total-mes').inner_text()))
        L('nt:c:nb').click(); pg.wait_for_timeout(200)
        check('total da nota não lido' in L('nt:detalhe').inner_text(), '[%d] detalhe avisa que o total não foi lido' % w)
        pg.locator('.modal button', has_text='Editar').click(); pg.wait_for_timeout(200)
        L('nt:total').fill('158,50'); pg.locator('.modal button', has_text='Salvar').click(); pg.wait_for_timeout(300)
        c = [x for x in pg.evaluate('PS.store.get().notas') if x['id'] == 'nb'][0]
        check(c['total'] == 158.5 and not c['estimado'], '[%d] Editar corrige o total da compra' % w)
        # compra sem valor nenhum: não salva 0 em silêncio
        L('nt:c:nz').click(); pg.wait_for_timeout(200); pg.locator('.modal button', has_text='Editar').click(); pg.wait_for_timeout(200)
        pg.locator('.modal button', has_text='Salvar').click(); pg.wait_for_timeout(300)
        check('Não há nenhum valor' in pg.locator('.modal').inner_text(), '[%d] salvar sem valor nenhum é recusado com aviso' % w)
        pg.locator('.modal button', has_text='Cancelar').click(); pg.wait_for_timeout(200)
        # nota longa: 1 foto pela câmera + 2 pela galeria (seleção múltipla)
        fila[:] = [P1, P2, P3]
        L('nt:registrar').click()
        with pg.expect_file_chooser() as fc: L('nt:camera').click()
        fc.value.set_files({'name': 'a.png', 'mimeType': 'image/png', 'buffer': png(0)}); pg.wait_for_timeout(900)
        check('Parte 1: 3 itens' in L('nt:partes-lista').inner_text() and pg.locator('.modal button', has_text='Terminei').count() == 1, '[%d] parte 1 lida, com Terminei' % w)
        bb = L('nt:parte-camera').bounding_box(); check(bb['height'] >= 44, '[%d] botão de outra parte com 44px' % w)
        with pg.expect_file_chooser() as fc: L('nt:parte-galeria').click()
        check(fc.value.is_multiple(), '[%d] galeria aceita várias fotos' % w)
        fc.value.set_files([{'name': 'b.png', 'mimeType': 'image/png', 'buffer': png(0)}, {'name': 'c.png', 'mimeType': 'image/png', 'buffer': png(0)}]); pg.wait_for_timeout(1800)
        check(len(pedidos) == 3 and all(x.get('modo') == 'nota' for x in pedidos), '[%d] cada parte foi ao /foto em modo nota (%d)' % (w, len(pedidos)))
        r = L('nt:partes-resumo').inner_text()
        check('Juntas: 6 itens' in r and '2 repetidos' in r, '[%d] emenda: itens repetidos contados uma vez: %r' % (w, r))
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/notas-partes-390.png')
        pg.locator('.modal button', has_text='Terminei').click(); pg.wait_for_timeout(300)
        check(L('nt:loja').input_value() == 'SUPERMERCADOS DO BRASIL LTDA' and L('nt:data').input_value() == '2026-10-30' and L('nt:total').input_value() == '107,90', '[%d] loja e data da 1ª parte, total da última' % w)
        check(L('nt:i-nome:5').input_value() == 'BANANA PRATA KG' and L('nt:i-nome:6').count() == 0, '[%d] revisão com os 6 itens, na ordem' % w)
        pg.locator('.modal button', has_text='Salvar').click(); pg.wait_for_timeout(300)
        ns = [x for x in pg.evaluate('PS.store.get().notas') if x['loja'] == 'SUPERMERCADOS DO BRASIL LTDA']
        check(len(ns) == 1 and ns[0]['total'] == 107.9 and len(ns[0]['itens']) == 6, '[%d] uma compra só, com total da nota' % w)
        check('base64' not in pg.evaluate('JSON.stringify(localStorage)'), '[%d] fotos descartadas' % w)
        # total ausente em todas as partes: usa a soma, com aviso
        fila[:] = [dict(P1, total=''), 'erro']
        L('nt:registrar').click(); pg.wait_for_timeout(100)
        if not L('nt:camera').is_visible(): L('nt:registrar').click()
        with pg.expect_file_chooser() as fc: L('nt:camera').click()
        fc.value.set_files({'name': 'a.png', 'mimeType': 'image/png', 'buffer': png(0)}); pg.wait_for_timeout(900)
        with pg.expect_file_chooser() as fc: L('nt:parte-camera').click()
        fc.value.set_files({'name': 'b.png', 'mimeType': 'image/png', 'buffer': png(0)}); pg.wait_for_timeout(900)
        check('parte 2 não foi lida' in L('nt:parte-erro').inner_text() and 'Parte 1: 3 itens' in L('nt:partes-lista').inner_text(), '[%d] erro numa parte mantém as anteriores' % w)
        pg.locator('.modal button', has_text='Terminei').click(); pg.wait_for_timeout(300)
        check('total da nota' in L('nt:aviso').inner_text() or 'total' in pg.locator('.modal').inner_text().lower(), '[%d] revisão avisa que falta o total' % w)
        L('nt:data').fill('2026-10-28'); pg.locator('.modal button', has_text='Salvar').click(); pg.wait_for_timeout(300)
        ns = [x for x in pg.evaluate('PS.store.get().notas') if x['data'] == '2026-10-28']
        check(len(ns) == 1 and ns[0]['total'] == 50.87 and ns[0]['estimado'], '[%d] sem total: salva a soma dos itens marcada como estimada: %r' % (w, ns and ns[0]['total']))
        # detalhe sem "x R$ 0,00" e nome separado da quantidade
        pg.evaluate("""PS.store.alterar(function(s){s.notas.push({id:'nd',loja:'SUPERMERCADOS DO BRASIL LITA',data:'2026-10-27',total:30.55,estimado:true,desconto:null,origem:'foto',itens:[{nome:'CEREAL MAT KELLOGGS SUCRILHOS',qtd:1,unit:0,total:20.85},{nome:'BEB LACTEA ITALAC MORANGO TP',qtd:2,unit:0,total:5.30},{nome:'LEITE COND ITAMBE',qtd:2,unit:null,total:4.40}]});},true)""")
        pg.evaluate("location.hash='#/tarefas'"); pg.wait_for_timeout(300); pg.evaluate("location.hash='#/compras'"); pg.wait_for_timeout(500)
        L('nt:c:nd').click(); pg.wait_for_timeout(200)
        d = L('nt:detalhe').inner_text()
        check('R$ 0,00' not in d and 'x R$' not in d, '[%d] detalhe sem "x R$ 0,00": %r' % (w, d[:200]))
        check('1 un · R$ 20,85' in d and '2 un × R$ 2,65 · R$ 5,30' in d, '[%d] linhas com qtd, unitário calculado só com qtd > 1' % w)
        nomes = pg.locator('.nt-det-nome').all_inner_texts(); vals = pg.locator('.nt-det-val').all_inner_texts()
        check('BEB LACTEA ITALAC MORANGO TP' in nomes and vals[1].startswith('2 un'), '[%d] nome em linha própria, separado da quantidade' % w)
        nb = pg.locator('.nt-det-nome').nth(1).bounding_box(); vb = pg.locator('.nt-det-val').nth(1).bounding_box()
        check(vb['y'] >= nb['y'] + nb['height'] - 1, '[%d] valor fica abaixo do nome' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/notas-detalhe-390.png')
        # Editar > Adicionar fotos da nota: junta aos itens salvos, sem repetir, total lido substitui a soma
        pg.locator('.modal button', has_text='Editar').click(); pg.wait_for_timeout(200)
        check(L('nt:mais-fotos').count() == 1 and L('nt:ed-camera').bounding_box()['height'] >= 44, '[%d] Editar tem Adicionar fotos da nota' % w)
        L('nt:loja').fill('SUPERMERCADOS DO BRASIL LTDA')
        fila[:] = [{'loja': '', 'data': '', 'itens': [{'nome': 'LEITE COND ITAMBE', 'qtd': '2', 'unit': '', 'total': '4,40'}, {'nome': 'PAO LEITE PANCO', 'qtd': '1', 'unit': '', 'total': '9,99'}], 'total': ''},
                   {'loja': '', 'data': '', 'itens': [{'nome': 'PAO LEITE PANCO', 'qtd': '1', 'unit': '', 'total': '9,99'}, {'nome': 'BISNAGUINHA', 'qtd': '1', 'unit': '', 'total': '3,85'}], 'total': 'R$ 46,39'}]
        with pg.expect_file_chooser() as fc: L('nt:ed-galeria').click()
        check(fc.value.is_multiple(), '[%d] galeria do Editar aceita várias fotos' % w)
        fc.value.set_files([{'name': 'b.png', 'mimeType': 'image/png', 'buffer': png(0)}, {'name': 'c.png', 'mimeType': 'image/png', 'buffer': png(0)}]); pg.wait_for_timeout(1800)
        pg.locator('.modal button', has_text='Terminei').click(); pg.wait_for_timeout(300)
        av = L('nt:aviso').inner_text() if L('nt:aviso').count() else pg.locator('.modal').inner_text()
        check(L('nt:loja').input_value() == 'SUPERMERCADOS DO BRASIL LTDA', '[%d] edição em andamento preservada' % w)
        check(L('nt:i-nome:4').input_value() == 'BISNAGUINHA' and L('nt:i-nome:5').count() == 0 and L('nt:total').input_value() == '46,39', '[%d] 2 itens novos no fim, sem repetir, total lido: %r' % (w, av))
        pg.locator('.modal button', has_text='Salvar').click(); pg.wait_for_timeout(300)
        c = [x for x in pg.evaluate('PS.store.get().notas') if x['id'] == 'nd']
        check(len(c) == 1 and len(c[0]['itens']) == 5 and c[0]['total'] == 46.39 and not c[0]['estimado'], '[%d] mesma compra atualizada, sem duplicar' % w)
        check('base64' not in pg.evaluate('JSON.stringify(localStorage)'), '[%d] fotos do Editar descartadas' % w)
        check(not erros, '[%d] sem erros: %r' % (w, erros)); ctx.close()
    b.close()
print('%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
