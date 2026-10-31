#!/usr/bin/env python3
"""Teste de sincronização com DOIS perfis de navegador falando com o Worker REAL (cifrado de ponta a ponta).
Uso: python3 tools/teste-sync.py [--url https://.../minha-casa-em-ordem/] [--chrome /usr/bin/google-chrome] [--manter]
 - Sem --url: servidor local + proxy do Playwright que injeta o Origin permitido (o Worker só aceita github.io).
 - Cria uma família DESCARTÁVEL e a exclui ao final (use --manter para inspecionar o D1 antes; imprime o código).
Sai com 1 se algo falhar."""
import argparse, functools, http.server, json, pathlib, socketserver, sys, threading, time, urllib.request, urllib.error, secrets
from playwright.sync_api import sync_playwright

raiz = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument('--url'); ap.add_argument('--chrome'); ap.add_argument('--manter', action='store_true')
a = ap.parse_args()
WORKER = 'https://painel-sala-sync.guilhermeromionetto.workers.dev'
ORIGEM = 'https://guilhermeromio-netto-prog.github.io'
local = not a.url
if local:
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *x): pass
    httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    a.url = 'http://127.0.0.1:%d/' % httpd.server_address[1]
base = a.url.rstrip('/') + '/'
falhas, ok = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)

bodies = []  # corpos enviados ao Worker (para provar que não há texto claro)
def proxy(route):
    req = route.request
    h = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'}
    if req.method == 'OPTIONS':
        route.fulfill(status=204, headers=h); return
    hd = {'Origin': ORIGEM, 'User-Agent': 'Mozilla/5.0 painel-sala-teste'}
    for k in ('authorization', 'content-type'):
        if req.headers.get(k): hd[k] = req.headers[k]
    data = req.post_data_buffer
    if data: bodies.append(data.decode('utf8', 'replace'))
    r = urllib.request.Request(req.url, data=data, headers=hd, method=req.method)
    try: resp = urllib.request.urlopen(r, timeout=30); st, body = resp.status, resp.read()
    except urllib.error.HTTPError as e: st, body = e.code, e.read()
    h['Content-Type'] = 'application/json'
    route.fulfill(status=st, headers=h, body=body)

def ctx_novo(b, w, hh):
    c = b.new_context(viewport={'width': w, 'height': hh})
    if local: c.route(WORKER + '/**', proxy)
    pg = c.new_page(); erros = []
    pg.on('console', lambda m: print('   [console]', m.text[:200]) if 'Password field' not in m.text else None)
    pg.on('pageerror', lambda e: erros.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: erros.append('console: ' + m.text) if m.type == 'error' and 'open-meteo' not in m.text.lower() and 'Failed to load resource' not in m.text else None)
    return c, pg, erros

def digitar(pg, d):
    for ch in d: pg.click('[data-fid="tk:%s"]' % ch)
    pg.click('[data-fid="tk:ok"]')

SEG = 'SEGREDO' + secrets.token_hex(4).upper()
PIN = '%d' % (2468 + secrets.randbelow(10) * 11)   # PIN não-trivial
SENHA = 'gato azul cafe ' + secrets.token_hex(3)
codigo = ''
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    cA, A, eA = ctx_novo(b, 390, 844)     # celular
    cB, B, eB = ctx_novo(b, 1280, 720)    # TV
    try:
        # ---- A cria a família pela interface ----
        A.goto(base + 'index.html#/sincronizar'); A.wait_for_selector('[data-fid="sy:criar"]')
        A.click('[data-fid="sy:criar"]'); A.wait_for_selector('[data-fid="tk:ok"]'); digitar(A, PIN)
        A.wait_for_selector('[data-fid="tk:ok"]'); digitar(A, PIN)
        A.wait_for_selector('#s1'); A.fill('#s1', SENHA); A.fill('#s2', SENHA); A.click('[data-fid="sy:criarfam"]')
        A.wait_for_selector('.codigo-grande', timeout=60000)
        codigo = A.inner_text('.codigo-grande').replace(' ', '').strip()
        rec = A.inner_text('.chave').strip()
        check(len(codigo) == 8 and codigo.isdigit(), 'A: família criada (código de 8 dígitos)')
        check(len(rec.replace('-', '').replace(' ', '')) >= 26, 'A: chave de recuperação mostrada uma vez')
        A.check('[data-fid="sy:anotei"]'); A.click('[data-fid="sy:concluir"]'); A.wait_for_selector('[data-fid="sy:agora"]')
        check(A.evaluate("PS.sync.ativo()"), 'A: sincronização ativa')
        check(A.evaluate("PS.sync.estado().temChaves"), 'A: chaves guardadas (não extraíveis) no IndexedDB')
        # dados em A
        A.evaluate("""(function(s){PS.store.alterar(function(d){d.tarefas.push({id:'t-seg1',lista:d.listas[0],titulo:s+' tarefa um',prio:'alta',vence:'',feita:false,dono:'gui'});
          d.compromissos.push({id:'c-seg1',titulo:s+' consulta',data:'2026-12-01',hora:'09:00',dias:0,fonte:'manual',dono:'casal'}); });})""", SEG)
        A.evaluate("PS.sync.sincronizarAgora()"); A.wait_for_timeout(2500)
        check(A.evaluate("PS.sync.estado().fase") == 'ok', 'A: status ok depois de sincronizar')

        # ---- B (TV) entra pela interface ----
        B.goto(base + 'index.html#/sincronizar'); B.wait_for_selector('[data-fid="sy:entrar"]')
        B.click('[data-fid="sy:entrar"]'); B.wait_for_selector('[data-fid="tk:ok"]'); digitar(B, codigo)
        B.wait_for_selector('[data-fid="tk:ok"]'); digitar(B, PIN)
        B.wait_for_selector('#seg'); B.fill('#seg', 'senha errada nada a ver'); B.click('[data-fid="sy:entrarfam"]')
        B.wait_for_selector('.nota.aviso', timeout=60000)
        check('incorreta' in B.inner_text('.nota.aviso'), 'B: senha errada é recusada (sem ler nada)')
        B.wait_for_selector('#seg'); B.fill('#seg', SENHA); B.click('[data-fid="sy:entrarfam"]')
        B.wait_for_selector('[data-fid="sy:juntar"]', timeout=60000)
        B.click('[data-fid="sy:juntar"]'); B.wait_for_selector('[data-fid="sy:agora"]', timeout=60000)
        B.wait_for_timeout(1500)
        tem = B.evaluate("(function(s){return PS.store.get().tarefas.some(function(t){return t.titulo.indexOf(s)===0})&&PS.store.get().compromissos.some(function(t){return t.titulo.indexOf(s)===0})})", ) if False else B.evaluate("(function(s){var e=PS.store.get();return e.tarefas.some(function(t){return t.titulo.indexOf(s)===0})&&e.compromissos.some(function(t){return t.titulo.indexOf(s)===0})})", SEG)
        check(tem, 'B: recebeu tarefa e compromisso de A depois de entrar (decifrados)')
        check(B.evaluate("PS.store.get().compromissos.filter(function(c){return c.titulo.indexOf('%s')===0})[0].dono" % SEG) == 'casal', 'B: campo "dono" preservado')

        # ---- edição em B aparece em A com "sincronizar agora" ----
        B.evaluate("""(function(s){PS.store.alterar(function(d){d.tarefas.push({id:'t-seg2',lista:d.listas[0],titulo:s+' tarefa dois (B)',prio:'media',vence:'',feita:false,dono:'esposa'}); });})""", SEG)
        B.evaluate("PS.sync.sincronizarAgora()"); B.wait_for_timeout(2500)
        A.evaluate("PS.sync.sincronizarAgora()"); A.wait_for_timeout(2500)
        check(A.evaluate("PS.store.get().tarefas.some(function(t){return t.titulo.indexOf('%s tarefa dois')===0})" % SEG), 'A: edição de B chegou com "Sincronizar agora"')

        # ---- compra grande (151 itens, como a nota WMS) e lista de compras chegam ao outro aparelho ----
        B.evaluate("""(function(){PS.store.alterar(function(d){var it=[];for(var i=0;i<151;i++)it.push({nome:'RF.PRODUTO TESTE NUMERO '+i+' COM NOME LONGO',qtd:1,unit:9.99,total:9.99});
          d.notas.push({id:'n-grande',loja:'WMS Supermercados do Brasil Ltda - Osasco, SP',data:'2026-10-30',desconto:7,total:1508.49,itens:it,origem:'foto'});
          d.compras.push({id:'c-seg',nome:'Leite teste',comprado:false});});})()""")
        B.evaluate("PS.sync.sincronizarAgora()"); B.wait_for_timeout(3500)
        check(B.evaluate("PS.sync.estado().fase") == 'ok' and not B.evaluate("PS.sync.estado().erro"), 'B: envio da compra de 151 itens sem erro (%s)' % B.evaluate("PS.sync.estado().erro"))
        A.evaluate("PS.sync.sincronizarAgora()"); A.wait_for_timeout(3500)
        nA = A.evaluate("(PS.store.get().notas||[]).filter(function(n){return n.id==='n-grande'}).map(function(n){return n.itens.length})")
        check(nA == [151], 'A: compra de 151 itens chegou (%s)' % nA)
        check(A.evaluate("PS.store.get().compras.some(function(c){return c.id==='c-seg'})"), 'A: item da lista de compras chegou')

        # ---- edição em A chega em B automaticamente em até 60 s ----
        A.evaluate("""(function(s){PS.store.alterar(function(d){d.tarefas.push({id:'t-seg3',lista:d.listas[0],titulo:s+' tarefa tres (auto)',prio:'baixa',vence:'',feita:false,dono:'gui'}); });})""", SEG)
        t0 = time.time(); chegou = False
        while time.time() - t0 < 75:
            if B.evaluate("PS.store.get().tarefas.some(function(t){return t.titulo.indexOf('%s tarefa tres')===0})" % SEG): chegou = True; break
            B.wait_for_timeout(2000)
        check(chegou, 'B: edição de A chegou sozinha em %.0f s (limite 60 s)' % (time.time() - t0))
        check(time.time() - t0 <= 65, 'B: dentro do limite de ~60 s')

        # ---- exclusão propaga ----
        A.evaluate("PS.store.alterar(function(d){d.tarefas=d.tarefas.filter(function(t){return t.id!=='t-seg2'});})")
        A.evaluate("PS.sync.sincronizarAgora()"); A.wait_for_timeout(2500)
        B.evaluate("PS.sync.sincronizarAgora()"); B.wait_for_timeout(2500)
        check(not B.evaluate("PS.store.get().tarefas.some(function(t){return t.titulo.indexOf('%s tarefa dois')===0})" % SEG), 'B: exclusão feita em A propagou')
        # sem ressuscitar após novo ciclo
        B.evaluate("PS.sync.sincronizarAgora()"); B.wait_for_timeout(2000)
        check(not B.evaluate("PS.store.get().tarefas.some(function(t){return t.titulo.indexOf('%s tarefa dois')===0})" % SEG), 'B: item excluído não ressuscita')

        # ---- aparelhos conectados e revogação ----
        B.goto(base + 'index.html#/sincronizar'); B.wait_for_selector('[data-fid="sy:aps"]'); B.click('[data-fid="sy:aps"]'); B.wait_for_selector('.ap-linha', timeout=15000)
        check(B.locator('.ap-linha').count() >= 2, 'B: lista "Aparelhos conectados" mostra os 2 aparelhos')

        # ---- nada de texto claro saiu do navegador ----
        todo = '\n'.join(bodies)
        if local:
            check(len(bodies) > 3 and SEG not in todo and 'tarefa um' not in todo and 'consulta' not in todo, 'Corpos enviados ao Worker não contêm texto claro (%d requisições)' % len(bodies))
            check(SENHA not in todo, 'A senha da família nunca é enviada ao Worker')
        check(not eA and not eB, 'sem erros de console/página %s %s' % (eA, eB))
        print('SEGREDO=' + SEG + ' CODIGO=' + codigo)
        if not a.manter:
            # ---- limpeza: excluir a família descartável pela API do app (PIN) ----
            A.goto(base + 'index.html#/sincronizar'); A.wait_for_selector('[data-fid="sy:agora"]')
            r = A.evaluate("PS.sync.excluirFamilia('%s').then(function(){return 'ok'},function(e){return 'erro '+e.message})" % PIN)
            check(r == 'ok', 'Limpeza: família descartável excluída (%s)' % r)
    except Exception as e:
        check(False, 'exceção no teste: %r' % (e,))
        try: A.screenshot(path='/tmp/sync-A.png'); B.screenshot(path='/tmp/sync-B.png')
        except Exception: pass
    b.close()
print('\n%d ok, %d falhas' % (len(ok), len(falhas)))
sys.exit(1 if falhas else 0)
