#!/usr/bin/env python3
"""Teste de fumaça do Minha Casa em Ordem (Playwright + Chrome headless). Opcional, só para desenvolvimento.
Uso:  python3 tools/teste-smoke.py [--url https://.../minha-casa-em-ordem/] [--chrome /usr/bin/google-chrome] [--prints PASTA]
Sem --url, sobe um servidor local temporário. Sai com código 1 se algo falhar."""
import argparse, functools, http.server, json, pathlib, socketserver, sys, threading, tempfile
from playwright.sync_api import sync_playwright

raiz = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument('--url'); ap.add_argument('--chrome'); ap.add_argument('--prints', default='/tmp/prints-smoke')
a = ap.parse_args()

httpd = None
if not a.url:
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *x): pass
    httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(raiz)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    a.url = 'http://127.0.0.1:%d/' % httpd.server_address[1]
base = a.url.rstrip('/') + '/'
prints = pathlib.Path(a.prints); prints.mkdir(parents=True, exist_ok=True)
falhas, ok = [], []
def check(cond, msg):
    (ok if cond else falhas).append(msg); print(('  ok   ' if cond else '  FALHA ') + msg)

ROTAS = ['', 'tarefas', 'agenda', 'compras', 'contas', 'cartoes', 'relaxar', 'gerenciar', 'gerenciar/tarefas', 'gerenciar/agenda', 'gerenciar/contas', 'gerenciar/links', 'gerenciar/sync', 'gerenciar/backup', 'sincronizar', 'instalar']
NOMES = {'': 'hoje'}

def novo_ctx(b, w, h, **kw):
    ctx = b.new_context(viewport={'width': w, 'height': h}, accept_downloads=True, **kw)
    pg = ctx.new_page(); erros = []
    pg.on('pageerror', lambda e: erros.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: erros.append('console: ' + m.text) if m.type == 'error' and 'open-meteo' not in m.text.lower() and 'Failed to load resource' not in m.text else None)
    return ctx, pg, erros

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome) if a.chrome else p.chromium.launch()
    for (w, h) in [(1920, 1080), (1280, 720)]:
        print('== TV %dx%d ==' % (w, h))
        ctx, pg, erros = novo_ctx(b, w, h)
        pg.goto(base + 'index.html#/'); pg.wait_for_selector('.hoje'); pg.wait_for_timeout(900)
        for r in ROTAS:
            pg.evaluate("location.hash='#/%s'" % r); pg.wait_for_timeout(450)
            nome = NOMES.get(r, r.replace('/', '-'))
            ov = pg.evaluate("({d: document.documentElement.scrollWidth - innerWidth, a: document.getElementById('app').scrollWidth - document.getElementById('app').clientWidth})")
            check(ov['d'] <= 0 and ov['a'] <= 0, '[%dx%d] #/%s sem rolagem horizontal' % (w, h, r))
            check(pg.evaluate("document.querySelector('.rodape').textContent.indexOf('byGui') >= 0"), '[%dx%d] #/%s rodapé byGui' % (w, h, r))
            check(pg.evaluate("document.getElementById('app').children.length > 0"), '[%dx%d] #/%s renderizou' % (w, h, r))
            # D-pad: sequência de setas visita elementos distintos
            vistos = set()
            pg.evaluate("document.activeElement && document.activeElement.blur()")
            for t in ['ArrowDown'] * 8 + ['ArrowRight', 'ArrowUp', 'ArrowLeft']:
                pg.keyboard.press(t)
                vistos.add(pg.evaluate("(function(){var e=document.activeElement;if(!e||e===document.body)return '';var r=e.getBoundingClientRect();return (e.getAttribute('data-fid')||e.textContent.trim().slice(0,20)||e.tagName)+'@'+Math.round(r.left)+','+Math.round(r.top)})()"))
            vistos.discard('')
            if r not in ('teclas',):
                check(len(vistos) >= 2, '[%dx%d] #/%s setas movem o foco (%d posições)' % (w, h, r, len(vistos)))
            if r in ('', 'tarefas', 'contas', 'relaxar') and w == 1280:
                pg.screenshot(path=str(prints / ('tv-%s-%dx%d.png' % (nome, w, h))))
            if r in ('', 'tarefas', 'agenda', 'compras', 'contas', 'relaxar') and w == 1920:
                pg.screenshot(path=str(prints / ('tv-%s-%dx%d.png' % (nome, w, h))))
        # Hoje deve caber sem rolagem vertical (meta de design)
        pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(400)
        cabe = pg.evaluate("(function(){var m=document.getElementById('app');return m.scrollHeight-m.clientHeight})()")
        check(cabe <= 4, '[%dx%d] Hoje cabe sem rolar (sobra %dpx)' % (w, h, cabe))
        check(not erros, '[%dx%d] sem erros de console %s' % (w, h, erros[:3]))
        ctx.close()

    print('== Funcional 1280x720 ==')
    ctx, pg, erros = novo_ctx(b, 1280, 720)
    pg.goto(base + 'index.html#/tarefas'); pg.wait_for_selector('.item.tarefa'); pg.wait_for_timeout(300)
    # Back volta ao Hoje
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check(pg.evaluate("location.hash") in ('#/', ''), 'Esc/Voltar leva ao Hoje')
    pg.evaluate("location.hash='#/tarefas'"); pg.wait_for_timeout(300)
    pg.keyboard.press('Backspace'); pg.wait_for_timeout(300)
    check(pg.evaluate("location.hash") in ('#/', ''), 'Backspace leva ao Hoje')
    # tarefas: marcar
    pg.evaluate("location.hash='#/tarefas'"); pg.wait_for_selector('.item.tarefa')
    pg.focus('.item.tarefa'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    check(pg.evaluate("document.querySelectorAll('.item.tarefa.feito').length") == 1, 'OK conclui tarefa')
    # exportar JSON
    pg.evaluate("location.hash='#/gerenciar/backup'"); pg.wait_for_selector('.form-linha')
    with pg.expect_download() as dl:
        pg.click('text=Exportar JSON')
    arq = pathlib.Path(tempfile.mkdtemp()) / 'backup.json'; dl.value.save_as(str(arq))
    bk = json.loads(arq.read_text())
    check(bk.get('app') == 'minha-casa-em-ordem' and len(bk['dados']['tarefas']) >= 1 and 'habitos' not in bk['dados'] and 'lembretes' not in bk['dados'], 'exportar JSON baixa backup válido')
    # alterar e importar de volta
    pg.evaluate("PS.store.alterar(function(s){ s.tarefas = []; }, true)")
    with pg.expect_file_chooser() as fc:
        pg.click('text=Importar JSON')
    fc.value.set_files(str(arq)); pg.wait_for_selector('.modal'); pg.click('.modal >> text=Substituir'); pg.wait_for_timeout(300)
    check(pg.evaluate("PS.store.get().tarefas.length") == len(bk['dados']['tarefas']), 'importar JSON restaura os dados')
    # link de configuração: gera, abre em contexto limpo, importa
    pg.click('text=Gerar link agora'); pg.wait_for_selector('textarea[aria-label="Link de configuração"]')
    link = pg.input_value('textarea[aria-label="Link de configuração"]')
    check('#/importar/' in link and len(link) < 8000, 'link de configuração gerado (%d caracteres)' % len(link))
    pg.evaluate("PS.store.alterar(function(s){ s.config.nome='Teste Link'; s.links.push({id:'zz',titulo:'Meu atalho',url:'https://example.com/x',icone:'globo'}); }, true)")
    pg.click('text=Gerar link agora'); link = pg.input_value('textarea[aria-label="Link de configuração"]')
    ctx2, pg2, erros2 = novo_ctx(b, 1280, 720)
    pg2.goto(link.replace(base, base + 'index.html', 1) if 'index.html' not in link else link)
    pg2.wait_for_selector('text=Importar e substituir'); pg2.click('text=Importar e substituir'); pg2.wait_for_selector('.hoje'); pg2.wait_for_timeout(300)
    cfg = pg2.evaluate("({n: PS.store.get().config.nome, l: PS.store.get().links.some(function(x){return x.titulo==='Meu atalho'}), h: PS.store.get().tarefas.length})")
    check(cfg['n'] == 'Teste Link' and cfg['l'] and cfg['h'] >= 1, 'link de configuração: ida e volta em outro navegador limpo')
    check(not erros2, 'sem erros no contexto do link %s' % erros2[:2])
    # link inválido não quebra
    pg2.goto(base + 'index.html#/importar/@@@'); pg2.wait_for_timeout(500)
    check(pg2.evaluate("document.body.textContent.indexOf('Link inválido') >= 0"), 'link inválido mostra aviso')
    ctx2.close()
    # ICS
    ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Evento ICS\r\nDTSTART:%s\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
    hoje = pg.evaluate("PS.u.hoje()").replace('-', '')
    f = pathlib.Path(tempfile.mkdtemp()) / 't.ics'; f.write_text(ics % (hoje + 'T235900'))
    pg.evaluate("location.hash='#/gerenciar/agenda'"); pg.wait_for_selector('text=Escolher arquivo .ics')
    with pg.expect_file_chooser() as fc: pg.click('text=Escolher arquivo .ics')
    fc.value.set_files(str(f)); pg.wait_for_timeout(500)
    check(pg.evaluate("PS.store.get().compromissos.some(function(c){return c.titulo==='Evento ICS'&&c.fonte==='ics'})"), 'importar .ics cria compromisso')
    # SW + manifest
    mf = pg.evaluate("fetch('manifest.webmanifest').then(function(r){return r.json()})")
    check(mf['display'] == 'standalone' and len(mf['icons']) >= 3, 'manifest ok')
    check(not erros, 'sem erros de console no fluxo %s' % erros[:3])
    ctx.close()


    print('== Perfil antigo com lembretes e hábitos guardados ==')
    ctx, pg, erros = novo_ctx(b, 1280, 720)
    pg.goto(base + 'index.html#/'); pg.wait_for_selector('.hoje'); pg.wait_for_timeout(300)
    pg.evaluate("""(function(){ var s = PS.store.get(); s.versao = 1; s.lembretes = [{id:'lembrete-bilu-casinha',titulo:'Comprar casinha maior para o Bilu',dia:0}]; s.habitos = [{id:'h1',nome:'Alongar'}]; s.checks = {};
      s.tarefas.push({id:'minha-tarefa',lista:'Casa',titulo:'Tarefa antiga do usuário',prio:'baixa',vence:'',feita:false});
      localStorage.setItem('painelsala.dados', JSON.stringify(s)); localStorage.setItem('painelsala.migracoes', JSON.stringify(['2026-10-bilu-casinha'])); })()""")
    pg.reload(); pg.wait_for_selector('.hoje'); pg.wait_for_timeout(400)
    st = pg.evaluate("(function(){var s=PS.store.get();return [!!s.lembretes, !!s.habitos, s.tarefas.some(function(t){return t.id==='minha-tarefa'})]})()")
    check(st == [False, False, True], 'perfil antigo: lembretes e hábitos descartados, dados do usuário preservados %s' % st)
    check('Bilu' not in pg.inner_text('main'), 'perfil antigo: Bilu não aparece no Hoje')
    pg.evaluate("location.hash='#/contas'"); pg.wait_for_selector('.conta-linha, .vazio'); pg.wait_for_timeout(300)
    pg.screenshot(path=str(prints / 'tv-contas-1280x720.png'))
    pg.evaluate("location.hash='#/gerenciar/contas'"); pg.wait_for_selector('.form-linha'); pg.wait_for_timeout(300)
    check(pg.evaluate("Array.prototype.some.call(document.querySelectorAll('select option'), function(o){return o.value==='casa-de-cachorro'})"), 'Gerenciar oferece o ícone casa-de-cachorro nas contas')
    check(not erros, 'sem erros de console (perfil antigo) %s' % erros[:3])
    ctx.close()

    print('== Celular 360x740 (gerenciar) ==')
    ctx, pg, erros = novo_ctx(b, 360, 740)
    pg.goto(base + 'index.html#/gerenciar'); pg.wait_for_selector('.form-linha'); pg.wait_for_timeout(400)
    for r in ['gerenciar', 'gerenciar/tarefas', 'gerenciar/agenda', 'gerenciar/contas', 'gerenciar/links', 'gerenciar/backup', '', 'compras', 'contas', 'relaxar']:
        pg.evaluate("location.hash='#/%s'" % r); pg.wait_for_timeout(350)
        d = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
        check(d <= 0, '[360] #/%s sem rolagem horizontal (sobra %d)' % (r, d))
        if r in ('gerenciar', 'gerenciar/contas'): pg.screenshot(path=str(prints / ('celular-%s-360.png' % r.replace('/', '-'))), full_page=False)
    check(not erros, '[360] sem erros %s' % erros[:3])
    ctx.close()
    b.close()
if httpd: httpd.shutdown()
print('\n%d ok, %d falhas' % (len(ok), len(falhas)))
sys.exit(1 if falhas else 0)
