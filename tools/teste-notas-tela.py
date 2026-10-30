#!/usr/bin/env python3
"""Teste de tela de Compras feitas (nota fiscal com /foto simulada, lançamento à mão, mês a mês, detalhe). Uso: python3 tools/teste-notas-tela.py [--chrome CAMINHO] [--prints PASTA]  byGui"""
import argparse, functools, http.server, pathlib, socketserver, threading, json
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
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script(RELOGIO)
    pedidos = []
    def rota(r):
        if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type'})
        pedidos.append(json.loads(r.request.post_data or '{}'))
        r.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, body=json.dumps({'nota': NOTA, 'modelo': 'lfm3-vl-2b'}))
    ctx.route('**/minha-casa-assistente**', rota)
    pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(base + '#/compras'); pg.wait_for_timeout(700)
    pg.evaluate("PS.store.alterar(function(s){s.compras=[];s.notas=[];},true)"); pg.wait_for_timeout(200)
    L = lambda f: pg.locator('[data-fid="%s"]' % f)
    check(L('nt:secao').count() == 1 and 'compras feitas' in L('nt:secao').inner_text().lower(), 'área Compras feitas dentro da Lista de compras')
    check(L('ft:camera').count() == 1, 'botões de foto da lista continuam')
    check('outubro de 2026' in L('nt:mes-rot').inner_text() and L('nt:vazio').count() == 1, 'mês atual vazio')
    check(not L('nt:foto-opcoes').is_visible(), 'opções de foto escondidas antes de Registrar nota')
    L('nt:registrar').click()
    check(L('nt:camera').is_visible() and L('nt:galeria').is_visible(), 'Registrar nota mostra Tirar foto e Escolher da galeria')
    with pg.expect_file_chooser() as fc: L('nt:camera').click()
    check(fc.value.element.get_attribute('capture') == 'environment', 'Tirar foto abre a câmera traseira')
    fc.value.set_files({'name': 'n.png', 'mimeType': 'image/png', 'buffer': png(0)}); pg.wait_for_timeout(900)
    check(len(pedidos) == 1 and pedidos[0].get('modo') == 'nota' and pedidos[0].get('imagem', '').startswith('data:image/'), 'envia para /foto em modo nota')
    check(L('nt:partes').count() == 1 and 'Parte 1: 2 itens' in L('nt:partes-lista').inner_text() and L('nt:parte-camera').inner_text().strip().endswith('+ Adicionar outra parte'), 'depois da foto: + Adicionar outra parte')
    pg.locator('.modal button', has_text='Terminei').click(); pg.wait_for_timeout(300)
    check(L('nt:editor').count() == 1, 'abre a conferência antes de salvar')
    check(L('nt:loja').input_value() == 'ATACADÃO' and L('nt:data').input_value() == '2026-10-28', 'loja e data (DD/MM vira 28/10/2026)')
    check(L('nt:i-nome:0').input_value() == 'Arroz 5kg' and L('nt:i-qtd:0').input_value() == '2' and L('nt:i-unit:0').input_value() == '22,90' and L('nt:i-total:0').input_value() == '45,80', 'item com nome, qtd, unitário e total')
    check(L('nt:desconto').input_value() == '1,00' and L('nt:total').input_value() == '52,00', 'desconto e total copiados')
    av = L('nt:aviso')
    check(av.is_visible() and '49,79' in av.inner_text() and '52,00' in av.inner_text(), 'aviso: soma não bate com o total (não corrige sozinho)')
    check(L('nt:total').input_value() == '52,00', 'total não foi inventado nem alterado')
    L('nt:total').fill('49,79'); pg.wait_for_timeout(100)
    check(not av.is_visible(), 'aviso some quando o total bate')
    if a.prints: pg.screenshot(path=a.prints + '/notas-conferir-390.png', full_page=True)
    pg.locator('.modal button', has_text='Salvar').click(); pg.wait_for_timeout(300)
    s = pg.evaluate("PS.store.get().notas")
    check(len(s) == 1 and s[0]['total'] == 49.79 and s[0]['loja'] == 'ATACADÃO' and len(s[0]['itens']) == 2 and s[0]['origem'] == 'foto', 'compra salva na coleção notas')
    check('imagem' not in json.dumps(s) and 'base64' not in pg.evaluate("JSON.stringify(localStorage)"), 'foto descartada (nada guardado)')
    check('49,79' in L('nt:total-mes').inner_text() and '1 compra' in L('nt:total-mes').inner_text(), 'total do mês e quantidade')
    # lançar à mão
    L('nt:manual').click(); pg.wait_for_timeout(150)
    L('nt:loja').fill('Padaria Pão'); L('nt:i-nome:0').fill('Pão francês'); L('nt:i-total:0').fill('12,50'); L('nt:total').fill('12,50')
    L('nt:i-mais').click(); check(L('nt:i-nome:1').count() == 1, 'adicionar item')
    L('nt:i-rm:1').click(); check(L('nt:i-nome:1').count() == 0, 'remover item')
    pg.locator('.modal button', has_text='Salvar').click(); pg.wait_for_timeout(300)
    check('62,29' in L('nt:total-mes').inner_text() and '2 compras' in L('nt:total-mes').inner_text(), 'compra à mão soma no mês')
    lojas = L('nt:lojas').inner_text()
    check('ATACADÃO' in lojas and 'Padaria Pão' in lojas and lojas.index('ATACADÃO') < lojas.index('Padaria'), 'total por loja, maior primeiro')
    if a.prints: pg.screenshot(path=a.prints + '/notas-mes-390.png', full_page=True)
    # mês anterior
    L('nt:mes-ant').click(); pg.wait_for_timeout(150)
    check('setembro de 2026' in L('nt:mes-rot').inner_text() and L('nt:vazio').count() == 1, 'navega para o mês anterior')
    L('nt:mes-prox').click(); pg.wait_for_timeout(150)
    # detalhe, editar, excluir
    nid = s[0]['id']
    L('nt:c:' + nid).click(); pg.wait_for_timeout(150)
    d = L('nt:detalhe').inner_text()
    check('Arroz 5kg' in d and 'R$ 45,80' in d and 'Desconto' in d, 'detalhe mostra os itens')
    check(pg.locator('.modal button', has_text='Editar').count() == 1 and pg.locator('.modal button', has_text='Excluir').count() == 1, 'detalhe com Editar e Excluir')
    pg.locator('.modal button', has_text='Editar').click(); pg.wait_for_timeout(150)
    L('nt:loja').fill('Atacadão Centro'); pg.locator('.modal button', has_text='Salvar').click(); pg.wait_for_timeout(300)
    s = pg.evaluate("PS.store.get().notas")
    check(len(s) == 2 and any(x['loja'] == 'Atacadão Centro' and x['id'] == nid for x in s), 'editar atualiza sem duplicar')
    L('nt:c:' + nid).click(); pg.wait_for_timeout(150)
    pg.locator('.modal button', has_text='Excluir').click(); pg.wait_for_timeout(100)
    pg.locator('.modal button.perigo', has_text='Excluir').click(); pg.wait_for_timeout(300)
    s = pg.evaluate("PS.store.get().notas")
    check(len(s) == 1 and s[0]['loja'] == 'Padaria Pão', 'excluir remove a compra')
    # alvos e largura
    peq = pg.evaluate("[].slice.call(document.querySelectorAll('.nt-secao button')).filter(function(b){var r=b.getBoundingClientRect();return r.width&&(r.height<44||r.width<44);}).length")
    check(peq == 0, 'botões com alvo de 44px ou mais')
    check(pg.evaluate("document.documentElement.scrollWidth") <= 390, 'cabe em 390px sem rolagem lateral')
    check(not erros, 'sem erros de JS ' + ';'.join(erros))
    b.close()
httpd.shutdown()
print('%d ok, %d falhas' % (len(ok), len(falhas))); raise SystemExit(1 if falhas else 0)
