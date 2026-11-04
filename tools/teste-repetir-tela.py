#!/usr/bin/env python3
import argparse, functools, http.server, json, pathlib, socketserver, threading, sys
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
# Teste de tela: Repetir em compromisso manual e em tarefa.  python3 tools/teste-repetir-tela.py [--chrome] [--prints]  byGui
def campo(linha, rot): return linha.locator('label.campo:has(> span:text-is("%s"))' % rot).locator('input, select').first
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w, hh in [(390, 844), (1280, 800)]:
        pg = b.new_page(viewport={'width': w, 'height': hh}); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/'); pg.wait_for_timeout(800)
        pg.evaluate("PS.store.alterar(function(s){s.compromissos=[];s.tarefas=[];},true)")
        hoje = pg.evaluate('PS.u.hoje()'); aniv = pg.evaluate("(function(h){var a=+h.slice(0,4)-1;return a+PS.u.somaDias(h,3).slice(4);})(PS.u.hoje())")
        prox = pg.evaluate("PS.u.somaDias(PS.u.hoje(),3)")
        # 1) compromisso manual anual
        pg.evaluate("location.hash='#/gerenciar/agenda'"); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='+ Novo compromisso').click(); pg.wait_for_timeout(200)
        ln = pg.locator('.form-linha[data-id]').first
        r = campo(ln, 'Repetir')
        opts = r.locator('option').all_inner_texts()
        check(opts == ['Não repete', 'Diária', 'Semanal', 'Mensal', 'Anual'], '[%d] Repetir com as 5 opções: %s' % (w, opts))
        check(ln.locator('label.campo:has(> span:text-is("Até (opcional)"))').count() == 0, '[%d] Até só aparece quando repete' % w)
        campo(ln, 'Compromisso').fill('Aniversario victor'); campo(ln, 'Data').fill(aniv)
        r.select_option('anual'); pg.wait_for_timeout(200)
        ln = pg.locator('.form-linha[data-id]').first
        check(ln.locator('label.campo:has(> span:text-is("Até (opcional)"))').count() == 1, '[%d] campo Até (opcional) aparece' % w)
        bx = campo(ln, 'Repetir').bounding_box(); check(bx['height'] >= 44, '[%d] Repetir com 44px' % w)
        c = [x for x in pg.evaluate('PS.store.get().compromissos') if x['titulo'] == 'Aniversario victor']
        check(len(c) == 1 and c[0]['repete'] == 'anual' and c[0]['data'] == aniv, '[%d] grava 1 compromisso anual (data original %s)' % (w, aniv))
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/repetir-compromisso-390.png')
        pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(400)
        check(pg.locator('[data-fid="cp:%s@%s"]' % (c[0]['id'], prox)).count() == 1, '[%d] Hoje mostra o aniversário deste ano (%s)' % (w, prox))
        pg.evaluate("location.hash='#/agenda'"); pg.wait_for_timeout(300)
        if prox[:7] != hoje[:7]: pg.locator('.cal-nav button').last.click(); pg.wait_for_timeout(200)
        pg.locator('[data-fid="cd:%s"]' % prox).click(); pg.wait_for_timeout(200)
        check('Aniversario victor' in pg.inner_text('main'), '[%d] Agenda mostra no dia %s' % (w, prox))
        # 2) tarefa semanal: concluir cria a próxima
        pg.evaluate("location.hash='#/gerenciar/tarefas'"); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='+ Nova tarefa').click(); pg.wait_for_timeout(200)
        ln = pg.locator('.form-linha[data-id]').first
        campo(ln, 'Tarefa').fill('Regar plantas'); campo(ln, 'Vence em').fill(hoje); campo(ln, 'Repetir').select_option('semanal'); pg.wait_for_timeout(200)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/repetir-tarefa-390.png')
        t = [x for x in pg.evaluate('PS.store.get().tarefas') if x['titulo'] == 'Regar plantas']
        check(len(t) == 1 and t[0]['repete'] == 'semanal', '[%d] tarefa semanal gravada' % w)
        pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(400)
        pg.locator('[data-fid="tr:%s"]' % t[0]['id']).click(); pg.wait_for_timeout(300)
        t = [x for x in pg.evaluate('PS.store.get().tarefas') if x['titulo'] == 'Regar plantas']
        sete = pg.evaluate("PS.u.somaDias(PS.u.hoje(),7)")
        check(len(t) == 2 and sum(1 for x in t if x['feita']) == 1 and any(not x['feita'] and x['vence'] == sete and x['repete'] == 'semanal' for x in t), '[%d] concluir cria a próxima com prazo %s' % (w, sete))
        # 3) concluir pelo Gerenciar também cria uma só
        pg.evaluate("location.hash='#/gerenciar/tarefas'"); pg.wait_for_timeout(300)
        nv = [x for x in t if not x['feita']][0]
        pg.locator('.form-linha[data-id="%s"] label.campo.marcar input' % nv['id']).check(); pg.wait_for_timeout(300)
        t = [x for x in pg.evaluate('PS.store.get().tarefas') if x['titulo'] == 'Regar plantas']
        check(len(t) == 3 and any(x['vence'] == pg.evaluate("PS.u.somaDias(PS.u.hoje(),14)") and not x['feita'] for x in t), '[%d] concluir no Gerenciar cria a seguinte' % w)
        sw = pg.evaluate('document.documentElement.scrollWidth'); check(sw <= w, '[%d] sem rolagem horizontal (%d)' % (w, sw))
        check(not erros, '[%d] sem erros de JS %s' % (w, erros)); pg.close()
    b.close()
print('%d ok, %d falhas' % (len(ok), len(falhas))); raise SystemExit(1 if falhas else 0)
