#!/usr/bin/env python3
"""Teste de tela da página Carro (#/carro) em 360x740, 390x844 e 1280. Dados criados aqui são de teste, no navegador do teste."""
import sys, argparse, functools, http.server, pathlib, socketserver, threading
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('--chrome'); a = ap.parse_args()
raiz = pathlib.Path(__file__).resolve().parent.parent
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/index.html' % httpd.server_address[1]
ok, falhas = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)
def car(pg): return pg.evaluate('PS.store.get().carro')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w, hh in ((360, 740), (390, 844), (1280, 800)):
        pg = b.new_context(viewport={'width': w, 'height': hh}, has_touch=w < 800).new_page(); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/carro'); pg.wait_for_timeout(700)
        check(pg.locator('[data-fid="car:tela"]').count() == 1, '%d página Carro' % w)
        check(pg.locator('.menu a[href="#/carro"]').count() == 1, '%d link no menu' % w)
        check(pg.locator('[data-fid="car:tanque-vazio"]').count() == 1, '%d tanque vazio pede preencher' % w)
        if w == 390: pg.screenshot(path='/workspace/prints/carro-vazio-390.png', full_page=True)
        check('óleo' in pg.locator('[data-fid="car:painel"]').inner_text() and pg.locator('[data-fid="car:painel"].n-urgente').count() == 1, '%d painel mostra o mais urgente' % w)
        check(pg.locator('[data-fid="car:tanques-vazio"]').count() == 1, '%d consumo real vazio' % w)
        check(pg.locator('[data-fid="car:urgente"]').count() == 1 and '07/11' in pg.locator('[data-fid="car:urgente"]').inner_text(), '%d aviso urgente do óleo' % w)
        pg.locator('[data-fid="car:novo:abastecimento"]').click()
        pg.fill('[data-fid="car:f:valor"]', '200,00'); pg.fill('[data-fid="car:f:litros"]', '40'); pg.fill('[data-fid="car:f:km"]', '1000'); pg.fill('[data-fid="car:f:data"]', '2026-10-01')
        check('5,00' in pg.locator('[data-fid="car:pl"]').inner_text(), '%d preço por litro na hora' % w)
        check(pg.get_attribute('[data-fid="car:f:litros"]', 'inputmode') == 'decimal', '%d teclado decimal' % w)
        pg.locator('[data-fid="car:salvar"]').click(); pg.wait_for_timeout(150)
        pg.locator('[data-fid="car:novo:abastecimento"]').click()
        pg.check('[data-fid="car:f:cheio"]'); pg.fill('[data-fid="car:f:valor"]', '250'); pg.fill('[data-fid="car:f:litros"]', '40'); pg.fill('[data-fid="car:f:km"]', '1250'); pg.fill('[data-fid="car:f:data"]', '2026-10-15')
        pg.locator('[data-fid="car:salvar"]').click(); pg.wait_for_timeout(150)
        pg.locator('[data-fid="car:novo:oleo"]').click(); pg.fill('[data-fid="car:f:oleo"]', '5W30 sintético'); pg.fill('[data-fid="car:f:valor"]', '180'); pg.fill('[data-fid="car:f:km"]', '1300'); pg.locator('[data-fid="car:salvar"]').click(); pg.wait_for_timeout(150)
        pg.locator('[data-fid="car:novo:multa"]').click(); pg.fill('[data-fid="car:f:valor"]', '130,16'); pg.locator('[data-fid="car:salvar"]').click(); pg.wait_for_timeout(150)
        check(pg.locator('[data-fid="car:urgente"]').count() == 0, '%d aviso some ao registrar troca' % w)
        c = car(pg); check(len(c) == 4 and any(x['tipo'] == 'oleo' and x['oleo'] == '5W30 sintético' for x in c), '%d lançamentos gravados' % w)
        check(pg.locator('[data-fid="car:total"]').inner_text().replace('\xa0', ' ') == 'R$ 760,16', '%d total' % w)
        check(pg.locator('.car-graf svg').count() >= 1 and pg.locator('.car-graf').count() + pg.locator('[data-fid="car:graficos"] .car-vazio').count() == 3, '%d três gráficos (com estado vazio)' % w)
        # vencimento anual com aviso
        pg.locator('[data-fid="car:venc-novo"]').click()
        d = pg.evaluate("PS.u.somaDias(PS.u.hoje(), 7)"); pg.fill('[data-fid="car:f:data"]', d); pg.locator('[data-fid="car:salvar"]').click(); pg.wait_for_timeout(150)
        check(pg.locator('[data-fid="car:avisos"]').count() == 1 and 'IPVA' in pg.locator('[data-fid="car:avisos"]').inner_text(), '%d aviso de vencimento' % w)
        # configurações
        pg.locator('[data-fid="car:cfg-abrir"]').click(); pg.fill('[data-fid="car:f:tanque"]', '48'); pg.fill('[data-fid="car:f:kmMes"]', '1200'); pg.locator('[data-fid="car:cfg-salvar"]').click(); pg.wait_for_timeout(150)
        check('298 a 302 km' in pg.locator('[data-fid="car:tanque"]').inner_text(), '%d autonomia' % w)
        check(pg.locator('[data-fid="car:previsao"]').count() == 1, '%d previsão do próximo abastecimento' % w)
        # pendência no desenho
        z = pg.locator('[data-fid="car:zona:porta-td"]'); z.scroll_into_view_if_needed(); z.click(); pg.wait_for_timeout(100)
        pg.locator('[data-fid="car:pnova"]').click(); pg.select_option('[data-fid="car:f:problema"]', 'Risco'); pg.select_option('[data-fid="car:f:gravidade"]', 'leve'); pg.fill('[data-fid="car:f:desc"]', 'teste'); pg.locator('[data-fid="car:salvar"]').click(); pg.wait_for_timeout(150)
        check(pg.locator('[data-fid="car:marca:porta-td"].g-leve').count() == 1, '%d marcador leve' % w)
        pg.locator('[data-fid="car:marca:porta-td"]').click(); pg.wait_for_timeout(100)
        check('Risco' in pg.locator('[data-fid="car:detalhe"]').inner_text(), '%d toque mostra detalhe' % w)
        if w == 390: pg.screenshot(path='/workspace/prints/carro-390.png', full_page=True)
        pg.locator('[data-fid="car:novo:abastecimento"]').click(); pg.check('[data-fid="car:f:cheio"]'); pg.fill('[data-fid="car:f:valor"]', '140'); pg.fill('[data-fid="car:f:litros"]', '40'); pg.fill('[data-fid="car:f:km"]', '1450'); pg.fill('[data-fid="car:f:data"]', '2026-10-25'); pg.locator('[data-fid="car:salvar"]').click(); pg.wait_for_timeout(150)
        check(any(x.get('cheio') for x in car(pg)), '%d tanque cheio salvo' % w)
        check('5' in pg.locator('[data-fid="car:tanques"]').inner_text() and pg.locator('[data-fid="car:anormal"]').count() == 1, '%d consumo por tanque e alerta anormal' % w)
        pg.locator('[data-fid="car:lemb-novo"]').click(); pg.fill('[data-fid="car:f:desc"]', 'Rodízio de pneus'); pg.fill('[data-fid="car:f:proxData"]', pg.evaluate("PS.u.somaDias(PS.u.hoje(), 20)")); pg.locator('[data-fid="car:salvar"]').click(); pg.wait_for_timeout(150)
        check('Rodízio' in pg.locator('[data-fid="car:lembretes"]').inner_text() and 'Chegando' in pg.locator('[data-fid="car:lembretes"]').inner_text(), '%d lembrete por data com nível' % w)
        if w == 390: pg.locator('[data-fid="car:lembretes"]').screenshot(path='/workspace/prints/carro-lembretes-390.png'); pg.locator('[data-fid="car:tanques"]').screenshot(path='/workspace/prints/carro-tanques-390.png'); pg.locator('[data-fid="car:painel"]').screenshot(path='/workspace/prints/carro-painel-390.png')
        if w == 360: pg.locator('[data-fid="car:area-desenho"]').screenshot(path='/workspace/prints/carro-desenho-360.png')
        pid = [x for x in car(pg) if x['tipo'] == 'pendencia'][0]['id']
        pg.locator('[data-fid="car:resolver:%s"]' % pid).click(); pg.fill('[data-fid="car:f:valor"]', '300'); pg.locator('[data-fid="car:salvar"]').click(); pg.wait_for_timeout(150)
        c = car(pg); check([x for x in c if x['id'] == pid][0]['status'] == 'resolvida' and any(x['tipo'] == 'servico' and 'Risco' in x['desc'] for x in c), '%d resolver vira serviço' % w)
        check(pg.locator('[data-fid^="car:marca:"]').count() == 0, '%d desenho limpo sem pendências' % w)
        # editar e excluir
        mid = [x for x in c if x['tipo'] == 'multa'][0]['id']
        pg.locator('[data-fid="car:edit:%s"]' % mid).click(); pg.fill('[data-fid="car:f:valor"]', '100'); pg.locator('[data-fid="car:salvar"]').click(); pg.wait_for_timeout(150)
        check([x for x in car(pg) if x['id'] == mid][0]['valor'] == 100, '%d editar' % w)
        pg.locator('[data-fid="car:exc:%s"]' % mid).click(); pg.locator('.modal .btn.perigo').click(); pg.wait_for_timeout(150)
        check(not [x for x in car(pg) if x['id'] == mid], '%d excluir com confirmação' % w)
        pg.locator('[data-fid="car:ag-sinc"]').click(); pg.wait_for_timeout(150)
        ev = [x for x in pg.evaluate('PS.store.get().compromissos') if x['id'].startswith('car-v-')]
        check(len(ev) == 1 and ev[0]['etiqueta'] == 'carro' and ev[0]['repete'] == 'anual', '%d vencimento vira evento da Agenda' % w)
        check(pg.locator('[data-fid^="car:ag:car-v-"]').count() >= 1, '%d widget mostra evento' % w)
        nd = pg.evaluate("PS.u.somaDias(PS.u.hoje(), 3)"); pg.evaluate("(function(d){PS.store.alterar(function(s){s.compromissos.forEach(function(c){if(c.id.indexOf('car-v-')===0)c.data=d;});});})('%s')" % nd); pg.wait_for_timeout(150)
        check('em 3 dias' in pg.locator('[data-fid="car:vencimentos"]').inner_text(), '%d editar na Agenda reflete no Carro' % w)
        check(pg.evaluate('(window.PS.nucleo||{COLECOES:[]}).COLECOES.indexOf("carro")') >= 0, '%d carro na sincronização' % w)
        check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), '%d sem rolagem horizontal' % w)
        if w < 800:
            pequenos = pg.evaluate("Array.from(document.querySelectorAll('.car-tela .btn')).filter(b=>b.offsetParent&&b.getBoundingClientRect().height<44).length")
            check(pequenos == 0, '%d botões >=44px (%d menores)' % (w, pequenos))
        check('—' not in pg.locator('main').inner_text(), '%d sem travessão' % w)
        pg.goto(base + '#/assistente'); pg.wait_for_timeout(500)
        check(pg.locator('[data-fid="ass-carro-0"]').count() == 1, '%d aviso na Ajudante' % w)
        check(not erros, '%d sem erros JS %s' % (w, erros[:2]))
    b.close()
print('%s: %d ok, %d falha(s)' % ('OK' if not falhas else 'FALHOU', len(ok), len(falhas)))
sys.exit(1 if falhas else 0)
