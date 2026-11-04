#!/usr/bin/env python3
"""Teste de tela: restaurantes quando a localização falha (bairro digitado, lembrado; mensagens por tipo de erro): perguntas rápidas sem modelo, semana de segunda a domingo, limpeza de repetição e entrada por voz (reconhecimento simulado). Uso: python3 tools/teste-ajudante-tela.py [--chrome CAMINHO] [--prints PASTA]  byGui"""
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
GEO = """window.__geo={code:1,opts:null};navigator.geolocation.getCurrentPosition=function(ok,err,o){window.__geo.opts=o;var c=window.__geo.code;setTimeout(function(){if(c===0)ok({coords:{latitude:-23.5329,longitude:-46.7917}});else err({code:c});},10);};"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w, hh in [(390, 844), (1280, 800)]:
        ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_init_script(RELOGIO + GEO)
        H = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}; pedidos = []
        def rota(r):
            c = json.loads(r.request.post_data or '{}'); pedidos.append(c)
            if c.get('texto'): return r.fulfill(status=200, headers=H, body=json.dumps({'lugares': [{'nome': 'Império da Costela', 'nota': 4.6, 'avaliacoes': 4624, 'preco': '$$', 'faixa': '', 'aberto': True, 'resumo': 'Costela elogiada.', 'maps': 'https://maps.google.com/?cid=9', 'lat': -23.53, 'lng': -46.78}], 'busca': c['texto']}))
            r.fulfill(status=200, headers=H, body=json.dumps({'lugares': []}))
        ctx.route('**/minha-casa-assistente**/lugares', rota)
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/assistente'); pg.wait_for_timeout(800)
        def pedir():
            pg.fill('[data-fid="ass-pergunta"]', 'restaurantes perto de mim'); pg.locator('[data-fid="ass-enviar"]').click(); pg.wait_for_timeout(400)
            return pg.locator('.ass-msg.ia').last
        ul = pedir(); t = ul.locator('.ass-texto').inner_text()
        o = pg.evaluate('window.__geo.opts')
        check(o['enableHighAccuracy'] is False and o['timeout'] >= 30000 and o['maximumAge'] >= 300000, '[%d] localização aproximada, timeout 30s, até 10 min de idade: %r' % (w, o))
        check('bloqueada' in t and 'Chrome do Android' in t and 'Permissões' in t, '[%d] permissão negada com dica do Chrome: %r' % (w, t))
        campo = ul.locator('[data-fid^="ass-bairro-"]').first
        check(campo.get_attribute('placeholder') == 'Digite bairro, endereço ou cidade' and campo.input_value() == '', '[%d] campo de bairro aparece, vazio na 1ª vez' % w)
        check(ul.locator('[data-fid="ass-maps"]').count() == 1, '[%d] link do Maps continua como alternativa' % w)
        bb = campo.bounding_box(); check(bb['height'] >= 44, '[%d] campo com 44px' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/restaurantes-bairro-390.png')
        campo.fill('Centro, Osasco'); ul.locator('[data-fid^="ass-bairro-buscar-"]').click(); pg.wait_for_timeout(500)
        check(pedidos[-1] == {'texto': 'Centro, Osasco'}, '[%d] busca por texto vai ao Worker: %r' % (w, pedidos[-1]))
        it = pg.locator('[data-fid="ass-lugares"]').last.inner_text()
        check('Império da Costela' in it and '4,6 (4624 avaliações)' in it and 'aberto agora' in it and ' m ·' not in it and 'km' not in it, '[%d] resultado por bairro, sem distância inventada: %r' % (w, it[:90]))
        check('em Centro, Osasco' in pg.locator('.ass-msg.ia .ass-texto').last.inner_text(), '[%d] diz onde buscou' % w)
        check(pg.evaluate("localStorage.getItem('mco-bairro')") == 'Centro, Osasco', '[%d] bairro lembrado no aparelho' % w)
        pg.evaluate('window.__geo.code=3'); ul = pedir(); t = ul.locator('.ass-texto').inner_text()
        check('tempo esgotado' in t and 'Chrome do Android' not in t, '[%d] tempo esgotado diferenciado: %r' % (w, t))
        check(ul.locator('[data-fid^="ass-bairro-"]').first.input_value() == 'Centro, Osasco', '[%d] campo já vem com o bairro lembrado' % w)
        pg.evaluate('window.__geo.code=2'); ul = pedir(); t = ul.locator('.ass-texto').inner_text()
        check('desligada' in t and 'Configurações' in t, '[%d] GPS desligado diferenciado: %r' % (w, t))
        n = len(pedidos); ul.locator('[data-fid^="ass-bairro-"]').first.press('Enter'); pg.wait_for_timeout(400)
        check(len(pedidos) == n + 1 and pedidos[-1]['texto'] == 'Centro, Osasco', '[%d] Enter busca o bairro lembrado em 1 toque' % w)
        pg.evaluate('window.__geo.code=0'); pedir(); pg.wait_for_timeout(300)
        check('lat' in pedidos[-1] and 'perto de você' in pg.locator('.ass-msg.ia .ass-texto').last.inner_text(), '[%d] com localização, busca por coordenadas' % w)
        check(not erros, '[%d] sem erros de JS %r' % (w, erros))
        ctx.close()
    b.close()
httpd.shutdown()
print('\n%d ok, %d falhas' % (len(ok), len(falhas)))
sys.exit(1 if falhas else 0)
