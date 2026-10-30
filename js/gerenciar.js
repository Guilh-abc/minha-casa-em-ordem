/* Página de gerenciamento (celular): edita tudo, backup JSON, link de configuração, importar .ics. */
(function (g) {
  'use strict';
  var PS = g.PS = g.PS || {};
  var U = PS.u, h = U.h, S = PS.store, I = PS.icone;
  var ABAS = [['geral', 'Geral'], ['habitos', 'Hábitos'], ['tarefas', 'Tarefas'], ['agenda', 'Agenda'], ['familia', 'Família'], ['links', 'Links'], ['sync', 'Sincronização'], ['backup', 'Backup']];
  var PRIO = [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']];

  function campoEl(item, f, aoMudar) {
    var valor = f.get ? f.get(item) : item[f.k];
    var el, ev = 'input';
    if (f.tipo === 'select') {
      el = h('select', null, f.opcoes(item).map(function (o) { return h('option', { value: o[0], selected: String(o[0]) === String(valor) ? 'selected' : null }, o[1]); }));
      el.value = valor; ev = 'change';
    } else if (f.tipo === 'check') {
      el = h('input', { type: 'checkbox', checked: !!valor });
      el.addEventListener('change', function () { aoMudar(item, f, el.checked); });
      return h('label', { class: 'campo marcar' }, el, h('span', null, f.rotulo));
    } else {
      el = h('input', { type: f.tipo || 'text', value: valor == null ? '' : valor, placeholder: f.dica || null, maxlength: f.max || null, min: f.min, max: f.maxn, step: f.passo || null, inputmode: f.tipo === 'number' ? 'decimal' : null, autocomplete: 'off' });
      if (f.tipo === 'date' || f.tipo === 'time') ev = 'change';
    }
    el.addEventListener(ev, function () { aoMudar(item, f, el.value); });
    return h('label', { class: 'campo' }, h('span', null, f.rotulo), el);
  }

  /* editor genérico de coleção de objetos */
  function editor(o) {
    var box = h('div');
    function desenhar(focoId) {
      U.limpar(box);
      var lista = S.get()[o.colecao], ord = o.ordenar ? o.ordenar(lista) : lista;
      box.appendChild(h('div', { class: 'acoes', style: 'margin-top:0;margin-bottom:.6rem' }, h('button', { class: 'btn primario', type: 'button', onclick: adicionar }, '+ ' + o.rotuloAdd)));
      if (!ord.length) box.appendChild(h('p', { class: 'vazio' }, 'Nada cadastrado ainda.'));
      ord.forEach(function (item) { box.appendChild(linha(item)); });
      if (focoId) { var ln = box.querySelector('.form-linha[data-id="' + focoId + '"]'), i = ln && ln.querySelector('input, select'); if (i) i.focus(); }   /* foca o item novo, não o primeiro da lista ordenada */
    }
    function adicionar() { var n = null; S.alterar(function (s) { n = o.novo(s); s[o.colecao].unshift(n); }, true); desenhar(n && n.id); }
    function mudou(item, f, v) {
      S.alterar(function () {
        if (f.set) f.set(item, v); else if (f.tipo === 'number') item[f.k] = v === '' ? null : Number(v); else item[f.k] = v;
        item.exemplo = false;
      }, true);
      if (f.redesenha) desenhar();
    }
    function linha(item) {
      var campos = o.campos.filter(function (f) { return !f.mostrar || f.mostrar(item); });
      return h('div', { class: 'form-linha', 'data-id': item.id || null },
        h('div', { class: 'campos' }, campos.map(function (f) { return campoEl(item, f, mudou); })),
        h('div', { class: 'linha-fim' }, h('span', { class: 'nota' }, [item.exemplo ? 'Exemplo — edite ou remova. ' : '', item.fonte === 'ics' ? 'Importado de .ics. ' : '']),
          h('button', { class: 'btn perigo', type: 'button', onclick: function () {
            PS.modal.abrir('Remover item?', h('p', null, '“' + (item.titulo || item.nome || item.texto || 'item') + '” será removido.'), [
              { rotulo: 'Remover', tipo: 'perigo', acao: function () { S.alterar(function (s) { s[o.colecao] = s[o.colecao].filter(function (x) { return x !== item; }); }, true); desenhar(); } }, { rotulo: 'Cancelar' }]);
          } }, 'Remover')));
    }
    desenhar();
    return box;
  }

  function nomesListas() { return PS.dom.listasComTarefas(S.get()).map(function (n) { return [n, n]; }); }

  function editorListas() {
    var box = h('div', { class: 'bloco' });
    function desenhar() {
      U.limpar(box);
      box.appendChild(h('h3', null, 'Listas'));
      S.get().listas.forEach(function (nome, i) {
        var inp = h('input', { type: 'text', value: nome, maxlength: 30, class: 'entrada', 'aria-label': 'Nome da lista ' + (i + 1) });
        var antigo = nome;
        inp.addEventListener('change', function () {
          var novo = inp.value.trim(); if (!novo) { inp.value = antigo; return; }
          S.alterar(function (s) { s.tarefas.forEach(function (t) { if (t.lista === antigo) t.lista = novo; }); s.listas[i] = novo; }, true); antigo = novo;
        });
        box.appendChild(h('div', { class: 'linha-fim', style: 'margin:.25rem 0' }, h('div', { style: 'flex:1' }, inp),
          h('button', { class: 'btn perigo', type: 'button', onclick: function () {
            if (S.get().listas.length <= 1) { PS.aviso('Mantenha ao menos uma lista'); return; }
            S.alterar(function (s) { var dest = s.listas[i === 0 ? 1 : 0]; s.tarefas.forEach(function (t) { if (t.lista === s.listas[i]) t.lista = dest; }); s.listas.splice(i, 1); }, true); desenhar(); PS.aviso('Tarefas movidas para outra lista');
          } }, 'Remover')));
      });
      box.appendChild(h('div', { class: 'acoes' }, h('button', { class: 'btn', type: 'button', onclick: function () { S.alterar(function (s) { s.listas.push('Nova lista'); }, true); desenhar(); } }, '+ Nova lista')));
    }
    desenhar(); return box;
  }

  function baixar(nome, texto, mime) {
    var blob = new Blob([texto], { type: mime }), url = URL.createObjectURL(blob), a = h('a', { href: url, download: nome });
    document.body.appendChild(a); a.click(); setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }
  function lerArquivo(accept, aoLer) {
    var inp = h('input', { type: 'file', accept: accept, style: 'position:fixed;left:-9999px', 'aria-hidden': 'true', tabindex: '-1' });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var r = new FileReader(); r.onload = function () { aoLer(String(r.result), f); }; r.onerror = function () { PS.aviso('Não consegui ler o arquivo'); };
      r.readAsText(f); document.body.removeChild(inp);
    });
    document.body.appendChild(inp); inp.click();
  }
  function copiar(ta) {
    ta.focus(); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (!ok && navigator.clipboard) { navigator.clipboard.writeText(ta.value).then(function () { PS.aviso('Link copiado'); }); return; }
    PS.aviso(ok ? 'Link copiado' : 'Selecione e copie manualmente');
  }

  var secoes = {
    geral: function () {
      var c = S.get().config, msg = h('p', { class: 'nota', 'aria-live': 'polite' }, 'Coordenadas atuais: ' + c.lat.toFixed(3) + ', ' + c.lon.toFixed(3));
      function salvar(k, v) { S.alterar(function (s) { s.config[k] = v; }, true); PS.aplicarConfig(); }
      function buscar() {
        var v = cidade.value.trim(); msg.textContent = 'Buscando…';
        PS.clima.geocodificar(v).then(function (r) {
          S.alterar(function (s) { s.config.cidade = r.nome; s.config.lat = r.lat; s.config.lon = r.lon; }, true);
          cidade.value = r.nome; msg.textContent = 'Encontrada: ' + r.nome + ' (' + r.lat.toFixed(3) + ', ' + r.lon.toFixed(3) + ')'; PS.limparClima();
        }, function (e) { msg.textContent = (e && e.message) || 'Não foi possível buscar agora (sem internet?). Cidade salva, clima mantém a localização anterior.'; });
      }
      var cidade = h('input', { type: 'text', value: c.cidade, maxlength: 80, placeholder: 'Cidade, UF', autocomplete: 'off' });
      cidade.addEventListener('change', function () { salvar('cidade', cidade.value.trim() || 'Osasco, SP'); buscar(); });
      function sel(k, ops, conv) { var e = h('select', null, ops.map(function (o) { return h('option', { value: o[0] }, o[1]); })); e.value = String(c[k]); e.addEventListener('change', function () { salvar(k, conv(e.value)); }); return e; }
      function chk(k) { var e = h('input', { type: 'checkbox', checked: !!c[k] }); e.addEventListener('change', function () { salvar(k, e.checked); }); return e; }
      var nome = h('input', { type: 'text', value: c.nome, maxlength: 40, placeholder: 'opcional', autocomplete: 'off' });
      nome.addEventListener('input', function () { salvar('nome', nome.value.trim()); });
      return h('div', null,
        h('div', { class: 'form-linha' }, h('div', { class: 'campos' },
          h('label', { class: 'campo' }, h('span', null, 'Seu nome (saudação)'), nome),
          h('label', { class: 'campo' }, h('span', null, 'Cidade do clima'), cidade),
          h('div', { class: 'campo' }, h('span', null, ' '), h('button', { class: 'btn', type: 'button', onclick: buscar }, 'Buscar cidade'))), msg),
        h('div', { class: 'form-linha' }, h('div', { class: 'campos' },
          h('label', { class: 'campo' }, h('span', null, 'Tamanho da letra'), sel('fonte', [['1', 'Normal'], ['2', 'Grande'], ['3', 'Enorme']], Number)),
          h('label', { class: 'campo' }, h('span', null, 'Escurecer após inatividade'), sel('escurecerMin', [['0', 'Nunca'], ['5', '5 minutos'], ['10', '10 minutos'], ['20', '20 minutos'], ['30', '30 minutos']], Number)),
          h('label', { class: 'campo marcar' }, chk('contraste'), h('span', null, 'Tema de alto contraste')),
          h('label', { class: 'campo marcar' }, chk('noiteAuto'), h('span', null, 'Modo noite automático (22h–6h)')))),
        h('div', { class: 'form-linha' }, h('p', { class: 'nota' }, 'Instale como app no celular:'), h('div', { class: 'acoes', style: 'margin-top:.2rem' },
          h('a', { class: 'btn', href: '#/instalar' }, 'Instalar no celular'))));
    },
    habitos: function () {
      return editor({ colecao: 'habitos', rotuloAdd: 'Novo hábito', novo: function () { return { id: U.uid(), nome: '', icone: 'check' }; },
        campos: [{ k: 'nome', rotulo: 'Hábito', dica: 'Ex.: Alongar', max: 40 }, { k: 'icone', rotulo: 'Ícone', tipo: 'select', opcoes: function () { return PS.iconesLista.map(function (n) { return [n, n]; }); } }] });
    },
    tarefas: function () {
      var w = h('div'); w.appendChild(editorListas());
      w.appendChild(h('div', { class: 'bloco' }, h('h3', null, 'Tarefas'), editor({ colecao: 'tarefas', rotuloAdd: 'Nova tarefa', ordenar: function (l) { return PS.dom.ordenarTarefas(l); },
        novo: function (s) { return { id: U.uid(), lista: s.listas[0], titulo: '', prio: 'media', vence: '', feita: false }; },
        campos: [{ k: 'titulo', rotulo: 'Tarefa', max: 120 }, { k: 'lista', rotulo: 'Lista', tipo: 'select', opcoes: nomesListas }, { k: 'prio', rotulo: 'Prioridade', tipo: 'select', opcoes: function () { return PRIO; } },
          { k: 'vence', rotulo: 'Vence em', tipo: 'date' }, { k: 'feita', rotulo: 'Concluída', tipo: 'check' }] })));
      return w;
    },
    agenda: function () {
      var w = h('div'), res = h('p', { class: 'nota', 'aria-live': 'polite' });
      var sub = h('input', { type: 'checkbox', checked: true });
      var ed = editor({ colecao: 'compromissos', rotuloAdd: 'Novo compromisso', ordenar: function (l) { return PS.dom.ordenarCompromissos(l); },
        novo: function () { return { id: U.uid(), titulo: '', data: U.hoje(), hora: '', local: '', fonte: 'manual' }; },
        campos: [{ k: 'titulo', rotulo: 'Compromisso', max: 120 }, { k: 'data', rotulo: 'Data', tipo: 'date' }, { k: 'hora', rotulo: 'Hora', tipo: 'time' }, { k: 'local', rotulo: 'Local', max: 80 }] });
      w.appendChild(h('div', { class: 'form-linha' }, h('h3', null, 'Importar arquivo .ics'),
        h('p', { class: 'nota' }, 'Exporte sua agenda (Google Agenda: Configurações → Importar e exportar) e escolha o arquivo .ics. Lê os próximos 120 dias; repetições simples (diária, semanal, mensal, anual) são expandidas. Sem login, sem nuvem.'),
        h('label', { class: 'campo marcar' }, sub, h('span', null, 'Substituir compromissos importados antes')),
        h('div', { class: 'acoes' }, h('button', { class: 'btn', type: 'button', onclick: function () {
          lerArquivo('.ics,text/calendar', function (txt) {
            var r; try { r = PS.ics.importar(txt, 120); } catch (e) { res.textContent = 'Arquivo .ics inválido.'; return; }
            S.alterar(function (s) { if (sub.checked) s.compromissos = s.compromissos.filter(function (c) { return c.fonte !== 'ics'; }); s.compromissos = s.compromissos.concat(r.compromissos); }, true);
            res.textContent = r.total + ' evento(s) lidos; ' + r.compromissos.length + ' compromisso(s) nos próximos 120 dias importados.';
            var novo = ed.parentNode; novo.replaceChild(editor({ colecao: 'compromissos', rotuloAdd: 'Novo compromisso', ordenar: function (l) { return PS.dom.ordenarCompromissos(l); }, novo: function () { return { id: U.uid(), titulo: '', data: U.hoje(), hora: '', local: '', fonte: 'manual' }; }, campos: [{ k: 'titulo', rotulo: 'Compromisso', max: 120 }, { k: 'data', rotulo: 'Data', tipo: 'date' }, { k: 'hora', rotulo: 'Hora', tipo: 'time' }, { k: 'local', rotulo: 'Local', max: 80 }] }), ed);
          });
        } }, 'Escolher arquivo .ics')), res));
      w.appendChild(ed); return w;
    },
    familia: function () {
      var w = h('div');
      w.appendChild(h('div', { class: 'bloco' }, h('h3', null, 'Lembretes'), h('p', { class: 'nota' }, 'Mensais (ex.: comprovante da escola até o dia 10) ou sem data (ex.: comprar algo). Pendências de prioridade alta aparecem em Hoje.'),
        editor({ colecao: 'lembretes', rotuloAdd: 'Novo lembrete', ordenar: function (l) { return l.slice().sort(function (a, b) { return (a.dia || 0) - (b.dia || 0); }); }, novo: function () { return { id: U.uid(), titulo: '', dia: 10, obs: '', feitos: {}, feito: false, prio: 'media', categoria: '', icone: '' }; },
          campos: [{ k: 'titulo', rotulo: 'Lembrete', max: 100 },
            { k: 'semdata', rotulo: 'Sem data (pendência até marcar como feito)', tipo: 'check', redesenha: true, get: function (i) { return !i.dia; }, set: function (i, v) { i.dia = v ? 0 : 10; } },
            { k: 'dia', rotulo: 'Dia do mês', tipo: 'number', min: 1, maxn: 31, mostrar: function (i) { return i.dia > 0; }, set: function (i, v) { i.dia = Math.min(31, Math.max(1, Math.round(Number(v)) || 1)); } },
            { k: 'prio', rotulo: 'Prioridade (alta aparece em Hoje)', tipo: 'select', mostrar: function (i) { return !i.dia; }, opcoes: function () { return PRIO; } },
            { k: 'categoria', rotulo: 'Categoria', max: 30, dica: 'Ex.: Pet / Família' },
            { k: 'icone', rotulo: 'Ícone', tipo: 'select', opcoes: function () { return PS.iconesFamilia; } },
            { k: 'feito', rotulo: 'Feito', tipo: 'check', mostrar: function (i) { return !i.dia; } },
            { k: 'obs', rotulo: 'Observação', max: 160 }] })));
      var m0 = U.ym(U.hoje()), blocoContas = h('div', { class: 'bloco' });
      var MESES_OP = U.MESES.map(function (n, k) { return [String(k + 1), n]; });
      function desenharContas() {
        U.limpar(blocoContas);
        var faltam = PS.fin.fixasFaltando(S.get()).length;
        blocoContas.appendChild(h('h3', null, 'Contas de casa'));
        blocoContas.appendChild(h('p', { class: 'nota' }, 'Mensais repetem todo mês (com “paga” separado por mês); anuais, uma vez por ano. Valor é opcional. Em “Débito automático” o painel só lembra de conferir o saldo: a conta continua em aberto até você marcar como paga. Arquivar pausa a conta sem apagar.'));
        blocoContas.appendChild(h('div', { class: 'acoes', style: 'margin-top:0;margin-bottom:.6rem' }, h('button', { class: 'btn', type: 'button', 'data-fid': 'fx:add-ger', disabled: faltam ? null : 'disabled', onclick: function () { PS.finUI.adicionarFixas(); desenharContas(); } }, I('carteira'), 'Adicionar contas fixas sugeridas' + (faltam ? '' : ' (já adicionadas)'))));
        blocoContas.appendChild(editor({ colecao: 'contas', rotuloAdd: 'Nova conta', ordenar: function (l) { var hj = U.hoje(); return l.slice().sort(function (a, b) { return (a.arquivada ? 1 : 0) - (b.arquivada ? 1 : 0) || (PS.fin.proximoVencimento(a, hj) < PS.fin.proximoVencimento(b, hj) ? -1 : 1); }); },
          novo: function () { return { id: U.uid(), titulo: '', mensal: true, anual: false, mes: 0, dia: 10, data: '', valor: null, paga: false, pagas: {}, valores: {}, desde: U.ym(U.hoje()), cat: 'casa', dono: '', forma: '', obs: '', cartaoRef: '', arquivada: false }; },
          campos: [{ k: 'titulo', rotulo: 'Conta', max: 80 },
            { k: 'mensal', rotulo: 'Repete todo mês', tipo: 'check', redesenha: true, set: function (i, v) { i.mensal = !!v; if (v) { i.anual = false; i.mes = 0; } } },
            { k: 'anual', rotulo: 'Repete todo ano', tipo: 'check', redesenha: true, mostrar: function (i) { return !i.mensal; }, set: function (i, v) { i.anual = !!v; if (v) { i.mensal = false; i.mes = i.mes || (+U.ym(U.hoje()).slice(5)); } else i.mes = 0; } },
            { k: 'mes', rotulo: 'Mês do vencimento', tipo: 'select', opcoes: function () { return MESES_OP; }, mostrar: function (i) { return i.anual; }, set: function (i, v) { i.mes = Math.min(12, Math.max(1, Math.round(Number(v)) || 1)); } },
            { k: 'dia', rotulo: 'Dia do vencimento', tipo: 'number', min: 1, maxn: 31, mostrar: function (i) { return i.mensal || i.anual; }, set: function (i, v) { i.dia = Math.min(31, Math.max(1, Math.round(Number(v)) || 1)); } },
            { k: 'data', rotulo: 'Vence em', tipo: 'date', mostrar: function (i) { return !i.mensal && !i.anual; } },
            { k: 'icone', rotulo: 'Ícone', tipo: 'select', opcoes: function () { return PS.iconesFamilia; } },
            { k: 'valor', rotulo: 'Valor (R$) opcional', tipo: 'number', passo: '0.01', min: 0, dica: '0,00', set: function (i, v) { i.valor = v === '' ? null : Math.max(0, Number(v)); } },
            { k: 'forma', rotulo: 'Forma de pagamento', tipo: 'select', opcoes: function () { return PS.fin.FORMAS; } },
            { k: 'obs', rotulo: 'Banco / observação (sem números de conta)', max: 60, dica: 'Ex.: pagar pelo app do banco' },
            { k: 'cartaoRef', rotulo: 'Fatura de cartão vinculada (nome do cartão, opcional)', max: 30, dica: 'Ex.: o apelido do cartão em Cartões' },
            { k: 'cat', rotulo: 'Categoria (histórico)', tipo: 'select', opcoes: function () { return S.CATS.map(function (c) { return [c, PS.nomeCat ? PS.nomeCat(c) : c]; }); } },
            { k: 'dono', rotulo: 'De quem', tipo: 'select', opcoes: function () { return [['', 'Casal / sem dono'], ['gui', 'Gui'], ['esposa', S.get().config.esposa], ['casal', 'Casal']]; } },
            { k: 'arquivada', rotulo: 'Arquivada (pausar, não cobrar)', tipo: 'check' },
            { k: 'paga', rotulo: 'Paga (este mês) — manual', tipo: 'check', mostrar: function (i) { return !i.anual && !i.arquivada; }, get: function (i) { return i.mensal ? !!(i.pagas && i.pagas[m0]) : !!i.paga; }, set: function (i, v) { if (v) PS.fin.marcarPaga({ contas: [i] }, 'conta', i.id, i.mensal ? m0 : 'avulsa', U.hoje()); else PS.fin.desfazerPaga({ contas: [i] }, 'conta', i.id, i.mensal ? m0 : 'avulsa'); } }] }));
      }
      desenharContas();
      w.appendChild(blocoContas);
      return w;
    },
    links: function () {
      var w = h('div'); w.appendChild(h('p', { class: 'nota' }, 'Atalhos da tela Relaxar. Só endereços http(s). Abrem na mesma aba/app.'));
      w.appendChild(editor({ colecao: 'links', rotuloAdd: 'Novo atalho', novo: function () { return { id: U.uid(), titulo: '', url: 'https://', icone: 'globo' }; },
        campos: [{ k: 'titulo', rotulo: 'Nome', max: 40 }, { k: 'url', rotulo: 'Endereço', tipo: 'url', dica: 'https://…', max: 600, set: function (i, v) { v = v.trim(); if (/^https?:\/\/\S+$/i.test(v)) i.url = v; else PS.aviso('Endereço precisa começar com http:// ou https://'); } },
          { k: 'icone', rotulo: 'Ícone', tipo: 'select', opcoes: function () { return PS.iconesLista.map(function (n) { return [n, n]; }); } }] }));
      w.appendChild(h('div', { class: 'bloco' }, h('h3', null, 'Frases de foco do dia'), editor({ colecao: 'foco', rotuloAdd: 'Nova frase', novo: function () { return { id: U.uid(), texto: '' }; }, campos: [{ k: 'texto', rotulo: 'Frase', max: 140 }] })));
      return w;
    },
    sync: function () {
      var e = PS.sync.estado(), w = h('div');
      w.appendChild(h('div', { class: 'form-linha' }, h('h3', null, 'Sincronização na nuvem'),
        h('div', { class: 'status-sync ' + e.nivel }, h('span', { class: 'ic-status' }, I(e.nivel === 'ok' ? 'check' : e.nivel === 'perigo' ? 'alerta' : 'nuvem')), h('span', null, e.rotulo)),
        e.ativo ? h('p', { class: 'nota' }, 'Família ' + e.codigo.replace(/(\d{4})(?=\d)/g, '$1 ') + ' · este aparelho: ' + e.aparelho) : h('p', { class: 'nota' }, 'Desligada. Os dados ficam só neste aparelho.'),
        h('p', { class: 'nota' }, 'Cifrado de ponta a ponta: o servidor guarda só texto ilegível. Perder a senha E a chave de recuperação = dados da nuvem irrecuperáveis.'),
        h('div', { class: 'acoes' }, h('a', { class: 'btn primario', href: '#/sincronizar', 'data-fid': 'gs:abrir' }, e.ativo ? 'Gerenciar conexão' : 'Criar ou entrar numa família'),
          e.ativo ? h('button', { class: 'btn', type: 'button', onclick: function () { PS.aviso('Sincronizando…'); PS.sync.sincronizarAgora(); } }, 'Sincronizar agora') : null)));
      var ml = h('input', { type: 'number', min: 1, max: 60, value: PS.bloqueio.minutos(), inputmode: 'numeric', 'data-fid': 'gs:min' });
      ml.addEventListener('change', function () { PS.bloqueio.definirMinutos(Math.min(60, Math.max(1, Math.round(Number(ml.value)) || 5))); });
      var pinI = h('input', { type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'off', placeholder: '4 a 8 números', 'data-fid': 'gs:pin' });
      w.appendChild(h('div', { class: 'form-linha' }, h('h3', null, 'Bloqueio do painel neste aparelho'),
        h('p', { class: 'nota' }, 'PIN opcional que tranca a tela depois de um tempo parado e ao abrir o app. Recomendado se o celular for compartilhado. É só privacidade de tela (não substitui a senha da família).'),
        h('p', { class: 'nota' }, PS.bloqueio.ativo() ? 'Ligado: trava após ' + PS.bloqueio.minutos() + ' min sem uso.' : 'Desligado neste aparelho.'),
        h('div', { class: 'campos' }, h('label', { class: 'campo' }, h('span', null, 'PIN do aparelho'), pinI), h('label', { class: 'campo' }, h('span', null, 'Travar após (minutos)'), ml)),
        h('div', { class: 'acoes' },
          PS.bloqueio.ativo() ? h('button', { class: 'btn perigo', type: 'button', onclick: function () { PS.bloqueio.desativar(pinI.value).then(function () { PS.aviso('Bloqueio desligado'); PS.redesenhar(); }, function (er) { PS.aviso(er.message || 'PIN incorreto'); }); } }, 'Desligar (digite o PIN)')
            : h('button', { class: 'btn primario', type: 'button', onclick: function () { var v = pinI.value; if (!/^\d{4,8}$/.test(v)) { PS.aviso('Use de 4 a 8 números.'); return; } PS.bloqueio.ativar(v, Math.round(Number(ml.value)) || 5).then(function () { PS.aviso('Bloqueio ligado'); PS.redesenhar(); }); } }, 'Ligar bloqueio'),
          PS.bloqueio.ativo() ? h('button', { class: 'btn', type: 'button', onclick: function () { PS.bloqueio.bloquear(); } }, 'Bloquear agora') : null)));
      return w;
    },
    backup: function () {
      var saida = h('div'), ta = null;
      function gerar() {
        U.limpar(saida);
        var r = S.gerarLink();
        ta = h('textarea', { class: 'entrada', readonly: 'readonly', rows: 4, 'aria-label': 'Link de configuração' }); ta.value = r.link;
        var aviso = r.tamanho > 8000 ? 'Link muito grande (' + r.tamanho + ' caracteres): provavelmente não cabe em mensagens/navegadores. Use o arquivo JSON.' : r.tamanho > 2000 ? 'Link com ' + r.tamanho + ' caracteres: alguns apps cortam links acima de ~2.000. Se falhar, use o arquivo JSON.' : 'Link com ' + r.tamanho + ' caracteres (ok).';
        saida.appendChild(ta);
        saida.appendChild(h('p', { class: 'nota' + (r.tamanho > 2000 ? ' aviso' : '') }, aviso));
        saida.appendChild(h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'button', onclick: function () { copiar(ta); } }, 'Copiar link')));
      }
      return h('div', null,
        h('div', { class: 'form-linha' }, h('h3', null, 'Backup em arquivo (JSON)'), h('p', { class: 'nota' }, 'Guarda tudo, inclusive o histórico de hábitos.'),
          h('div', { class: 'acoes' },
            h('button', { class: 'btn primario', type: 'button', onclick: function () { baixar('minha-casa-backup-' + U.hoje() + '.json', S.exportarJSON(), 'application/json'); PS.aviso('Backup baixado'); } }, 'Exportar JSON'),
            h('button', { class: 'btn', type: 'button', onclick: function () {
              lerArquivo('.json,application/json', function (txt) {
                var d; try { d = S.lerBackup(txt); } catch (e) { PS.aviso('Backup inválido: ' + e.message); return; }
                PS.modal.abrir('Importar backup?', h('p', null, 'Isto SUBSTITUI todos os dados deste aparelho.' + (PS.sync && PS.sync.ativo() ? ' ATENÇÃO: a sincronização está ligada; os itens que não estão no backup serão apagados em TODOS os aparelhos da família.' : '')), [{ rotulo: 'Substituir', tipo: 'perigo', acao: function () { S.substituir(d, false); PS.aplicarConfig(); PS.aviso('Backup importado'); PS.redesenhar(); } }, { rotulo: 'Cancelar' }]);
              });
            } }, 'Importar JSON'))),
        h('div', { class: 'form-linha' }, h('h3', null, 'Link de configuração'),
          h('p', { class: 'nota' }, 'Configure no celular e gere um link com tudo (sem servidor: os dados vão dentro do endereço, depois do #). Abra o mesmo link no outro celular. Não inclui histórico de hábitos nem tarefas concluídas. Limite prático: ~2.000 caracteres em apps de mensagem; se passar, use o arquivo JSON.'),
          h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'button', onclick: gerar }, 'Gerar link agora')), saida),
        h('div', { class: 'form-linha' }, h('h3', null, 'Sincronizar na nuvem'), h('p', { class: 'nota' }, 'Os celulares da família com os mesmos dados, cifrados no aparelho. Veja a aba Sincronização.'), h('div', { class: 'acoes' }, h('a', { class: 'btn', href: '#/sincronizar', 'data-fid': 'gb:sync' }, 'Abrir sincronização'))),
        h('div', { class: 'form-linha' }, h('h3', null, 'Dados de exemplo e reinício'),
          h('div', { class: 'acoes' },
            h('button', { class: 'btn', type: 'button', onclick: function () { if (!S.temExemplos()) { PS.aviso('Não há itens de exemplo'); return; } S.limparExemplos(); PS.aviso('Exemplos removidos'); } }, 'Remover itens de exemplo'),
            h('button', { class: 'btn perigo', type: 'button', onclick: function () {
              PS.modal.abrir('Apagar tudo?', h('p', null, 'Remove seus dados e volta aos exemplos iniciais. Faça um backup antes.' + (PS.sync && PS.sync.ativo() ? ' ATENÇÃO: a sincronização está ligada; isto apaga os dados em TODOS os aparelhos da família. Para só desconectar este aparelho, use Sair em Sincronização.' : '')), [{ rotulo: 'Apagar tudo', tipo: 'perigo', acao: function () { S.apagarTudo().then(function () { PS.aplicarConfig(); PS.aviso('Dados reiniciados'); PS.redesenhar(); }); } }, { rotulo: 'Cancelar' }]);
            } }, 'Apagar tudo'))));
    }
  };

  PS.views.gerenciar = { reativo: false, titulo: 'Gerenciar', render: function (param) {
    var aba = secoes[param] ? param : 'geral';
    var tabs = ABAS.map(function (a) { return h('a', { class: 'aba', href: '#/gerenciar/' + a[0], role: 'tab', 'aria-selected': a[0] === aba ? 'true' : 'false', 'data-fid': 'ga:' + a[0] }, a[1]); });
    var aviso = S.temExemplos() && aba !== 'backup' ? h('div', { class: 'aviso-exemplo' }, h('span', null, 'Itens marcados como “exemplo” são só para mostrar como fica. Edite, ou remova todos de uma vez.'),
      h('button', { class: 'btn', type: 'button', onclick: function () { S.limparExemplos(); PS.redesenhar(); } }, 'Remover exemplos')) : null;
    return h('div', null, h('h1', { class: 'titulo-tela' }, 'Gerenciar', h('small', null, 'salvo automaticamente neste aparelho')), h('div', { class: 'subabas', role: 'tablist' }, tabs), aviso, secoes[aba]());
  } };
})(window);
