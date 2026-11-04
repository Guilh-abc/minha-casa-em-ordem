#!/usr/bin/env python3
"""Teste headless de Cartões: envio de PDF sintético -> revisão -> painel; senha; PDF de imagem; teste a seco; CSV; sensível.
Uso: python3 tools/teste-cartoes.py [--chrome CAMINHO]  (gere os PDFs antes: tools/gerar-pdfs-teste.py)"""
import argparse, functools, http.server, json, pathlib, socketserver, threading
from playwright.sync_api import sync_playwright
raiz = pathlib.Path(__file__).resolve().parent.parent
pdfs = raiz / 'tools' / 'pdfs-teste'
tot = json.loads((pdfs / 'totais.json').read_text())
ap = argparse.ArgumentParser(); ap.add_argument('--chrome'); a = ap.parse_args()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/index.html' % httpd.server_address[1]
ok, falhas = [], []
def check(c, m): (ok if c else falhas).append(m); print(('  ok   ' if c else '  FALHA ') + m)
def enviar(pg, nome):
    pg.locator('[data-fid="ct:arq"]').set_input_files(str(pdfs / nome))
def revisao(pg):
    pg.wait_for_selector('[data-fid="rv:salvar"]', timeout=20000)
def painel_total(pg):
    return float(pg.get_attribute('.fat-total', 'data-valor'))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True)
    pg = ctx.new_page(); erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(base + '#/'); pg.wait_for_selector('.hoje')
    pg.evaluate("PS.store.alterar(function(s){s.faturas=[];s.cartoes=[];s.lancs=[];s.contas=[];},true)")
    pg.evaluate("location.hash='#/cartoes'"); pg.wait_for_selector('.cartoes')
    check('Nenhuma fatura' in pg.inner_text('.cartoes'), 'estado vazio explica como começar')
    for nome, esp in [('nubank-sintetico.pdf', tot['nubank-sintetico.pdf']), ('itau-sintetico.pdf', tot['itau-sintetico.pdf']), ('bradesco-sintetico.pdf', tot['bradesco-sintetico.pdf'])]:
        enviar(pg, nome); revisao(pg)
        txt = pg.inner_text('.cartoes')
        check(esp['banco'] in txt.lower(), '%s: banco detectado (%s)' % (nome, esp['banco']))
        check(abs(float(pg.input_value('[data-fid="rv:total"]')) - esp['total']) < 0.005, '%s: total da revisão = %.2f' % (nome, esp['total']))
        check(pg.input_value('[data-fid="rv:final"]') == esp['final'], '%s: final do cartão %s' % (nome, esp['final']))
        check(pg.input_value('[data-fid="rv:venc"]') == esp['vencimento'], '%s: vencimento %s' % (nome, esp['vencimento']))
        pg.locator('[data-fid="rv:salvar"]').click(); pg.wait_for_selector('.fat-total'); pg.wait_for_timeout(900)
        check(abs(painel_total(pg) - esp['total']) < 0.005, '%s: painel mostra total %.2f' % (nome, esp['total']))
        n = pg.evaluate("PS.store.get().lancs.filter(function(l){return l.fatura===PS.store.get().faturas[0].id}).length")
        check(n >= esp['n'] - esp['creditos'] and n <= esp['n'] + 1, '%s: %d lançamentos salvos (esperado ~%d)' % (nome, n, esp['n']))
        somal = pg.evaluate("Math.round(PS.store.get().lancs.filter(function(l){return l.fatura===PS.store.get().faturas[0].id}).reduce(function(a,l){return a+l.valor},0)*100)/100")
        check(abs(somal - esp['total']) < 0.005, '%s: soma dos lançamentos = total (%.2f)' % (nome, somal))
        pg.evaluate("location.hash='#/cartoes'")
    check(pg.locator('.chip-fat').count() == 3, '3 faturas nos seletores')
    check(pg.locator('.rosca-svg .fatia').count() >= 3, 'rosca por categoria desenhada')
    check(pg.locator('.rosca div.sr-only table').count() == 1, 'tabela equivalente do gráfico presente')
    soma_leg = pg.evaluate("Array.from(document.querySelectorAll('.leg-valor')).reduce(function(a,e){return a+parseFloat(e.textContent.replace(/[^0-9,]/g,'').replace(',','.'))},0)")
    check(soma_leg > 0, 'legenda soma categorias (%.2f)' % soma_leg)
    pg.locator('.leg-item').first.click(); pg.wait_for_timeout(250)
    check(pg.evaluate("document.querySelectorAll('.fatia.dim').length") >= 2 and pg.evaluate("!!document.querySelector('.fatia.sel')"), 'clicar na legenda destaca a fatia')
    check('maiores compras' in pg.inner_text('.cartoes').lower() and pg.locator('.top-lista li').count() >= 1, 'top compras')
    check(pg.locator('.lanc').count() >= 5, 'lista de lançamentos')
    # marcar paga / desfazer
    pg.locator('[data-fid="ft:paga"]').click(); pg.wait_for_selector('.modal'); pg.locator('.modal button:has-text("Marcar como paga")').click(); pg.wait_for_timeout(500)
    check(pg.evaluate("PS.store.get().faturas.filter(function(f){return f.status==='paga'}).length") == 1, 'marcar fatura paga (manual)')
    check(pg.locator('[data-fid="ft:desfazer"]').count() == 1, 'botão Desfazer aparece')
    pg.locator('[data-fid="ft:desfazer"]').click(); pg.wait_for_timeout(300)
    check(pg.evaluate("PS.store.get().faturas.filter(function(f){return f.status==='paga'}).length") == 0, 'desfazer volta para aberta')
    # filtros + CSV
    pg.fill('[data-fid="lc:busca"]', 'zzzz'); pg.wait_for_timeout(500)
    check('Nenhum lançamento' in pg.inner_text('.cartoes'), 'busca sem resultado')
    pg.fill('[data-fid="lc:busca"]', ''); pg.wait_for_timeout(500)
    with pg.expect_download() as d: pg.locator('[data-fid="lc:csv"]').click()
    csv = open(d.value.path(), 'rb').read().decode('utf-8')
    check(csv.startswith('\ufeff') and ';' in csv and '\r\n' in csv, 'CSV com BOM, ; e CRLF')
    # PDF com senha
    pg.evaluate("location.hash='#/cartoes'"); pg.wait_for_timeout(300)
    antes = pg.evaluate("PS.store.get().faturas.length")
    enviar(pg, 'protegido-sintetico.pdf'); pg.wait_for_selector('[data-fid="pdf:senha"]', timeout=20000)
    pg.fill('[data-fid="pdf:senha"]', 'errada'); pg.locator('.modal button:has-text("Abrir")').click()
    pg.wait_for_selector('text=Senha incorreta', timeout=20000)
    pg.fill('[data-fid="pdf:senha"]', tot['protegido-sintetico.pdf']['senha']); pg.locator('.modal button:has-text("Abrir")').click()
    revisao(pg)
    check(abs(float(pg.input_value('[data-fid="rv:total"]')) - tot['protegido-sintetico.pdf']['total']) < 0.005, 'PDF com senha: errada pede de novo, certa lê (total confere)')
    check('senha123' not in pg.evaluate("JSON.stringify(localStorage)"), 'senha do PDF não é guardada')
    # teste a seco
    pg.locator('[data-fid="rv:teste"]').check(); pg.locator('[data-fid="rv:salvar"]').click(); pg.wait_for_selector('.modal')
    check('Nada foi salvo' in pg.inner_text('.modal') and pg.evaluate("PS.store.get().faturas.length") == antes, 'modo "só testar" não salva nada')
    pg.locator('.modal button:has-text("Fechar")').click(); pg.locator('[data-fid="rv:cancelar"]').click(); pg.wait_for_selector('.cartoes')
    # amostra anonimizada
    enviar(pg, 'nubank-sintetico.pdf'); revisao(pg)
    amostra = pg.evaluate("(function(){return document.querySelector('[data-fid=\"rv:amostra\"]')?1:0})()")
    check(amostra == 1, 'botão de amostra sem dados pessoais')
    pg.locator('[data-fid="rv:cancelar"]').click(); pg.wait_for_selector('.cartoes')
    # PDF só imagem
    enviar(pg, 'imagem-sintetico.pdf'); pg.wait_for_selector('.modal', timeout=20000)
    check('sem OCR' in pg.inner_text('.modal') or 'só imagem' in pg.inner_text('.modal'), 'PDF de imagem: mensagem clara (sem OCR)')
    pg.locator('.modal button:has-text("Entendi")').click(); pg.wait_for_timeout(200)
    # cartão com número completo é recusado
    pg.locator('[data-fid="ca:novo"]').click(); pg.wait_for_selector('.modal')
    pg.fill('[data-fid="ct:ap"]', 'Meu 4111 1111 1111 1111'); pg.wait_for_timeout(200)
    check('número de cartão' in pg.inner_text('.modal'), 'aviso ao digitar número completo')
    pg.locator('.modal button:has-text("Salvar")').click(); pg.wait_for_timeout(400)
    check(not pg.evaluate("JSON.stringify(PS.store.get().cartoes).indexOf('4111')>=0"), 'número completo não é salvo')
    pg.wait_for_timeout(300)
    if pg.locator('.modal').count(): pg.locator('.modal button:has-text("Cancelar")').click(); pg.wait_for_timeout(300)
    # exemplo
    pg.evaluate("location.hash='#/cartoes'"); pg.wait_for_selector('[data-fid="ct:exemplo"]'); pg.locator('[data-fid="ct:exemplo"]').click(); revisao(pg)
    check(abs(float(pg.input_value('[data-fid="rv:total"]')) - 545.30) < 0.005, 'fatura de exemplo abre na revisão')
    # Itaú em colunas (sintético): conferência, compromissos futuros, mês a mês e duplicidade
    pg.locator('[data-fid="rv:cancelar"]').click(); pg.wait_for_selector('.cartoes')
    pg.evaluate("PS.store.alterar(function(s){s.faturas=[];s.cartoes=[];s.lancs=[];},true)")
    pg.evaluate("location.hash='#/cartoes'"); pg.wait_for_selector('.cartoes'); pg.wait_for_timeout(300)
    S, O = tot['itau-colunas-set.pdf'], tot['itau-colunas-out.pdf']
    enviar(pg, 'itau-colunas-set.pdf'); revisao(pg)
    txt = pg.inner_text('.cartoes').lower()
    check('conferência dos valores' in txt and pg.locator('.rv-conf').count() >= 3 and 'diferente' not in txt, 'Itaú colunas: conferência dos valores (subtotais do banco) sem divergência')
    check(abs(float(pg.input_value('[data-fid="rv:total"]')) - S['total']) < 0.005 and pg.input_value('[data-fid="rv:final"]') == '9999' and pg.input_value('[data-fid="rv:venc"]') == S['vencimento'], 'Itaú colunas: total, final 9999 e vencimento na revisão')
    check('parcelas futuras que o banco informa' in txt, 'Itaú colunas: revisão informa as parcelas futuras')
    pg.locator('[data-fid="rv:salvar"]').click(); pg.wait_for_selector('.fat-total'); pg.wait_for_timeout(900)
    check(abs(painel_total(pg) - S['total']) < 0.005 and 'compromissos futuros' in pg.inner_text('.cartoes').lower() and 'Próxima fatura' in pg.inner_text('.cartoes'), 'Itaú colunas: painel mostra o total e o cartão "Compromissos futuros"')
    fat = pg.evaluate("PS.store.get().faturas[0]")
    check(fat['futuras'] and len(fat['futuras']) == S['nFuturas'] and abs(fat['futuroTotal'] - S['futTotal']) < 0.005 and abs(fat['pagamentoMinimo'] - S['minimo']) < 0.005, 'Itaú colunas: parcelas futuras e pagamento mínimo guardados na fatura')
    check(pg.evaluate("PS.store.get().lancs.filter(function(l){return l.cat==='encargos'}).length") == 1 and pg.evaluate("PS.store.get().lancs.every(function(l){return l.cat==='encargos'||l.cidade})"), 'Itaú colunas: multa/juros é lançamento próprio; cidade e categoria do banco salvas')
    check(pg.evaluate("JSON.stringify(PS.store.get().faturas[0]).length") < 6000, 'Itaú colunas: registro da fatura cabe no limite da sincronização cifrada')
    check('5555' not in pg.evaluate("JSON.stringify(localStorage)"), 'Itaú colunas: número do cartão não é guardado')
    fid_set = fat['id']
    pg.evaluate("location.hash='#/cartoes'"); pg.wait_for_timeout(300)
    enviar(pg, 'itau-colunas-out.pdf'); revisao(pg)
    check('já foi enviada' not in pg.inner_text('.cartoes').lower() and pg.input_value('[data-fid="rv:cartao"]') != '__novo', 'Itaú out: reconhece o mesmo cartão (final 9999) e não acusa duplicidade')
    pg.locator('[data-fid="rv:salvar"]').click(); pg.wait_for_selector('.fat-total'); pg.wait_for_timeout(900)
    check(pg.evaluate("PS.store.get().faturas.length") == 2 and pg.evaluate("PS.store.get().cartoes.length") == 1 and abs(painel_total(pg) - O['total']) < 0.005, 'Itaú out: segunda fatura do mesmo cartão (2 faturas, 1 cartão)')
    check(pg.locator('.chip-fat').count() == 2, 'Itaú out: os dois meses aparecem nos seletores')
    pg.evaluate("PS.store.alterar(function(s){s.faturas.forEach(function(f){if(f.id==='%s'){f.status='paga';f.pagaEm='2026-09-28';}});},true)" % fid_set)
    pg.evaluate("location.hash='#/cartoes'"); pg.wait_for_timeout(300)
    enviar(pg, 'itau-colunas-set.pdf'); revisao(pg)
    check('já foi enviada' in pg.inner_text('.cartoes').lower(), 'reenviar a mesma fatura: revisão avisa que já existe')
    pg.locator('[data-fid="rv:salvar"]').click(); pg.wait_for_selector('.modal')
    check('já foi enviada' in pg.inner_text('.modal').lower() and pg.evaluate("PS.store.get().faturas.length") == 2, 'reenviar a mesma fatura: pergunta antes de gravar')
    pg.locator('.modal button:has-text("Cancelar")').click(); pg.wait_for_timeout(300)
    check(pg.evaluate("PS.store.get().faturas.length") == 2 and pg.locator('[data-fid="rv:salvar"]').count() == 1, 'Cancelar não grava nada e volta à revisão')
    pg.locator('[data-fid="rv:salvar"]').click(); pg.wait_for_selector('.modal'); pg.locator('.modal button:has-text("Substituir")').click(); pg.wait_for_timeout(900)
    st = pg.evaluate("(function(){var s=PS.store.get();var f=s.faturas.filter(function(x){return x.id==='%s'})[0];return {n:s.faturas.length,st:f&&f.status,ls:s.lancs.filter(function(l){return l.fatura==='%s'}).length}})()" % (fid_set, fid_set))
    check(st['n'] == 2 and st['st'] == 'paga' and st['ls'] == S['n'], 'Substituir: continua 1 fatura por mês, mantém "paga" e não duplica lançamentos (%d)' % st['ls'])
    # sem rolagem horizontal em 390px
    if pg.locator('[data-fid="rv:cancelar"]').count(): pg.locator('[data-fid="rv:cancelar"]').click()
    pg.wait_for_selector('.cartoes'); pg.wait_for_timeout(300)
    check(pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), 'sem rolagem horizontal em 390px')
    check(not erros, 'sem erros de página: %s' % erros[:2])
    b.close()
print('\n%d ok / %d falhas' % (len(ok), len(falhas)))
raise SystemExit(1 if falhas else 0)
