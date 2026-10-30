# Minha Casa em Ordem

App da família para o **celular**: tarefas, agenda, lista de compra, contas a pagar, **faturas do cartão (lidas do PDF no próprio aparelho)** e avisos de vencimento, com painéis visuais (rosca por categoria, barras por mês, anel pago × em aberto). **HTML + CSS + JS puro** (sem npm, sem build), funciona offline e instala na tela inicial (PWA).

- **App com login (use este):** https://minha-casa-em-ordem.guilhermeromionetto.workers.dev — hospedado na Cloudflare, atrás de login (2 contas administradoras).
- **Cópia pública de código (GitHub Pages):** https://guilhermeromio-netto-prog.github.io/minha-casa-em-ordem/ — é só o código estático, **sem login e sem dados da família**; os dados ficam no aparelho de quem abre. Se não quiser essa cópia, desative em *Settings → Pages* do repositório.
- Interface em português do Brasil. Rodapé **byGui**.

> Dados que já vêm preenchidos (tarefas, contas, links) são **exemplos editáveis**, sempre rotulados "exemplo".

## O que tem

| Rota | O que mostra |
|---|---|
| `#/` Hoje | Hora, clima, **Atenção agora** (contas vencidas/a vencer, fatura aberta), compromissos, tarefas |
| `#/tarefas` · `#/agenda` | Tarefas por lista; compromissos (manuais ou `.ics`) |
| `#/compras` | **Lista de Compra**: itens da lista de compras (também por foto) |
| `#/contas` | **Contas a pagar** (antiga Família; `#/familia` ainda abre aqui): **Em aberto · Pagas · Histórico**, anel pago × em aberto, gráfico por mês, vencidas em destaque; **contas fixas sugeridas** com forma de pagamento (selo e filtro); ver [docs/CONTAS-FIXAS.md](docs/CONTAS-FIXAS.md) |
| `#/cartoes` | Cartões e faturas: envie o **PDF** da fatura → revisão → painel (rosca por categoria, barras por mês, comparação com o mês anterior, busca, CSV) |
| `#/sincronizar` | Sincronização opcional **cifrada de ponta a ponta** entre os celulares |
| `#/gerenciar` | Editar tudo, ajustes, backup JSON, link de configuração, bloqueio do app |
| `#/relaxar` · `#/instalar` | Atalhos de lazer · como instalar no celular |

Documentação: [`docs/SINCRONIZACAO.md`](docs/SINCRONIZACAO.md) · [`docs/FATURA-PDF.md`](docs/FATURA-PDF.md) · [`docs/LEMBRETES.md`](docs/LEMBRETES.md) · [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md) (hospedagem, login, segurança) · [`docs/GUIA-OPENCODE.md`](docs/GUIA-OPENCODE.md) · regras do repositório em [`AGENTS.md`](AGENTS.md).

## Instalar no celular

Abra o endereço do app no navegador do celular (e entre com seu login). **Android/Chrome:** menu ⋮ → *Instalar app* (ou use o botão em `#/instalar`). **iPhone/Safari:** Compartilhar → *Adicionar à Tela de Início*. Depois de instalado abre em tela cheia, com atalhos (Hoje, Contas, Fatura) ao segurar o ícone no Android.

## Login (Cloudflare)

Só **duas contas**, ambas **administradoras** (Guilherme e a esposa); não existe cadastro público. A primeira vez é por um **link de primeiro acesso de uso único** (você cria a senha na hora; ninguém digita senha em chat). Qualquer admin pode **gerar de novo o link** do outro (isso apaga a senha e encerra as sessões dele) em **Conta** (`/conta`). Detalhes e limites em `docs/CLOUDFLARE.md`.

**Importante:** a senha do login **não é** a "senha da família" da sincronização. O login só libera o acesso ao site; a **senha da família** é a que cifra os dados (o servidor nunca a vê). Sair da conta **não apaga** os dados guardados no aparelho.

## Dados, privacidade e backup

Tudo fica no `localStorage` do aparelho (chave `painelsala.dados`, esquema versionado; o nome `painelsala` é mantido de propósito para não perder dados de quem já usava). **Gerenciar → Backup** exporta/importa JSON. A **fatura em PDF é lida no aparelho e nunca é enviada nem guardada**; só os lançamentos que você confirma entram nos dados (e, se ligar a sincronização, vão cifrados). O endereço do Cloudflare e o do GitHub Pages são **origens diferentes**, então cada um tem seus próprios dados locais: use a sincronização ou um backup JSON para levar de um ao outro.

## Estrutura

```
index.html  manifest.webmanifest  sw.js  dados.json
css/   js/ (store, dominio, financeiro, cartoes, fatura-parser, graficos, sync…, vendor/pdfjs)
assets/  icons/   docs/   tools/ (testes, montar-dist, gerar-deploy-cloudflare)
sync-worker/ (Worker de sincronização)   portal-worker/ (Worker do login + app)
.github/workflows/pages.yml
```

## Desenvolvimento

```bash
python3 -m http.server 8000                 # http://localhost:8000 (sem login)
node tools/teste-unidade.js; node tools/teste-financeiro.js; node tools/teste-cartoes-calc.js; node tools/teste-fatura.mjs
python3 tools/teste-financas.py --chrome /usr/bin/google-chrome   # idem teste-cartoes.py, teste-smoke.py; teste-contas-fixas.py
tools/versionar.sh                          # antes de publicar: carimba ?v=<hash> e a versão do service worker
bash tools/montar-dist.sh                   # dist/ só com os arquivos do app (Pages e Cloudflare usam isso)
```

Publicação: push em `main` publica o GitHub Pages (raiz do repositório; o token usado não tinha escopo `workflow`, então o workflow não foi alterado). O app com login na Cloudflare é publicado por `tools/gerar-deploy-cloudflare.py` (veja `docs/CLOUDFLARE.md`; ainda **não** é automático a cada push).

## Limitações conhecidas

- O leitor de fatura foi validado com **1 fatura real do Itaú Black (set/2026, só localmente: ela não vai para o repositório)** e com PDFs sintéticos (Nubank, Itaú simples e em duas colunas, Bradesco, com senha, só imagem). Outros bancos/produtos podem trazer layouts diferentes: por isso existe a **tela de revisão** com conferência dos valores. Não há OCR (PDF só de imagem é recusado) nem tela de mapeamento de colunas.
- Lembretes com o app **fechado** dependem do sistema (veja `docs/LEMBRETES.md`).
- O bloqueio do app (PIN) é só um dissuasor de tela, não criptografia.
- Clima precisa de internet (Open-Meteo); offline mostra o último valor.
- Não há app de TV/APK: foi descontinuado (o código antigo e o `painel.apk` foram removidos do repositório; versões antigas seguem nas *Releases*).

byGui
