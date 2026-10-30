#!/usr/bin/env python3
"""Teste de tela: máscara de data e hora (teclado numérico do Android).  Antigo: restaurantes quando a localização falha (bairro digitado, lembrado; mensagens por tipo de erro): perguntas rápidas sem modelo, semana de segunda a domingo, limpeza de repetição e entrada por voz (reconhecimento simulado). Uso: python3 tools/teste-ajudante-tela.py [--chrome CAMINHO] [--prints PASTA]  byGui"""
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
        ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_init_script(RELOGIO)
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/assistente'); pg.wait_for_timeout(800); pg.evaluate(DADOS)
        for dest, tit, dig, iso, hdig, hiso in [('tarefa', 'Pagar IPTU', '07112026', '2026-11-07', None, None), ('agenda', 'Reunião escola', '071126', '2026-11-07', '1430', '14:30'), ('tarefa', 'Levar carro', '7.11.26', '2026-11-07', None, None)]:
            pg.evaluate("PS.foto.revisar({destino:'%s',titulo:'%s',data:'',hora:'',local:''})" % (dest, tit)); pg.wait_for_timeout(300)
            d = pg.locator('[data-fid="ft:data"]')
            check(d.get_attribute('inputmode') == 'numeric' and d.get_attribute('type') == 'text', '[%d] %s: campo de data com teclado numérico' % (w, dest))
            d.click(); pg.keyboard.type(dig, delay=30)
            check(d.input_value() in ('07/11/2026', '07/11/26'), '[%d] %s: digitar %s mostra %r' % (w, dest, dig, d.input_value()))
            if hdig:
                hr = pg.locator('[data-fid="ft:hora"]'); hr.click(); pg.keyboard.type(hdig, delay=30)
                check(d.input_value() == '07/11/2026', '[%d] ao sair do campo, ano 26 vira 2026' % w)
                check(hr.input_value() == hiso and hr.get_attribute('inputmode') == 'numeric', '[%d] digitar %s mostra %r' % (w, hdig, hr.input_value()))
            pg.locator('.modal button', has_text='Salvar').click(); pg.wait_for_timeout(300)
            s = pg.evaluate('PS.store.get()')
            if dest == 'tarefa':
                t = [x for x in s['tarefas'] if x['titulo'] == tit]
                check(len(t) == 1 and t[0]['vence'] == iso, '[%d] tarefa salva com vence %s: %r' % (w, iso, t and t[0]['vence']))
            else:
                t = [x for x in s['compromissos'] if x['titulo'] == tit]
                check(len(t) == 1 and t[0]['data'] == iso and t[0]['hora'] == hiso, '[%d] compromisso salvo %s %s: %r' % (w, iso, hiso, t and (t[0]['data'], t[0]['hora'])))
        # data inválida continua avisando
        pg.evaluate("PS.foto.revisar({destino:'tarefa',titulo:'X',data:'',hora:'',local:''})"); pg.wait_for_timeout(300)
        pg.locator('[data-fid="ft:data"]').click(); pg.keyboard.type('31022026'); pg.locator('.modal button', has_text='Salvar').click(); pg.wait_for_timeout(300)
        check('Data inválida' in pg.locator('.modal').inner_text(), '[%d] 31/02 continua dando aviso' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/mascara-data-390.png')
        pg.locator('.modal button', has_text='Cancelar').click(); pg.wait_for_timeout(200)
        # campos nativos (Gerenciar): seletor do Chrome dispara change com ISO
        pg.goto(base + '#/gerenciar/tarefas'); pg.wait_for_timeout(600)
        nat = pg.evaluate("[].slice.call(document.querySelectorAll('input')).filter(function(e){return e.type==='date'}).length")
        check(nat >= 1, '[%d] Gerenciar usa seletor nativo de data (%d campos)' % (w, nat))
        pg.evaluate("var e=[].slice.call(document.querySelectorAll('input')).filter(function(e){return e.type==='date'})[0];e.value='2026-11-07';e.dispatchEvent(new Event('change',{bubbles:true}))"); pg.wait_for_timeout(300)
        check(any(x.get('vence') == '2026-11-07' for x in pg.evaluate('PS.store.get().tarefas')), '[%d] data escolhida no seletor nativo é salva' % w)
        check(not erros, '[%d] sem erros: %r' % (w, erros)); ctx.close()
    b.close()
print('%d ok, %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
