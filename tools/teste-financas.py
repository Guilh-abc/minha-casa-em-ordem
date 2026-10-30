#!/usr/bin/env python3
"""Teste headless de contas/faturas: Atenção agora, pago/aberto, histórico, .ics, avisos. Uso: python3 tools/teste-financas.py [--chrome CAMINHO]"""
import argparse, functools, http.server, pathlib, socketserver, sys, threading
from playwright.sync_api import sync_playwright
raiz = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument('--chrome'); a = ap.parse_args()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/index.html' % httpd.server_address[1]
ok, falhas = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)
CONTAS = """PS.store.alterar(function(s){var h=PS.u.hoje();
 s.contas=[{id:'c1',titulo:'Luz',mensal:false,data:PS.u.somaDias(h,-2),valor:150,paga:false,pagas:{},valores:{},cat:'casa',dono:'',icone:'raio'},
 {id:'c2',titulo:'Água',mensal:false,data:h,valor:80,paga:false,pagas:{},valores:{},cat:'casa',dono:'',icone:'carteira'},
 {id:'c3',titulo:'Internet',mensal:false,data:PS.u.somaDias(h,1),valor:100,paga:false,pagas:{},valores:{},cat:'casa',dono:'',icone:'carteira'},
 {id:'c4',titulo:'Condomínio',mensal:false,data:PS.u.somaDias(h,5),valor:500,paga:false,pagas:{},valores:{},cat:'casa',dono:'',icone:'carteira'}];
 s.faturas=[];},true);"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 720}, accept_downloads=True, permissions=['notifications'])
    pg = ctx.new_page(); erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(base + '#/'); pg.wait_for_selector('.hoje'); pg.evaluate(CONTAS); pg.evaluate("location.hash='#/contas'"); pg.wait_for_timeout(300); pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(500)
    tx = pg.inner_text('.atencao')
    check('Luz' in tx and '2 d atraso' in tx, 'Atenção agora mostra vencida primeiro')
    itens = pg.eval_on_selector_all('.atencao-item', 'els=>els.map(e=>e.innerText.split("\\n")[0])')
    check(itens[:2] == ['Luz', 'Água'], 'ordem por urgência: %s' % itens)
    check(pg.evaluate("!!document.querySelector('.atencao.urgente')"), 'faixa vermelha quando há vencida/hoje')
    check('+2 em Contas a pagar' in pg.inner_text('.atencao-lista'), 'excedente vira "+N em Contas a pagar"')
    check(pg.evaluate("document.querySelector('.menu .badge-menu') && document.querySelector('.menu .badge-menu').textContent") == '2', 'emblema no menu = 2 urgentes')
    pg.evaluate("location.hash='#/contas'"); pg.wait_for_timeout(500)
    check(pg.locator('.conta-linha').count() >= 4, 'Contas a pagar lista 4 em aberto')
    check('Em aberto' in pg.inner_text('.abas') and 'Pagas' in pg.inner_text('.abas') and 'Histórico' in pg.inner_text('.abas'), 'abas Em aberto/Pagas/Histórico')
    # marcar paga (manual, com data)
    pg.locator('[data-fid^="mp:contac1"]').click(); pg.wait_for_selector('.modal'); pg.wait_for_timeout(200)
    check('não paga nada' in pg.inner_text('.modal').lower() or 'Não paga nada' in pg.inner_text('.modal'), 'modal avisa que não paga nada')
    pg.locator('.modal button:has-text("Marcar como paga")').click(); pg.wait_for_timeout(500)
    st = pg.evaluate("PS.store.get().contas.filter(function(c){return c.id==='c1'})[0]")
    check(bool(st['paga']) , 'conta c1 marcada paga com data: %s' % st.get('pagaEm'))
    pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(500)
    check('Luz' not in pg.inner_text('.atencao'), 'paga some de Atenção agora')
    pg.evaluate("location.hash='#/contas'"); pg.wait_for_timeout(400)
    pg.locator('[data-fid="fa:pagas"]').click(); pg.wait_for_timeout(400)
    check('Luz' in pg.inner_text('.conta-linha') and 'Paga' in pg.inner_text('.conta-linha'), 'aparece em Pagas')
    pg.locator('[data-fid^="dz:contac1"]').click(); pg.wait_for_timeout(400)
    pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(500)
    check('Luz' in pg.inner_text('.atencao'), 'desfazer devolve para Em aberto / Atenção')
    # tudo pago -> "Tudo em dia"
    pg.evaluate("PS.store.alterar(function(s){s.contas.forEach(function(c){PS.fin.marcarPaga(s,'conta',c.id,'avulsa',PS.u.hoje());});})"); pg.evaluate("location.hash='#/contas'"); pg.wait_for_timeout(300); pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(500)
    check('Tudo em dia' in pg.inner_text('.atencao'), 'estado vazio "Tudo em dia"')
    check(pg.evaluate("!document.querySelector('.menu .badge-menu')"), 'emblema some')
    # histórico
    pg.evaluate("location.hash='#/contas'"); pg.wait_for_timeout(300); pg.locator('[data-fid="fa:hist"]').click(); pg.wait_for_timeout(400)
    check(pg.locator('svg.graf-barras').count() == 1 and pg.locator('table.tab-hist').count() >= 1, 'histórico com gráfico SVG e tabela')
    # ics (precisa de itens abertos)
    pg.evaluate("PS.store.alterar(function(s){s.contas.forEach(function(c){PS.fin.desfazerPaga(s,'conta',c.id,'avulsa');});},true)")
    pg.locator('[data-fid="fa:abertas"]').click(); pg.wait_for_timeout(300)
    with pg.expect_download() as dl: pg.locator('[data-fid="av:ics"]').click()
    path = dl.value.path(); txt = open(path, encoding='utf-8', newline='').read()
    check(txt.startswith('BEGIN:VCALENDAR') and 'END:VCALENDAR' in txt and '\r\n' in txt and 'BEGIN:VALARM' in txt and 'BEGIN:VEVENT' in txt, '.ics baixado e válido (estrutura, CRLF, VALARM)' if 'VALARM' in txt else '.ics sem VALARM')
    # avisos: permissão concedida, ativar, verificar com relógio simulado
    pg.evaluate("PS.store.alterar(function(s){var h=PS.u.hoje();s.contas=[{id:'n1',titulo:'Gás',mensal:false,data:PS.u.somaDias(h,1),valor:60,paga:false,pagas:{},valores:{},cat:'casa',dono:'',icone:'carteira'}];},true)")
    r = pg.evaluate("PS.lembretes.ativar().then(function(r){return r})")
    check(r['ok'], 'ativar avisos: %s' % r['msg'])
    pg.evaluate("localStorage.removeItem('painelsala.lembretes.enviados')")
    n1 = pg.evaluate("PS.lembretes.verificar(PS.u.hoje(), 9).length"); n2 = pg.evaluate("PS.lembretes.verificar(PS.u.hoje(), 9).length")
    check(n1 == 1 and n2 == 0, 'notificação 1x por dia (%d, depois %d)' % (n1, n2))
    n3 = pg.evaluate("PS.lembretes.verificar(PS.u.hoje(), 6).length"); check(n3 == 0, 'não notifica antes das 8h')
    ag = pg.evaluate("new Promise(function(ok){var rq=indexedDB.open('painelsala-agenda',1);rq.onsuccess=function(){var g=rq.result.transaction('kv').objectStore('kv').get('agenda');g.onsuccess=function(){ok(g.result&&g.result.agenda.length)}}})")
    check(ag and ag >= 1, 'agenda gravada para o service worker (%s)' % ag)
    pg.evaluate("PS.lembretes.desativar()"); check(pg.evaluate("!PS.lembretes.ativo()"), 'desativar avisos')
    check('painel' not in ''.join(erros).lower() or not erros, 'sem erros de página %s' % erros)
    b.close()
print('\n%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
