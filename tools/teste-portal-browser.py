#!/usr/bin/env python3
"""Teste no navegador do portal LOCAL (wrangler dev): login pela tela, app atrás do login, PDF.js sob a CSP do portal,
instalabilidade PWA, "Sair" limpando cache. Uso: python3 tools/teste-portal-browser.py --url http://127.0.0.1:8799 [--chrome CAMINHO]
Mesmos pré-requisitos de teste-portal.py (contas de teste no D1 local, recém-semeadas)."""
import argparse, json, pathlib, sys
from playwright.sync_api import sync_playwright
raiz = pathlib.Path(__file__).resolve().parent.parent
tot = json.loads((raiz / 'tools/pdfs-teste/totais.json').read_text())
ap = argparse.ArgumentParser(); ap.add_argument('--url', required=True); ap.add_argument('--chrome'); ap.add_argument('--prints'); a = ap.parse_args()
B = a.url.rstrip('/')
if 'workers.dev' in B: sys.exit('Recusado: só roda em ambiente local.')
T = 'tokenTesteGuiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; SENHA = 'Casa-Senha-De-Teste-77!'
ok, falhas = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True)
    pg = ctx.new_page(); erros = []; csp = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.on('console', lambda m: csp.append(m.text) if ('Content Security Policy' in m.text or 'Refused' in m.text) else None)
    pg.goto(B + '/'); pg.wait_for_selector('#f')
    check(pg.url.endswith('/login'), 'abrir / sem login leva para /login')
    check(pg.locator('text=byGui').count() >= 1 and pg.locator('img').count() >= 1, 'login tem logo e rodapé byGui')
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'login sem rolagem horizontal em 390px')
    if a.prints: pg.screenshot(path=a.prints + '/login.png')
    pg.goto(B + '/primeiro-acesso?t=' + T); pg.wait_for_selector('#s1')
    pg.fill('#s1', SENHA); pg.fill('#s2', 'diferente-diferente-1'); pg.click('#bt'); pg.wait_for_timeout(400)
    check(pg.inner_text('#erro').strip() != '', 'senhas diferentes: mostra erro e não envia')
    pg.fill('#s2', SENHA); pg.click('#bt'); pg.wait_for_selector('.hoje', timeout=20000)
    check(pg.url.rstrip('/') == B, 'primeiro acesso cria a senha e entra no app')
    pg.wait_for_selector('[data-fid="portal-conta"]', timeout=8000)
    check('Guilherme' in pg.inner_text('[data-fid="portal-conta"]'), 'rodapé mostra o nome logado, Conta e Sair')
    pg.wait_for_function("navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))", timeout=15000); pg.reload(); pg.wait_for_selector('.hoje')
    pg.wait_for_function("navigator.serviceWorker.controller !== null", timeout=10000)
    check(True, 'service worker registrado e controlando a página sob o login')
    cdp = ctx.new_cdp_session(pg)
    try:
        r = cdp.send('Page.getInstallabilityErrors'); er = [e.get('errorId') for e in r.get('installabilityErrors', [])]
        er = [e for e in er if e != 'in-incognito']; check(er == [], 'Chrome: sem erros de instalabilidade além do modo anônimo do teste (%s)' % er)
    except Exception as e:
        check(False, 'instalabilidade: %s' % e)
    m = pg.evaluate("fetch('/manifest.webmanifest').then(r=>r.json())")
    check(m['display'] == 'standalone' and m['name'] == 'Minha Casa em Ordem' and m['short_name'] == 'Casa em Ordem' and len(m.get('shortcuts', [])) >= 2, 'manifest: nome, standalone, atalhos')
    # PDF.js sob a CSP do portal
    pg.evaluate("PS.store.alterar(function(s){s.faturas=[];s.cartoes=[];s.lancs=[];s.contas=[];},true)")
    pg.evaluate("location.hash='#/cartoes'"); pg.wait_for_selector('.cartoes')
    pg.locator('[data-fid="ct:arq"]').set_input_files(str(raiz / 'tools/pdfs-teste/nubank-sintetico.pdf'))
    pg.wait_for_selector('[data-fid="rv:salvar"]', timeout=25000)
    check(abs(float(pg.input_value('[data-fid="rv:total"]')) - tot['nubank-sintetico.pdf']['total']) < 0.005, 'PDF lido no aparelho com a CSP do portal (total confere)')
    check(csp == [] and erros == [], 'sem violação de CSP nem erro de JS %s %s' % (csp[:2], erros[:2]))
    pg.locator('[data-fid="rv:cancelar"]').click()
    # conta
    pg.goto(B + '/conta'); pg.wait_for_selector('#lista tr', timeout=8000)
    check(pg.locator('#lista tr').count() == 2 and pg.locator('#lista tr button').count() >= 1, 'página Conta lista as 2 contas com ação sobre a outra')
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Conta sem rolagem horizontal em 390px')
    if a.prints: pg.screenshot(path=a.prints + '/conta.png')
    pg.goto(B + '/'); pg.wait_for_selector('[data-fid="portal-sair"]')
    n_cache = pg.evaluate("caches.keys().then(k=>k.length)"); check(n_cache >= 1, 'há cache offline antes de sair (%d)' % n_cache)
    pg.click('[data-fid="portal-sair"]'); pg.wait_for_url('**/login', timeout=10000)
    check(pg.evaluate("caches.keys().then(k=>k.length)") == 0, 'Sair apaga o cache offline')
    check(pg.evaluate("navigator.serviceWorker.getRegistrations().then(r=>r.length)") == 0, 'Sair remove o service worker')
    pg.goto(B + '/'); pg.wait_for_selector('#f'); check(pg.url.endswith('/login'), 'depois de sair, / volta ao login')
    # login pela tela
    pg.fill('#email', 'gui@teste.local'); pg.fill('#senha', 'errada-errada-1'); pg.click('#bt'); pg.wait_for_timeout(800)
    check(pg.inner_text('#erro').strip() != '' and pg.url.endswith('/login'), 'senha errada: erro na tela')
    pg.fill('#senha', SENHA); pg.click('#bt'); pg.wait_for_selector('.hoje', timeout=20000); check(True, 'login pela tela com a senha certa')
    b.close()
print('\n%d ok / %d falhas' % (len(ok), len(falhas))); sys.exit(1 if falhas else 0)
