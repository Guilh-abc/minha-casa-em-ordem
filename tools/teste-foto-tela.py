#!/usr/bin/env python3
"""Teste de tela da foto/print e da Lista de compras (rota /foto simulada). Uso: python3 tools/teste-foto-tela.py [--chrome CAMINHO] [--prints PASTA] [--etiqueta JPG] [--boleto JPG]  byGui"""
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
RESP = {'etiqueta': {'destino': 'compras', 'nome': 'Coxa e sobrecoxa', 'preco': 'R$ 9,39', 'unidade': 'kg', 'local': 'ATACADÃO'},
        'boleto': {'destino': 'agenda', 'titulo': 'Pagar boleto Enel', 'data': '12/11/2026', 'hora': '10:00', 'valor': 'R$ 187,45'}}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    w = 390
    ctx = b.new_context(viewport={'width': w, 'height': 844}); ctx.add_init_script(RELOGIO)
    pedidos, proxima = [], {'r': 'etiqueta', 'status': 200}
    def rota(r):
        if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type'})
        pedidos.append({'url': r.request.url, 'corpo': json.loads(r.request.post_data or '{}')})
        if proxima['status'] != 200: return r.fulfill(status=proxima['status'], headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, body=json.dumps({'erro': 'Não consegui ler a imagem. Tente outra foto.'}))
        r.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, body=json.dumps({'campos': RESP[proxima['r']], 'modelo': 'lfm3-vl-2b'}))
    ctx.route('**/minha-casa-assistente**', rota)
    pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(base + '#/compras'); pg.wait_for_timeout(700)
    pg.evaluate("PS.store.alterar(function(s){s.compras=[];s.tarefas=[];s.compromissos=[];},true)")
    def fotografar(dados, nome, modo='camera'):
        with pg.expect_file_chooser() as fc: pg.locator('[data-fid="ft:%s"]' % modo).first.click()
        ch = fc.value
        cap = ch.element.get_attribute('capture')
        if modo == 'camera': check(ch.element.get_attribute('accept') == 'image/*' and cap == 'environment', '[%s] Tirar foto abre a câmera traseira (capture=environment)' % nome)
        else: check(ch.element.get_attribute('accept') == 'image/*' and cap is None, '[%s] Escolher da galeria sem capture' % nome)
        ch.set_files(files=[{'name': nome + '.jpg', 'mimeType': 'image/jpeg', 'buffer': dados}])
        pg.wait_for_selector('[data-fid="ft:revisao"], .modal h2:text("Não consegui ler a imagem")', timeout=8000)
    bc, bg = pg.locator('[data-fid="ft:camera"]').first, pg.locator('[data-fid="ft:galeria"]').first
    check(bc.inner_text().strip() == 'Tirar foto' and bg.inner_text().strip() == 'Escolher da galeria', 'dois botões: Tirar foto e Escolher da galeria')
    check(bc.bounding_box()['height'] >= 44 and bg.bounding_box()['height'] >= 44, 'os dois botões com 44px')
    check(pg.locator('[data-fid="ft:botao"]').count() == 0, 'botão antigo único não existe mais')
    if a.prints: pg.screenshot(path=a.prints + '/foto-dois-botoes-390.png')
    fotografar(ETQ, 'etiqueta')
    check(len(pedidos) == 1 and pedidos[0]['url'].endswith('/foto'), 'envia uma única vez para /foto')
    img = pedidos[0]['corpo'].get('imagem', '')
    check(img.startswith('data:image/jpeg;base64,'), 'envia JPEG reduzido em memória')
    if a.etiqueta:
        dim = pg.evaluate("(function(u){return new Promise(function(ok){var i=new Image();i.onload=function(){ok([i.naturalWidth,i.naturalHeight])};i.src=u;})})(%s)" % json.dumps(img))
        check(max(dim) == 1280, 'imagem reduzida para 1280px no maior lado (%s)' % dim)
    check(pg.input_value('[data-fid="ft:destino"]') == 'compras' and pg.input_value('[data-fid="ft:nome"]') == 'Coxa e sobrecoxa', 'revisão: destino lista de compras e produto')
    check(pg.input_value('[data-fid="ft:preco"]') == '9,39' and pg.input_value('[data-fid="ft:local"]') == 'ATACADÃO', 'revisão: preço em reais e local editável')
    pg.fill('[data-fid="ft:local"]', 'Atacadão Morumbi')
    if a.prints: pg.screenshot(path=a.prints + '/foto-revisao-etiqueta-390.png')
    pg.locator('.modal .btn.primario').click(); pg.wait_for_timeout(300)
    c = pg.evaluate('PS.store.get().compras')
    check(len(c) == 1 and c[0]['preco'] == 9.39 and c[0]['local'] == 'Atacadão Morumbi' and c[0]['unidade'] == 'kg', 'salva o item com o local editado: %s' % c)
    check(set(c[0].keys()) <= {'id', 'nome', 'preco', 'unidade', 'local', 'comprado', 'exemplo'}, 'só dados no item, nada da foto')
    s = json.dumps(pg.evaluate('JSON.parse(PS.store.exportarJSON())')) + pg.evaluate('JSON.stringify(localStorage)')
    check('base64' not in s and 'data:image' not in s, 'foto não aparece no backup nem no armazenamento local')
    cache = pg.evaluate("caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.open(k).then(function(c){return c.keys()}).then(function(r){return r.map(function(x){return x.url})})}))}).then(function(l){return [].concat.apply([],l)})")
    check(not any(u.endswith('/foto') or 'minha-casa-assistente' in u for u in cache), 'nada da rota /foto no cache do service worker')
    pg.reload(); pg.wait_for_timeout(700)
    c2 = pg.evaluate('PS.store.get().compras')
    check(len(c2) == 1 and c2[0]['nome'] == 'Coxa e sobrecoxa' and c2[0]['preco'] == 9.39, 'item continua após recarregar (saneado)')
    check(pg.locator('[data-fid="cp:lista"] li').count() == 1 and 'R$ 9,39 / kg' in pg.locator('[data-fid="cp:lista"]').inner_text(), 'lista mostra o item com preço e unidade')
    # boleto: modelo diz agenda, código corrige para tarefa e lê a data DD/MM
    proxima['r'] = 'boleto'; fotografar(BOL, 'boleto', 'galeria')
    check(pg.input_value('[data-fid="ft:destino"]') == 'tarefa' and pg.input_value('[data-fid="ft:data"]') == '12/11/2026', 'boleto vira tarefa com vencimento 12/11/2026 (DD/MM)')
    if a.prints: pg.screenshot(path=a.prints + '/foto-revisao-boleto-390.png')
    pg.locator('.modal .btn.primario').click(); pg.wait_for_timeout(300)
    t = pg.evaluate('PS.store.get().tarefas')
    check(len(t) == 1 and t[0]['vence'] == '2026-11-12' and 'R$ 187,45' in t[0]['titulo'], 'tarefa salva com vencimento em 12/11: %s' % t)
    # data inválida na revisão
    proxima['r'] = 'boleto'; fotografar(BOL, 'boleto2')
    pg.fill('[data-fid="ft:data"]', '31/02/2026'); pg.locator('.modal .btn.primario').click(); pg.wait_for_timeout(200)
    check('Data inválida' in pg.locator('.ft-revisao').inner_text() and len(pg.evaluate('PS.store.get().tarefas')) == 1, 'data inválida não salva e avisa')
    pg.locator('.modal .btn').first.click(); pg.wait_for_timeout(200)
    check(len(pg.evaluate('PS.store.get().tarefas')) == 1 and pg.locator('.modal').count() == 0, 'cancelar não grava nada')
    # agenda
    pg.evaluate("PS.foto.revisar(PS.fotoNucleo.normalizar({destino:'agenda',titulo:'Consulta pediatra',data:'05/11',hora:'14h30',local:'Clínica'}, PS.u.hoje()))")
    pg.locator('.modal .btn.primario').click(); pg.wait_for_timeout(200)
    cp = [x for x in pg.evaluate('PS.store.get().compromissos') if x['titulo'] == 'Consulta pediatra']
    check(len(cp) == 1 and cp[0]['data'] == '2026-11-05' and cp[0]['hora'] == '14:30', 'agenda: 05/11 vira 2026-11-05 às 14:30')
    # erro: imagem descartada e aviso
    proxima['status'] = 422; n = len(pedidos); fotografar(ETQ, 'erro')
    check(len(pedidos) == n + 1 and 'descartada' in pg.locator('.modal').inner_text(), 'erro avisa e descarta a imagem')
    pg.locator('.modal .btn').first.click(); proxima['status'] = 200
    # marcar comprado e limpar
    pg.evaluate("location.hash='#/compras'"); pg.wait_for_timeout(300)
    pg.locator('[data-fid^="cp:"][role="checkbox"]').first.click(); pg.wait_for_timeout(200)
    check(pg.evaluate('PS.store.get().compras[0].comprado') is True, 'marca como comprado')
    pg.locator('[data-fid="cp:limpar"]').click(); pg.wait_for_timeout(200)
    check(pg.evaluate('PS.store.get().compras.length') == 0, 'limpar comprados')
    pg.evaluate("PS.store.alterar(function(s){s.compras=[{id:'a',nome:'Coxa e sobrecoxa',preco:9.39,unidade:'kg',local:'Atacadão',comprado:false},{id:'b',nome:'Arroz 5 kg',preco:22.9,unidade:'pct',local:'Atacadão',comprado:false},{id:'c',nome:'Detergente',preco:null,unidade:'',local:'',comprado:true}]})")
    pg.wait_for_timeout(300)
    check('Total estimado: R$ 32,29' in pg.inner_text('main'), 'total estimado só dos não comprados')
    sw = pg.evaluate('document.documentElement.scrollWidth'); check(sw <= w, 'sem rolagem horizontal (%d)' % sw)
    if a.prints: pg.screenshot(path=a.prints + '/compras-lista-390.png', full_page=True)
    check(pg.locator('.menu a[href="#/compras"]', has_text='Lista de Compra').count() == 1, 'menu tem a aba Lista de Compra')
    if a.prints: pg.screenshot(path=a.prints + '/menu-lista-de-compra-390.png')
    # foto DENTRO da Ajudante: mensagem com análise, destino e confirmar/editar
    pg.evaluate("PS.store.alterar(function(s){s.compras=[];s.tarefas=[];},true)")
    pg.evaluate("location.hash='#/assistente'"); pg.wait_for_timeout(400)
    bf = pg.locator('[data-fid="ass-foto"]')
    check(bf.count() == 1 and bf.bounding_box()['height'] >= 44 and pg.locator('[data-fid="ass-foto-opcoes"]').is_hidden(), 'Ajudante: botão Foto 44px, opções fechadas')
    bf.click(); pg.wait_for_timeout(100)
    op = pg.locator('[data-fid="ass-foto-opcoes"]')
    check(op.is_visible() and op.locator('[data-fid="ft:camera"]').count() == 1 and op.locator('[data-fid="ft:galeria"]').count() == 1, 'Ajudante: abre Tirar foto e Galeria')
    with pg.expect_file_chooser() as fc: op.locator('[data-fid="ft:camera"]').click()
    check(fc.value.element.get_attribute('capture') == 'environment', 'Ajudante: Tirar foto abre a câmera')
    proxima['r'] = 'etiqueta'; n = len(pedidos)
    fc.value.set_files(files=[{'name': 'a.jpg', 'mimeType': 'image/jpeg', 'buffer': ETQ}])
    pg.wait_for_selector('[data-fid^="ass-foto-salvar-"]', timeout=8000)
    t = pg.locator('.ass-msg.ia .ass-texto').last.inner_text()
    check(len(pedidos) == n + 1 and pedidos[-1]['url'].endswith('/foto') and pg.locator('.modal').count() == 0, 'Ajudante: envia para /foto sem abrir modal')
    check('Lista de compras' in t and 'Coxa e sobrecoxa' in t and 'R$ 9,39' in t, 'Ajudante: mensagem com análise e destino: %r' % t)
    check(pg.locator('[data-fid^="ass-foto-editar-"]').count() == 1, 'Ajudante: botão Editar')
    if a.prints: pg.screenshot(path=a.prints + '/ajudante-foto-390.png')
    pg.locator('[data-fid^="ass-foto-salvar-"]').click(); pg.wait_for_timeout(200)
    check(pg.evaluate('PS.store.get().compras.length') == 1 and 'salvo' in pg.locator('.ass-ok').last.inner_text().lower(), 'Ajudante: confirmar salva na lista de compras')
    # editar: reaproveita a revisão, muda destino e salva
    bf.click(); proxima['r'] = 'boleto'
    with pg.expect_file_chooser() as fc: pg.locator('[data-fid="ass-foto-opcoes"] [data-fid="ft:galeria"]').click()
    check(fc.value.element.get_attribute('capture') is None, 'Ajudante: Galeria sem capture')
    fc.value.set_files(files=[{'name': 'b.jpg', 'mimeType': 'image/jpeg', 'buffer': BOL}])
    pg.wait_for_selector('[data-fid^="ass-foto-editar-"] >> nth=-1', timeout=8000); pg.wait_for_timeout(200)
    t = pg.locator('.ass-msg.ia .ass-texto').last.inner_text()
    check('Destino sugerido: Tarefa' in t and '12/11/2026' in t and 'R$ 187,45' in t, 'Ajudante: boleto vira tarefa: %r' % t)
    pg.locator('[data-fid^="ass-foto-editar-"]').last.click(); pg.wait_for_selector('[data-fid="ft:revisao"]')
    pg.fill('[data-fid="ft:titulo"]', 'Pagar luz'); pg.locator('.modal .btn.primario').click(); pg.wait_for_timeout(200)
    tf = pg.evaluate('PS.store.get().tarefas')
    check(len(tf) == 1 and tf[0]['titulo'].startswith('Pagar luz') and tf[0]['vence'] == '2026-11-12' and 'salva' in pg.locator('.ass-ok').last.inner_text().lower(), 'Ajudante: editar e salvar grava a tarefa')
    sw = pg.evaluate('document.documentElement.scrollWidth'); check(sw <= w, 'Ajudante sem rolagem horizontal (%d)' % sw)
    check(not erros, 'sem erros de JS %s' % erros); ctx.close(); b.close()
print('%d ok, %d falhas' % (len(ok), len(falhas))); raise SystemExit(1 if falhas else 0)
