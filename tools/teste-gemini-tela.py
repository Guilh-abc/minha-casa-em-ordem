#!/usr/bin/env python3
"""Teste de tela do Ajudante (Gemini, sugestões dinâmicas, restaurantes): perguntas rápidas sem modelo, semana de segunda a domingo, limpeza de repetição e entrada por voz (reconhecimento simulado). Uso: python3 tools/teste-ajudante-tela.py [--chrome CAMINHO] [--prints PASTA]  byGui"""
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
        ctx = b.new_context(viewport={'width': w, 'height': hh}, geolocation={'latitude': -23.5, 'longitude': -46.6}, permissions=['geolocation']); ctx.add_init_script(RELOGIO)
        estado = {'lug': 'semChave', 'conv': []}
        H = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
        def rota(r):
            u = r.request.url; corpo = json.loads(r.request.post_data or '{}')
            if u.endswith('/lugares'):
                if estado['lug'] == 'semChave': return r.fulfill(status=503, headers=H, body=json.dumps({'erro': 'sem chave', 'semChave': True}))
                return r.fulfill(status=200, headers=H, body=json.dumps({'lugares': [{'nome': 'Cantina Longe', 'nota': 4.2, 'avaliacoes': 90, 'preco': '$$', 'faixa': '', 'aberto': False, 'resumo': '', 'maps': 'https://maps.google.com/?cid=2', 'lat': -23.52, 'lng': -46.6},
                    {'nome': 'Bistrô Perto', 'nota': 4.7, 'avaliacoes': 1200, 'preco': '$$$', 'faixa': '', 'aberto': True, 'resumo': 'Massas elogiadas.', 'maps': 'https://maps.google.com/?cid=1', 'lat': -23.501, 'lng': -46.6}]}))
            if u.endswith('/conversa'):
                estado['conv'].append(corpo); ult = corpo['turnos'][-1]
                if ult.get('r') == 'tool': return r.fulfill(status=200, headers=H, body=json.dumps({'resposta': 'Posso anotar o dentista no sábado às 09:00. Confirma?'}))
                if 'dentista' in ult.get('t', '').lower() and '9' in ult.get('t', ''):
                    return r.fulfill(status=200, headers=H, body=json.dumps({'chamadas': [{'n': 'criar_sugestao', 'a': {'tipo': 'compromisso', 'titulo': 'Dentista', 'data': '2026-10-31', 'hora': '09:00'}}]}))
                if 'dentista' in ult.get('t', '').lower(): return r.fulfill(status=200, headers=H, body=json.dumps({'resposta': 'Para qual dia e horário é o dentista?'}))
                if 'lista' in ult.get('t', '').lower(): return r.fulfill(status=200, headers=H, body=json.dumps({'chamadas': [{'n': 'criar_sugestao', 'a': {'tipo': 'compras', 'titulo': 'Mercado', 'itens': ['leite', 'pão']}}]}))
                return r.fulfill(status=200, headers=H, body=json.dumps({'resposta': 'ok'}))
            r.fulfill(status=200, headers=H, body=json.dumps({'resposta': 'liquid'}))
        ctx.route('**/minha-casa-assistente**', rota)
        pg = ctx.new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/'); pg.wait_for_timeout(700); pg.evaluate(DADOS)
        pg.evaluate("PS.store.alterar(function(s){s.compras=[{id:'k1',nome:'Arroz',comprado:false}];s.tarefas.push({id:'t2',lista:'Casa',titulo:'Pagar IPVA',prio:'media',vence:'2026-10-20',feita:false});},true)")
        pg.evaluate("location.hash='#/assistente'"); pg.wait_for_timeout(400)
        rot = pg.locator('.ass-atalhos .btn').all_inner_texts()
        check(len(rot) == 6, '[%d] 6 sugestões: %r' % (w, rot))
        check(rot[0] == '1 conta atrasada: quais?' and '1 tarefa atrasada: ver' in rot and 'Lista de compras: 1 item' in rot and 'Restaurantes perto de mim' in rot, '[%d] sugestões vêm dos dados reais e da hora (12:00)' % w)
        bb = pg.locator('[data-fid="ass-rapida-0"]').bounding_box(); check(bb['height'] >= 44, '[%d] sugestão com 44px' % w)
        pg.locator('.ass-atalhos .btn', has_text='tarefa atrasada').click(); pg.wait_for_timeout(200)
        t = pg.locator('.ass-msg.ia .ass-texto').last.inner_text(); check('Pagar IPVA' in t and 'Trocar filtro' not in t, '[%d] tarefas atrasadas reais: %r' % (w, t))
        pg.locator('.ass-atalhos .btn', has_text='Lista de compras').click(); pg.wait_for_timeout(200)
        t = pg.locator('.ass-msg.ia .ass-texto').last.inner_text(); check('Arroz' in t, '[%d] lista de compras real: %r' % (w, t))
        # restaurantes sem chave: aviso + link do Maps, sem dados inventados
        pg.locator('.ass-atalhos .btn', has_text='Restaurantes').click(); pg.wait_for_timeout(600)
        t = pg.locator('.ass-msg.ia .ass-texto').last.inner_text(); lk = pg.locator('[data-fid="ass-maps"]').last.get_attribute('href')
        check('Google Maps Platform' in t and pg.locator('[data-fid="ass-lugares"]').count() == 0 and lk.startswith('https://www.google.com/maps/search/restaurantes/@-23.5'), '[%d] sem chave: diz o que falta e dá o link: %r' % (w, t))
        estado['lug'] = 'ok'
        pg.fill('[data-fid="ass-pergunta"]', 'onde jantar hoje?'); pg.locator('[data-fid="ass-enviar"]').click(); pg.wait_for_timeout(600)
        it = pg.locator('[data-fid="ass-lugares"]').last.locator('.ass-lugar').all_inner_texts()
        check(len(it) == 2 and it[0].startswith('Bistrô Perto') and '★ 4,7 (1200 avaliações)' in it[0] and '$$$' in it[0] and '111 m' in it[0] and 'aberto agora' in it[0] and 'Massas elogiadas.' in it[0], '[%d] cartões: nota, avaliações, preço, distância, aberto, resumo, ordem por distância: %r' % (w, it[:1]))
        check('fechado agora' in it[1] and pg.locator('[data-fid="ass-lugar-maps-0"]').last.get_attribute('href') == 'https://maps.google.com/?cid=1', '[%d] fechado e link do Maps por lugar' % w)
        if a.prints and w == 390: pg.locator('[data-fid="ass-lugares"]').last.scroll_into_view_if_needed(); pg.screenshot(path=a.prints + '/ajudante-restaurantes-390.png')
        # Gemini: pergunta o que falta, depois sugere; só grava com Confirmar
        pg.fill('[data-fid="ass-pergunta"]', 'marca o dentista'); pg.locator('[data-fid="ass-enviar"]').click(); pg.wait_for_timeout(500)
        t = pg.locator('.ass-msg.ia .ass-texto').last.inner_text(); check('Para qual dia' in t and pg.locator('.ass-msg.ia').last.locator('[data-fid^="ass-sug"]').count() == 0, '[%d] Gemini pergunta o dado que falta: %r' % (w, t))
        n0 = pg.evaluate('PS.store.get().compromissos.length')
        pg.fill('[data-fid="ass-pergunta"]', 'dentista amanhã às 9'); pg.locator('[data-fid="ass-enviar"]').click(); pg.wait_for_timeout(700)
        ul = pg.locator('.ass-msg.ia').last
        check(ul.locator('[data-fid^="ass-confirmar-"]').count() == 1 and pg.evaluate('PS.store.get().compromissos.length') == n0, '[%d] cartão de sugestão do Gemini, nada gravado antes de confirmar' % w)
        check(len(estado['conv'][-1]['turnos']) >= 4, '[%d] histórico da conversa vai junto (pergunta anterior)' % w)
        ul.locator('[data-fid^="ass-confirmar-"]').click(); pg.wait_for_timeout(300)
        cs = pg.evaluate("PS.store.get().compromissos.filter(function(c){return c.titulo==='Dentista'&&c.data==='2026-10-31'&&c.hora==='09:00'}).length")
        check(pg.evaluate('PS.store.get().compromissos.length') == n0 + 1 and cs >= 1, '[%d] Confirmar grava na Agenda' % w)
        pg.fill('[data-fid="ass-pergunta"]', 'coloca leite e pão na lista'); pg.locator('[data-fid="ass-enviar"]').click(); pg.wait_for_timeout(700)
        ul = pg.locator('.ass-msg.ia').last; ul.locator('[data-fid^="ass-confirmar-"]').click(); pg.wait_for_timeout(300)
        nomes = pg.evaluate("PS.store.get().compras.map(function(c){return c.nome})")
        check('leite' in nomes and 'pão' in nomes and not any('Mercado' in n for n in nomes), '[%d] compras vão para a Lista de compras: %r' % (w, nomes))
        check(not erros, '[%d] sem erros de JS %r' % (w, erros))
        ctx.close()
    b.close()
httpd.shutdown()
print('\n%d ok, %d falhas' % (len(ok), len(falhas)))
sys.exit(1 if falhas else 0)
