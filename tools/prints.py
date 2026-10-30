#!/usr/bin/env python3
"""Gera os prints a 390 px em docs/prints/ com dados SINTÉTICOS (nada real). Uso: python3 tools/prints.py [--chrome CAMINHO]
Pré-requisito: PDFs sintéticos (tools/gerar-pdfs-teste.py)."""
import argparse, functools, http.server, pathlib, socketserver, threading
from playwright.sync_api import sync_playwright
raiz = pathlib.Path(__file__).resolve().parent.parent
out = raiz / 'docs' / 'prints'; out.mkdir(exist_ok=True)
pdfs = raiz / 'tools' / 'pdfs-teste'
ap = argparse.ArgumentParser(); ap.add_argument('--chrome'); a = ap.parse_args()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/index.html' % httpd.server_address[1]
SEED = """PS.store.alterar(function(s){var h=PS.u.hoje(),m0=PS.u.ym(h),M=function(i){return PS.u.somaMes(m0,i);};
 var D=function(i,d){return PS.u.dataNoMes(M(i),d);};
 s.contas=[
  {id:'c1',titulo:'Luz',mensal:true,dia:Number(h.slice(8))-2>0?Number(h.slice(8))-2:1,valor:187.4,pagas:(function(){var o={};o[M(-2)]=D(-2,8);o[M(-1)]=D(-1,8);return o;})(),valores:(function(){var o={};o[M(-2)]=142.1;o[M(-1)]=165.8;return o;})(),cat:'casa',dono:'',icone:'raio',desde:M(-2)},
  {id:'c2',titulo:'Internet',mensal:true,dia:Number(h.slice(8)),valor:119.9,pagas:(function(){var o={};o[M(-2)]=D(-2,10);o[M(-1)]=D(-1,10);return o;})(),valores:{},cat:'casa',dono:'',icone:'carteira',desde:M(-2)},
  {id:'c3',titulo:'Condomínio',mensal:true,dia:28,valor:640,pagas:(function(){var o={};o[M(-2)]=D(-2,27);o[M(-1)]=D(-1,28);return o;})(),valores:{},cat:'casa',dono:'',icone:'carteira',desde:M(-2)},
  {id:'c4',titulo:'Casinha nova do Bilu',mensal:false,data:PS.u.somaDias(h,4),valor:289.9,paga:false,pagas:{},valores:{},cat:'pet',dono:'',icone:'casa-de-cachorro'}];
 s.faturas=[];s.cartoes=[];s.lancs=[];},true);"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, accept_downloads=True)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: print('ERRO', e))
    def foto(nome, full=False): pg.wait_for_timeout(1300); pg.screenshot(path=str(out / nome), full_page=full); print('ok', nome)
    pg.goto(base + '#/'); pg.wait_for_selector('.hoje'); pg.evaluate(SEED)
    pg.evaluate("location.hash='#/contas'"); pg.wait_for_timeout(300); pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(500); foto('01-hoje.png')
    pg.evaluate("location.hash='#/contas'"); pg.wait_for_timeout(500); foto('02-contas-em-aberto.png', True)
    pg.evaluate("location.hash='#/contas'"); pg.wait_for_selector('[data-fid]'); 
    try: pg.locator('.abas button:has-text("Histórico"), button:has-text("Histórico")').first.click(); foto('03-contas-historico.png', True)
    except Exception as e: print('sem aba histórico', e)
    pg.evaluate("location.hash='#/cartoes'"); pg.wait_for_selector('.cartoes')
    for i, nome in enumerate(['nubank-sintetico.pdf', 'itau-sintetico.pdf']):
        pg.locator('[data-fid="ct:arq"]').set_input_files(str(pdfs / nome)); pg.wait_for_selector('[data-fid="rv:salvar"]', timeout=25000)
        if i == 0: foto('04-cartoes-revisao.png', True)
        pg.locator('[data-fid="rv:salvar"]').click(); pg.wait_for_selector('.fat-total'); pg.wait_for_timeout(800)
    foto('05-cartoes-painel.png', True)
    pg.evaluate("location.hash='#/instalar'"); pg.wait_for_timeout(500); foto('06-instalar.png')
    b.close()
