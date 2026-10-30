#!/usr/bin/env python3
"""Teste de tela: nenhuma tela com rolagem horizontal a 360 e 390px (scrollWidth > clientWidth falha).  Antigo: restaurantes quando a localização falha (bairro digitado, lembrado; mensagens por tipo de erro): perguntas rápidas sem modelo, semana de segunda a domingo, limpeza de repetição e entrada por voz (reconhecimento simulado). Uso: python3 tools/teste-ajudante-tela.py [--chrome CAMINHO] [--prints PASTA]  byGui"""
import argparse, functools, http.server, pathlib, socketserver, threading, sys, json
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
# relógio fixo: sexta 30/10/2026 12:00 em São Paulo
RELOGIO = "(function(){var T=Date.UTC(2026,9,30,15,0,0),D=Date;function F(a,b,c,d,e,f,g){if(!arguments.length)return new D(T);return new (Function.prototype.bind.apply(D,[null].concat([].slice.call(arguments))))();}F.now=function(){return T};F.UTC=D.UTC;F.parse=D.parse;F.prototype=D.prototype;window.Date=F;})();"
VOZ = """window.__rec=null;window.webkitSpeechRecognition=window.SpeechRecognition=function(){window.__rec=this;this.start=function(){this.iniciado=true};this.stop=function(){this.onend&&this.onend()}};"""
DADOS = """PS.store.alterar(function(s){
 s.contas=[{id:'c1',titulo:'Luz',mensal:false,data:'2026-10-31',dia:31,valor:120},{id:'c2',titulo:'Escola',mensal:false,data:'2026-11-02',dia:2,valor:900},{id:'c3',titulo:'Água',mensal:false,data:'2026-10-28',dia:28,valor:80}];
 s.compromissos=[{id:'a1',titulo:'Dentista',data:'2026-10-31',hora:'09:00',fonte:'manual'},{id:'a2',titulo:'Aniversário Ana',data:'2026-11-22',hora:'',fonte:'manual'}];
 s.tarefas=[{id:'t1',lista:'Casa',titulo:'Trocar filtro',prio:'alta',vence:'',feita:false}];},true);"""
CART = """PS.store.alterar(function(s){
 s.cartoes=[{id:'k1',apelido:'Itaú Personnalité Black',final:'1234',diaFecha:3,diaVenc:10,dono:'casal'}];
 s.faturas=[{id:'f9',cartao:'k1',mes:'2026-09',valor:6712.53,vencimento:'2026-09-10',status:'paga'},{id:'f10',cartao:'k1',mes:'2026-10',valor:7826.78,vencimento:'2026-10-10',status:'aberta'}];
 var C=['mercado','restaurante','transporte','saude','educacao','lazer','assinaturas','casa','compras','viagens','encargos','outros'],L=[];
 C.forEach(function(c,i){L.push({id:'a'+i,fatura:'f9',data:'2026-09-0'+(1+i%9),desc:'SUPERMERCADO EXTRAORDINARIO DE TESTE LONGO '+i,valor:1606.02-i*90,cat:c});L.push({id:'b'+i,fatura:'f10',data:'2026-10-0'+(1+i%9),desc:'RESTAURANTES/DELIVERY COM NOME COMPRIDO '+i,valor:2585.22-i*80,cat:c});});
 s.lancs=L;
 s.contas.push({id:'c9',titulo:'Condomínio do edifício residencial com nome bem comprido',mensal:true,dia:5,valor:1234567.89});},true);"""
ROTAS = ['', 'tarefas', 'agenda', 'compras', 'contas', 'cartoes', 'relaxar', 'gerenciar', 'gerenciar/tarefas', 'gerenciar/agenda', 'gerenciar/contas', 'assistente', 'importar', 'instalar', 'sincronizar']
MEDE = """(function(){var d=document.documentElement,r={sw:d.scrollWidth,cw:d.clientWidth,bsw:document.body.scrollWidth,culpados:[]};
 if(r.sw>r.cw||r.bsw>r.cw){[].slice.call(document.querySelectorAll('body *')).forEach(function(e){var b=e.getBoundingClientRect();if(b.width&&b.right>r.cw+1&&r.culpados.length<6&&getComputedStyle(e).position!=='fixed')r.culpados.push((e.className&&e.className.baseVal==null?e.className:e.tagName)+' '+Math.round(b.right));});}
 return r;})()"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w in (360, 390):
        ctx = b.new_context(viewport={'width': w, 'height': 800}); ctx.add_init_script(RELOGIO)
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/'); pg.wait_for_timeout(800); pg.evaluate(DADOS); pg.evaluate(CART)
        for r in ROTAS:
            pg.evaluate("location.hash='#/%s'" % r); pg.wait_for_timeout(700)
            m = pg.evaluate(MEDE)
            check(m['sw'] <= m['cw'] and m['bsw'] <= m['cw'], '[%d] #/%s sem rolagem horizontal (scroll %d / tela %d) %s' % (w, r, max(m['sw'], m['bsw']), m['cw'], m['culpados']))
            if r == 'cartoes':
                if a.prints and w == 390: pg.screenshot(path=a.prints + '/cartoes-comparacao-390.png', full_page=True)
                for sel in ('.tab-hist', '.graf-barras'):
                    bx = pg.evaluate("[].slice.call(document.querySelectorAll('%s')).map(function(e){var b=e.getBoundingClientRect();return [b.left,b.right]})" % sel)
                    check(bx and all(x[0] >= 0 and x[1] <= w for x in bx), '[%d] %s cabe na tela: %r' % (w, sel, bx))
                rot = pg.evaluate("[].slice.call(document.querySelectorAll('.graf-barras .b-rot')).map(function(e){var b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth})")
                check(rot and all(rot), '[%d] rótulos das barras visíveis' % w)
        check(not erros, '[%d] sem erros: %r' % (w, erros)); ctx.close()
    b.close()
print('%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
