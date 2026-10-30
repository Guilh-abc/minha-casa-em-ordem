#!/usr/bin/env python3
"""Teste de tela da reorganização das abas: Lista de Compra (#/compras), Contas a pagar (#/contas), sem Rotina e sem Lembretes.
Uso: python3 tools/teste-abas.py [--chrome CAMINHO] [--prints PASTA]  byGui"""
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
DADOS = """PS.store.alterar(function(s){var h=PS.u.hoje();
 s.contas=[{id:'cx',titulo:'Luz',mensal:true,anual:false,mes:0,dia:+PS.u.somaDias(h,2).slice(8),data:'',valor:120,paga:false,pagas:{},valores:{},desde:'',cat:'casa',dono:'casal',forma:'boleto',obs:'',cartaoRef:'',arquivada:false},
  {id:'cy',titulo:'Água',mensal:false,anual:false,mes:0,dia:1,data:PS.u.somaDias(h,4),valor:80,paga:false,pagas:{},valores:{},desde:'',cat:'casa',dono:'casal',forma:'pix',obs:'',cartaoRef:'',arquivada:false}];
 s.compras=[{id:'k1',nome:'Coxa e sobrecoxa',preco:9.39,unidade:'kg',local:'Atacadão',comprado:false},{id:'k2',nome:'Arroz',preco:null,unidade:'',local:'',comprado:false}];
 s.faturas=[];s.tarefas=[{id:'t1',lista:'Casa',titulo:'Varrer a sala',prio:'alta',vence:h,feita:false,dono:''}];},true);"""
BACKUP_ANTIGO = {'app': 'minha-casa-em-ordem', 'versao': 4, 'dados': {'config': {'cidade': 'Osasco, SP'}, 'listas': ['Casa'],
  'habitos': [{'id': 'h1', 'nome': 'Alongar', 'icone': 'check'}], 'checks': {'2026-10-20': ['h1']},
  'lembretes': [{'id': 'lembrete-bilu-casinha', 'titulo': 'Comprar casinha maior para o Bilu', 'dia': 0, 'prio': 'alta'}],
  'tarefas': [{'id': 't9', 'lista': 'Casa', 'titulo': 'Tarefa do backup', 'vence': ''}], 'contas': [{'id': 'c9', 'titulo': 'Internet', 'mensal': True, 'dia': 15}]}}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for w, hh in [(390, 844), (1280, 800)]:
        pg = b.new_page(viewport={'width': w, 'height': hh}); erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(base + '#/'); pg.wait_for_timeout(800); pg.evaluate(DADOS); pg.wait_for_timeout(200)
        menu = pg.eval_on_selector_all('.menu a', 'l => l.map(a => [a.getAttribute("href"), a.textContent.trim()])')
        hrefs = [m[0] for m in menu]; nomes = [m[1] for m in menu]
        check(hrefs == ['#/', '#/tarefas', '#/agenda', '#/compras', '#/contas', '#/cartoes', '#/relaxar', '#/gerenciar'], '[%d] menu: Hoje, Tarefas, Agenda, Lista de Compra, Contas a pagar, Cartões, Relaxar, Gerenciar (%s)' % (w, hrefs))
        check(nomes[3] == 'Lista de Compra' and nomes[4].startswith('Contas a pagar') and not any(n.startswith(('Família', 'Rotina')) for n in nomes), '[%d] rótulos: Lista de Compra e Contas a pagar; sem Família e sem Rotina' % w)
        # Hoje
        t = pg.inner_text('main')
        check('Lembrete' not in t and 'Bilu' not in t and 'hábito' not in t.lower(), '[%d] Hoje sem lembretes nem hábitos' % w)
        check(pg.locator('.atencao-item[href="#/contas"]').count() >= 1 and pg.locator('.atencao-item[href="#/familia"]').count() == 0, '[%d] Hoje: itens de "Atenção agora" levam a #/contas' % w)
        check('TAREFAS DO DIA' in t.upper() and pg.evaluate('PS.dom.itensDoDia(PS.store.get(), PS.u.hoje()).some(function(i){return i.t.titulo==="Varrer a sala"})'), '[%d] Hoje: tarefas do dia continuam' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/abas-hoje-390.png', full_page=True)
        # Lista de Compra
        pg.evaluate("location.hash='#/compras'"); pg.wait_for_timeout(400)
        t = pg.inner_text('main')
        check('Coxa e sobrecoxa' in t and 'Arroz' in t, '[%d] Lista de Compra mostra os itens da coleção compras' % w)
        check(pg.locator('.menu a[href="#/compras"][aria-current="page"]').count() == 1, '[%d] aba Lista de Compra fica marcada' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/abas-lista-de-compra-390.png', full_page=True)
        # Contas a pagar
        pg.evaluate("location.hash='#/contas'"); pg.wait_for_timeout(400)
        t = pg.inner_text('main')
        check('Contas a pagar' in t and 'Luz' in t and 'Água' in t, '[%d] Contas a pagar mostra as contas' % w)
        for fid, nome in [('fa:abertas', 'Em aberto'), ('fa:pagas', 'Pagas'), ('fa:hist', 'Histórico')]:
            check(pg.locator('[data-fid="%s"]' % fid).count() == 1, '[%d] Contas a pagar tem a aba %s' % (w, nome))
        check(pg.locator('main h2', has_text='Lembretes').count() == 0 and 'Novo lembrete' not in t and 'Lista de compras' not in t, '[%d] Contas a pagar sem quadro de Lembretes e sem atalho da lista' % w)
        check(pg.locator('.menu a[href="#/contas"][aria-current="page"]').count() == 1, '[%d] aba Contas a pagar fica marcada' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/abas-contas-a-pagar-390.png', full_page=True)
        pg.locator('[data-fid="fa:abertas"]').click(); pg.wait_for_timeout(200)
        pg.locator('[data-fid^="dc:cx"]').first.click(); pg.wait_for_timeout(250)
        check(pg.locator('.modal [data-fid="dc:editar"]').count() == 1, '[%d] detalhe da conta com Editar abre em Contas a pagar' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/abas-contas-detalhe-390.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.locator('[data-fid="fa:hist"]').click(); pg.wait_for_timeout(250); th = pg.inner_text('main')
        check('Por categoria' in th or 'Ainda sem valores' in th, '[%d] Contas a pagar: Histórico com "Por categoria"' % w)
        # Cartões intacto
        pg.evaluate("location.hash='#/cartoes'"); pg.wait_for_timeout(500)
        check(pg.locator('h1').first.inner_text().startswith('Cartões'), '[%d] Cartões continua abrindo' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/abas-cartoes-390.png')
        # rotas antigas
        pg.evaluate("location.hash='#/familia'"); pg.wait_for_timeout(300)
        check('Contas a pagar' in pg.inner_text('main'), '[%d] link antigo #/familia abre Contas a pagar' % w)
        pg.evaluate("location.hash='#/rotina'"); pg.wait_for_timeout(300)
        check(pg.locator('.hoje').count() == 1, '[%d] link antigo #/rotina cai no Hoje' % w)
        # Gerenciar
        pg.evaluate("location.hash='#/gerenciar'"); pg.wait_for_timeout(300)
        t = pg.inner_text('main')
        check('Hábitos' not in t and 'Família' not in t, '[%d] Gerenciar sem aba Hábitos e sem Família' % w)
        pg.evaluate("location.hash='#/gerenciar/contas'"); pg.wait_for_timeout(300)
        t = pg.inner_text('main')
        check('Contas de casa' in t and 'Novo lembrete' not in t, '[%d] Gerenciar > Contas a pagar edita contas e não tem lembretes' % w)
        if a.prints and w == 390: pg.screenshot(path=a.prints + '/abas-gerenciar-contas-390.png')
        pg.evaluate("location.hash='#/gerenciar/familia'"); pg.wait_for_timeout(300)
        check('Contas de casa' in pg.inner_text('main'), '[%d] link antigo Gerenciar > Família abre Contas' % w)
        # Ajudante sem seção de lembretes
        ctx = pg.evaluate("PS.assistente && PS.assistente.contexto ? PS.assistente.contexto(PS.store.get(), PS.u.hoje()) : ''")
        check('LEMBRETES' not in (ctx or ''), '[%d] contexto da Ajudante sem LEMBRETES' % w)
        # backup antigo
        r = pg.evaluate("t => { try { var d = PS.store.lerBackup(t); PS.store.substituir(d); var s = PS.store.get(); return [s.tarefas.length, s.contas.length, 'lembretes' in s, 'habitos' in s, 'checks' in s]; } catch (e) { return 'erro ' + e.message; } }", json.dumps(BACKUP_ANTIGO))
        check(r == [1, 1, False, False, False], '[%d] backup antigo com lembretes e hábitos importa sem erro e descarta essas partes (%s)' % (w, r))
        pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(300)
        check('Bilu' not in pg.inner_text('main'), '[%d] Bilu não volta depois de importar' % w)
        check(not erros, '[%d] sem erros de JavaScript %s' % (w, erros[:2]))
        pg.close()
    b.close()
httpd.shutdown()
print('\n%d ok, %d falhas' % (len(ok), len(falhas)))
sys.exit(1 if falhas else 0)
