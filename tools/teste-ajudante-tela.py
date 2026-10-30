#!/usr/bin/env python3
"""Teste de tela do Ajudante: perguntas rápidas sem modelo, semana de segunda a domingo, limpeza de repetição e entrada por voz (reconhecimento simulado). Uso: python3 tools/teste-ajudante-tela.py [--chrome CAMINHO] [--prints PASTA]  byGui"""
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
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w, hh in [(390, 844), (1280, 800)]:
        ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_init_script(RELOGIO + VOZ)
        enviados = []
        def rota(r):
            enviados.append(json.loads(r.request.post_data or '{}'))
            r.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, body=json.dumps({'resposta': 'A conta de luz vence sáb, 31/10. A conta de luz vence sáb, 31/10. A conta de luz vence sáb, 31/10.......'}))
        ctx.route('**/minha-casa-assistente**', rota)
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/'); pg.wait_for_timeout(700); pg.evaluate(DADOS)
        check(pg.evaluate('PS.u.hoje()') == '2026-10-30', '[%d] relógio fixo em sexta 30/10' % w)
        pg.evaluate("location.hash='#/assistente'"); pg.wait_for_timeout(400)
        pg.locator('[data-fid="ass-rapida-0"]').click(); pg.wait_for_timeout(200)
        t = pg.locator('.ass-msg.ia .ass-texto').last.inner_text()
        check('Luz' in t and 'Escola' not in t and '01/11' in t, '[%d] essa semana = até domingo 01/11, sem Escola (02/11): %r' % (w, t))
        pg.locator('[data-fid="ass-rapida-3"]').click(); pg.wait_for_timeout(200)
        t = pg.locator('.ass-msg.ia .ass-texto').last.inner_text()
        check('Dentista' in t and '22/11' not in t, '[%d] agenda amanhã sem o aniversário de 22/11' % w)
        check(not enviados, '[%d] perguntas rápidas não chamam o modelo' % w)
        pg.fill('[data-fid="ass-pergunta"]', 'Me fala da conta de luz'); pg.locator('[data-fid="ass-enviar"]').click(); pg.wait_for_timeout(500)
        t = pg.locator('.ass-msg.ia .ass-texto').last.inner_text()
        check(t.count('vence') == 1 and '...' not in t and '…' not in t, '[%d] resposta do modelo sem repetição nem reticências: %r' % (w, t))
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/ajudante-respostas-390.png', full_page=False); pg.wait_for_timeout(500)
        mic = pg.locator('[data-fid="ass-voz"]')
        bb = mic.bounding_box()
        check(mic.count() == 1 and bb['width'] >= 44 and bb['height'] >= 44 and mic.get_attribute('aria-label') == 'Falar a pergunta', '[%d] botão de voz visível, 44px, com aria-label' % w)
        mic.click(); pg.wait_for_timeout(100)
        check(pg.evaluate('window.__rec.lang') == 'pt-BR' and mic.get_attribute('aria-pressed') == 'true' and 'ouvindo' in (mic.get_attribute('class') or ''), '[%d] ouvindo em pt-BR com estado visual' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/ajudante-ouvindo-390.png', full_page=False)
        n = len(enviados)
        pg.evaluate("var r=window.__rec;r.onresult({results:[[{transcript:'tem conta atrasada'}]]})")
        check(pg.input_value('[data-fid="ass-pergunta"]') == 'tem conta atrasada', '[%d] texto falado aparece no campo' % w)
        pg.evaluate("window.__rec.onend()"); pg.wait_for_timeout(600)
        t = pg.locator('.ass-msg.ia .ass-texto').last.inner_text()
        check('Água' in t and mic.get_attribute('aria-pressed') == 'false', '[%d] ao terminar a escuta envia a pergunta: %r' % (w, t))
        sw = pg.evaluate('document.documentElement.scrollWidth'); check(sw <= w, '[%d] sem rolagem horizontal (%d)' % (w, sw))
        if a.prints: pg.screenshot(path=a.prints + '/ajudante-voz-%d.png' % w, full_page=True)
        check(not erros, '[%d] sem erros de JS %s' % (w, erros)); ctx.close()
    # sem suporte: botão escondido
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script("delete window.webkitSpeechRecognition; delete window.SpeechRecognition;")
    pg = ctx.new_page(); pg.goto(base + '#/assistente'); pg.wait_for_timeout(700)
    check(pg.locator('[data-fid="ass-voz"]').count() == 0 and pg.locator('[data-fid="ass-pergunta"]').count() == 1, '[390] sem Web Speech o botão de voz não aparece')
    ctx.close(); b.close()
print('\n%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
