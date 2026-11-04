#!/usr/bin/env python3
"""Teste de autoria: registros novos mostram quem criou (login do portal); dados antigos sem "por" continuam funcionando sem rótulo. byGui"""
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
FOTO = {'r': {}}
CHAT = {'r': ''}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w, hh in [(390, 844), (1280, 800)]:
        ctx = b.new_context(viewport={'width': w, 'height': hh})
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/'); pg.wait_for_timeout(700)
        # dados antigos (sem "por") passam pela sanitização sem quebrar
        pg.evaluate("PS.store.substituir({tarefas:[{id:'old1',titulo:'Tarefa antiga',lista:'Casa'}],compromissos:[{id:'old2',titulo:'Evento antigo',data:PS.u.hoje()}],compras:[{id:'old3',nome:'Feijão'}],contas:[],notas:[]})")
        st = pg.evaluate("(function(s){return [s.tarefas[0].por,s.compromissos[0].por,s.compras[0].por]})(PS.store.get())")
        check(st == ['', '', ''], '[%d] dados antigos ficam sem autor: %r' % (w, st))
        check(pg.evaluate("PS.store.autor()") == '', '[%d] sem login (GitHub Pages) não há autor' % w)
        pg.evaluate("PS.store.alterar(function(s){s.tarefas.push(PS.store.sanearItem('tarefas',null,{titulo:'Sem login',lista:'Casa'}));})")
        check(pg.evaluate("PS.store.get().tarefas[1].por") == '', '[%d] sem login, item novo sem autor' % w)
        pg.evaluate("localStorage.setItem('mco-autor','Gui')")
        pg.evaluate("""PS.store.alterar(function(s){s.tarefas.push(PS.store.sanearItem('tarefas',null,{titulo:'Comprar tinta',lista:'Casa'}));
          s.compromissos.push(PS.store.sanearItem('compromissos',null,{titulo:'Reunião escola',data:PS.u.hoje(),hora:'19:00',fonte:'manual'}));
          s.compras.push(PS.store.sanearItem('compras',null,{nome:'Leite'}));
          s.contas.push(PS.store.sanearItem('contas',null,{titulo:'Gás',mensal:false,data:PS.u.hoje(),dia:1,valor:100}));
          s.notas.push(PS.store.sanearItem('notas',null,{loja:'Mercado X',data:PS.u.hoje(),total:10,itens:[]}));
          s.tarefas[0].titulo='Tarefa antiga editada';})""")
        r = pg.evaluate("(function(s){var f=function(l,k,v){return (l.filter(function(x){return x[k]===v})[0]||{}).por};return [f(s.tarefas,'titulo','Comprar tinta'),f(s.compromissos,'titulo','Reunião escola'),f(s.compras,'nome','Leite'),f(s.contas,'titulo','Gás'),f(s.notas,'loja','Mercado X'),s.tarefas[0].por]})(PS.store.get())")
        check(r == ['Gui', 'Gui', 'Gui', 'Gui', 'Gui', ''], '[%d] novos registros nas 5 coleções levam o autor; editar antigo não muda: %r' % (w, r))
        pg.evaluate("localStorage.setItem('mco-autor','Esposa')"); pg.evaluate("PS.store.alterar(function(s){s.tarefas[2].feita=false;})")
        check(pg.evaluate("PS.store.get().tarefas[2].por") == 'Gui', '[%d] autor não é sobrescrito por outra pessoa' % w)
        # sobrevive a recarregar (formato salvo) e chega pelo sync (sanearItem preserva)
        pg.reload(); pg.wait_for_timeout(700)
        check(pg.evaluate("PS.store.get().tarefas[2].por") == 'Gui', '[%d] autor persiste ao recarregar' % w)
        check(pg.evaluate("PS.store.sanearItem('tarefas','x',{titulo:'Do outro aparelho',por:'Esposa'}).por") == 'Esposa', '[%d] item vindo do sync mantém o autor' % w)
        pg.evaluate("location.hash='#/tarefas'"); pg.wait_for_timeout(400)
        txt = pg.locator('#app').inner_text()
        check('por Gui' in txt and pg.locator('.tag-por', has_text='por').count() >= 1, '[%d] Tarefas mostra "por Gui"' % w)
        check(pg.locator('[data-fid="por:old1"]').count() == 0, '[%d] tarefa antiga sem rótulo' % w)
        pg.evaluate("location.hash='#/agenda'"); pg.wait_for_timeout(400)
        check('por Gui' in pg.locator('#app').inner_text(), '[%d] Agenda mostra "por Gui"' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/autor-agenda-390.png')
        check(not erros, '[%d] sem erros de JS %r' % (w, erros))
        ctx.close()
    b.close()
httpd.shutdown()
print('\n%d ok, %d falhas' % (len(ok), len(falhas)))
sys.exit(1 if falhas else 0)
