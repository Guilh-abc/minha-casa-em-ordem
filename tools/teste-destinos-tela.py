#!/usr/bin/env python3
"""Teste de tela: cada destino salva na coleção certa (Tarefa em Tarefas, Agenda na Agenda, Lista de compra na Lista), na aba e na Ajudante, e cartões de sugestão do chat. Uso: python3 tools/teste-destinos-tela.py [--chrome CAMINHO] [--prints PASTA]  byGui"""
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
FOTO = {'r': {}}
CHAT = {'r': ''}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script(RELOGIO)
    chamadas = []
    def rota(r):
        if r.request.url.endswith('/conversa'): return r.fulfill(status=503, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, body='{"erro":"indisponivel","fallback":true}')
        if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type'})
        H = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
        if '/foto' in r.request.url: return r.fulfill(status=200, headers=H, body=json.dumps({'campos': FOTO['r']}))
        chamadas.append(json.loads(r.request.post_data or '{}'))
        r.fulfill(status=200, headers=H, body=json.dumps({'resposta': CHAT['r']}))
    ctx.route('**/minha-casa-assistente**', rota)
    pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(base + '#/compras'); pg.wait_for_timeout(700)
    def zerar(): pg.evaluate("PS.store.alterar(function(s){s.compras=[];s.tarefas=[{id:'tx',lista:'Trabalho',titulo:'Relatório',prio:'media',vence:'',feita:false}];s.compromissos=[];},true)"); pg.wait_for_timeout(150)
    def contar(): return pg.evaluate("(function(s){return {t:s.tarefas.filter(function(x){return x.id!=='tx'}).map(function(x){return x.titulo}),c:s.compromissos.map(function(x){return x.titulo}),k:s.compras.map(function(x){return x.nome})}})(PS.store.get())")
    def foto(fid, resp):
        FOTO['r'] = resp
        with pg.expect_file_chooser() as fc: pg.locator('[data-fid="%s"]' % fid).first.click()
        fc.value.set_files({'name': 'a.png', 'mimeType': 'image/png', 'buffer': png(0)}); pg.wait_for_timeout(700)
    SALVAR = lambda: (pg.locator('.modal button', has_text='Salvar').click(), pg.wait_for_timeout(300))
    AG = {'destino': 'agenda', 'titulo': 'Vacina Maria Alice', 'data': '07/11/2026', 'hora': '10:00', 'local': 'Posto'}
    # ---------- aba Lista de compra ----------
    for dest, chave in [('tarefa', 't'), ('agenda', 'c'), ('compras', 'k')]:
        zerar(); foto('ft:galeria', AG if dest != 'compras' else {'destino': 'compras', 'nome': 'Arroz', 'preco': 'R$ 5,00'})
        if dest == 'tarefa': pg.select_option('[data-fid="ft:destino"]', 'tarefa'); pg.wait_for_timeout(100)
        SALVAR(); r = contar()
        outros = [k for k in 'tck' if k != chave]
        check(len(r[chave]) == 1 and all(not r[k] for k in outros), '[aba] destino %s salva só na coleção certa: %r' % (dest, r))
    # Tarefa salva aparece na tela Tarefas, mesmo com outra lista aberta antes
    zerar(); pg.evaluate("location.hash='#/tarefas'"); pg.wait_for_timeout(300)
    if pg.locator('[data-fid="aba:Trabalho"]').count(): pg.locator('[data-fid="aba:Trabalho"]').click(); pg.wait_for_timeout(150)
    pg.evaluate("location.hash='#/compras'"); pg.wait_for_timeout(300)
    foto('ft:galeria', AG); pg.select_option('[data-fid="ft:destino"]', 'tarefa'); pg.wait_for_timeout(100); SALVAR()
    pg.evaluate("location.hash='#/tarefas'"); pg.wait_for_timeout(400)
    check('Vacina Maria Alice' in pg.locator('main').inner_text(), '[aba] tarefa da foto aparece na tela Tarefas')
    pg.evaluate("location.hash='#/agenda'"); pg.wait_for_timeout(400)
    check('Vacina Maria Alice' not in pg.locator('main').inner_text(), '[aba] tarefa da foto não aparece como compromisso na Agenda')
    # ---------- Ajudante: foto ----------
    pg.evaluate("location.hash='#/assistente'"); pg.wait_for_timeout(400)
    for dest, chave, editar in [('tarefa', 't', False), ('agenda', 'c', False), ('tarefa', 't', True)]:
        zerar(); pg.locator('[data-fid="ass-limpar"]').click()
        pg.locator('[data-fid="ass-foto"]').click()
        resp = dict(AG); resp['destino'] = 'agenda' if editar else dest
        foto('ft:galeria', resp)
        if editar:
            pg.locator('[data-fid^="ass-foto-editar-"]').last.click(); pg.wait_for_timeout(150)
            pg.select_option('[data-fid="ft:destino"]', 'tarefa'); pg.wait_for_timeout(100); SALVAR()
        else: pg.locator('[data-fid^="ass-foto-salvar-"]').last.click(); pg.wait_for_timeout(300)
        r = contar(); outros = [k for k in 'tck' if k != chave]
        check(len(r[chave]) == 1 and all(not r[k] for k in outros), '[Ajudante foto%s] destino %s salva na coleção certa: %r' % (' + Editar' if editar else '', dest, r))
    # ---------- Ajudante: chat com SUGESTAO malformada ----------
    def perguntar(q):
        pg.fill('[data-fid="ass-pergunta"]', q); pg.locator('[data-fid="ass-enviar"]').click(); pg.wait_for_timeout(500)
    zerar(); pg.locator('[data-fid="ass-limpar"]').click()
    CHAT['r'] = 'Posso criar: <<SUGESTAO {"tipo":"tarefa","titulo":"Vacinar Maria Alice até 07/11"}, data: "2026-11-07">>'
    perguntar('Crie uma tarefa vacinar a Maria Alice até 07/11')
    txt = pg.locator('.ass-lista').inner_text()
    check('<<' not in txt and 'SUGEST' not in txt and '{' not in txt, '[chat] marcador cru nunca aparece: %r' % txt[-160:])
    card = pg.locator('[data-fid^="ass-sug-"]').last
    check(card.count() == 1 and 'Vacinar Maria Alice' in card.inner_text() and '07/11' in card.inner_text(), '[chat] sugestão malformada vira cartão com título e data')
    check(card.locator('button', has_text='Confirmar').count() == 1 and card.locator('button', has_text='Editar').count() == 1 and card.locator('button', has_text='Descartar').count() == 1, '[chat] cartão com Confirmar, Editar e Descartar')
    if a.prints: pg.screenshot(path=a.prints + '/ajudante-cartao-390.png')
    card.locator('button', has_text='Confirmar').click(); pg.wait_for_timeout(300)
    r = contar(); v = pg.evaluate("PS.store.get().tarefas.filter(function(x){return x.id!=='tx'}).map(function(x){return x.vence})")
    check(r['t'] == ['Vacinar Maria Alice até 07/11'] and v == ['2026-11-07'] and not r['c'], '[chat] Confirmar grava em Tarefas com a data: %r' % r)
    check('Tarefas' in pg.locator('[data-fid^="ass-sug-"]').last.inner_text(), '[chat] cartão diz onde salvou')
    # Editar: troca o título e salva em Tarefas
    zerar(); perguntar('Crie uma tarefa vacinar a Maria Alice até 07/11')
    pg.locator('[data-fid^="ass-sug-"]').last.locator('button', has_text='Editar').click(); pg.wait_for_timeout(150)
    check(pg.locator('[data-fid="ft:destino"]').input_value() == 'tarefa', '[chat] Editar abre a revisão já em Tarefa')
    pg.fill('[data-fid="ft:titulo"]', 'Vacina da Maria Alice'); SALVAR(); r = contar()
    check(r['t'] == ['Vacina da Maria Alice'] and not r['c'], '[chat] Editar salva em Tarefas: %r' % r)
    # Compromisso vai para a Agenda
    zerar(); CHAT['r'] = '<<SUGESTAO {"tipo":"compromisso","titulo":"Dentista Maria Alice","data":"12/11/2026","hora":"14:00"}>>'
    perguntar('Marque dentista da Maria Alice dia 12/11 às 14h')
    pg.locator('[data-fid^="ass-sug-"]').last.locator('button', has_text='Confirmar').click(); pg.wait_for_timeout(300); r = contar()
    check(r['c'] == ['Dentista Maria Alice'] and not r['t'], '[chat] compromisso vai para a Agenda: %r' % r)
    # Descartar não grava
    zerar(); CHAT['r'] = '<<SUGESTAO {"tipo":"tarefa","titulo":"Pagar luz"}>>'
    perguntar('crie uma tarefa pagar luz')
    pg.locator('[data-fid^="ass-sug-"]').last.locator('button', has_text='Descartar').click(); pg.wait_for_timeout(200)
    check(not contar()['t'], '[chat] Descartar não grava')
    # título inventado é recusado
    zerar(); CHAT['r'] = 'Sugiro: <<SUGESTAO {"tipo":"tarefa","titulo":"Vacinar Maria Alice"}>>'
    perguntar('crie uma tarefa pra semana que vem')
    check(pg.locator('.ass-msg.ia').last.locator('[data-fid^="ass-sug-"]').count() == 0 and not contar()['t'], '[chat] título que não veio do pedido não vira sugestão')
    # "Crie uma tarefa" sem detalhes abre o formulário, sem chamar o modelo
    zerar(); n0 = len(chamadas); CHAT['r'] = '<<SUGESTAO {"tipo":"tarefa","titulo":"Inventada"}>>'
    perguntar('Crie uma tarefa')
    check(len(chamadas) == n0 and pg.locator('[data-fid="ft:destino"]').count() == 1 and pg.locator('[data-fid="ft:destino"]').input_value() == 'tarefa' and pg.locator('[data-fid="ft:titulo"]').input_value() == '', '[chat] "Crie uma tarefa" abre formulário vazio, sem modelo e sem itens inventados')
    pg.fill('[data-fid="ft:titulo"]', 'Ligar para a escola'); SALVAR(); r = contar()
    check(r['t'] == ['Ligar para a escola'], '[chat] formulário salva em Tarefas: %r' % r)
    check(not erros, 'sem erros de JS ' + ';'.join(erros))
    b.close()
httpd.shutdown()
print('%d ok, %d falhas' % (len(ok), len(falhas))); raise SystemExit(1 if falhas else 0)
