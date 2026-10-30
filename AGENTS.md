# AGENTS.md — Minha Casa em Ordem

Regras para qualquer agente (OpenCode, Cursor, Claude, humano) que mexer neste repositório.

## Regras duras
1. **App estático**: HTML, CSS e JS puro no navegador. Sem npm, bundler, framework ou TypeScript no app. Os Workers (`sync-worker/`, `portal-worker/`) são JS de módulo único, sem dependências. **Pergunte antes** de propor framework ou novo servidor.
2. **Celular primeiro.** Alvo: 360–430 px de largura; sem rolagem horizontal; alvos de toque ≥ 44 px; respeitar `prefers-reduced-motion` nas animações. Teste a 390 px.
3. **PT-BR** em todo texto visível. Sem lorem ipsum, sem dados pessoais falsos: exemplos aparecem rotulados "exemplo" e são editáveis.
4. **Rodapé "byGui"** em todas as páginas (inclusive login).
5. **Tokens** de design só em `css/tokens.css`.
6. **JS ES5/ES6 básico** (sem `?.`/`??`). Namespace global `PS`. Scripts que registram `PS.views.*` carregam **depois** de `telas.js`. Seletores de teste: `data-fid`.
7. Persistência: `localStorage` (`painelsala.dados`, `versao` no esquema; as chaves `painelsala.*` são mantidas por compatibilidade). Toda importação passa por `sanear()`. Mudou o esquema? Suba a versão e escreva a migração em `js/store.js`.
8. Antes de publicar: `tools/versionar.sh`, todos os testes (veja README) e `bash tools/montar-dist.sh`.
9. **Nunca versionar** chaves, tokens, links de primeiro acesso, PEPPER, senhas, PDFs reais de fatura. Eles ficam fora do repositório (`/workspace/keys/` na box).
10. **Fatura em PDF**: lida só no aparelho; nunca enviar nem guardar o PDF; nunca registrar número completo de cartão (só os 4 últimos).

## Cloudflare e separação (regra dura)
- Este projeto **não se mistura** com a plataforma IoT: não ler, alterar nem reutilizar `chefe-geral-ponte`, `chefe-geral` (Worker/D1) nem outros Workers da conta (ex.: `ntn-alarmes-cron`). Recursos daqui: Worker `minha-casa-em-ordem` + D1 `minha-casa-acesso` (login) e Worker `painel-sala-sync` + D1 `painel-sala` (sincronização; nome antigo mantido para não perder a família criada).
- Plano **gratuito**: os 100 mil requests/dia do Workers são **da conta inteira** (compartilhados com os outros Workers do dono). Sessão validada em cache de 60 s no isolate para poupar D1 e requests. D1: 5 M leituras e 100 mil escritas por dia.
- **PBKDF2 do login = 100 000 iterações** (máximo do Workers) + segredo `PEPPER` (HMAC). Não suba o número: o Worker passa a falhar. Segredos só como *secret_text*; nunca em log, repositório ou relatório.
- Dois admins fixos, sem cadastro público. Cookie `__Host-mco` (HttpOnly, Secure, SameSite=Strict). Mudanças no portal: rode `python3 tools/teste-portal.py` e `tools/teste-portal-browser.py` **só no wrangler dev local** (os testes travam contas; recusam rodar em `workers.dev`).
- Ao mexer no sync-worker: `node sync-worker/teste-worker.mjs`; depois **zere o D1 de teste** (deleções por id; `select count(*)` nas 4 tabelas = 0). CORS permite `github.io` e o `workers.dev` do portal.

## pdf.js
`js/vendor/pdfjs/` = pdf.js **5.6.205** (Apache-2.0, mantenha a licença junto), carregado sob demanda (`import()`) só em `#/cartoes`. Para atualizar: troque os dois `.mjs` + licença, rode `tools/teste-fatura.mjs` e `tools/teste-cartoes.py`.

## Identidade visual
- Inspiração: visual corporativo de telecom, preto e magenta. **Proibido** usar logotipo/marca/"T" de empresa real ou afirmar ser dela.
- Acento único magenta `#E20074` (texto pequeno em magenta: `#FF4FA3`; texto sobre magenta: branco). Bases `#000`, `#0A0A0A`, `#1A1A1A`, `#262626`, `#3A3A3A`. Semânticas ok `#2EBB64`, aviso `#FFB020`, perigo `#FF6B5E`, sempre com ícone + rótulo.
- Tipografia de sistema (Inter/Helvetica/Arial), títulos peso 800; sem fontes embutidas nem CDN.
- Logo: `assets/logo.svg` (nome) e `assets/mark.svg` (símbolo). Original; não distorcer nem recolorir.

## Mapa de arquivos
`js/store.js` dados/esquema · `dominio.js` regras · `financeiro.js`/`financas-ui.js` contas, pago × aberto, histórico, avisos de vencimento · `cartoes.js`, `cartoes-calc.js`, `fatura-parser.js`, `pdf-importar.js` faturas · `graficos.js` SVG · `cripto.js`/`sync-nucleo.js`/`sync.js`/`sincronizar.js` sincronização E2E · `portal.js` conta/sair (só atrás do login) · `telas.js`, `gerenciar.js`, `app.js` telas/boot · `sync-worker/` e `portal-worker/` Workers · `tools/` testes e scripts.

byGui
