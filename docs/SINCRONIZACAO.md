# Sincronização na nuvem (celulares) — cifrada de ponta a ponta

O Minha Casa em Ordem continua **offline-first**: tudo funciona sem internet com os dados do próprio aparelho.
A sincronização é opcional e liga o celular do Gui e o da esposa ao **mesmo conjunto de dados**. Ela é independente do login do site: a **senha da família** (que cifra os dados) é diferente da senha de login da Cloudflare.

- **Worker:** `https://painel-sala-sync.guilhermeromionetto.workers.dev` (Cloudflare Workers, código em `sync-worker/worker.js`)
- **Banco:** D1 `painel-sala` (id `11d6c73a-54b3-43fd-ab5b-4ca68bf7c432`)
- Recursos **novos e separados** do `chefe-geral-ponte` / `chefe-geral` (que não são tocados).

## Como criar a família (uma vez)

Recomendado **no celular**.

1. Abra o painel → **Gerenciar → Sincronização → Criar ou entrar numa família** (ou `#/sincronizar`).
2. **Criar a família**: escolha um **PIN** (4 a 8 números; o servidor recusa 1234, 0000 etc.) e repita.
3. Escolha a **senha da família** (mín. 8 caracteres; uma frase de 3–4 palavras serve). Ela é *diferente* do PIN.
4. A tela mostra **uma única vez**: o **código da família** (8 números) e a **chave de recuperação** (26 caracteres). Anote em papel/gerenciador de senhas. Baixe também o **backup cifrado**.

## Como a esposa (ou outro aparelho) entra

1. `#/sincronizar` → **Entrar numa família que já existe**.
2. Digite o **código** (8 números) e o **PIN**.
3. Digite a **senha da família** (ou use a chave de recuperação se esqueceu a senha).
4. Se o aparelho já tem dados: o padrão é **"Juntar os dados deste aparelho com a família"** (mescla por item; nada é apagado). A opção "Usar só os dados da família" substitui os locais e pede confirmação.

Na tela de sincronização há **Aparelhos conectados** (com revogação), **Sair deste aparelho**, **Sair de todos**, trocar PIN, trocar senha, nova chave de recuperação e excluir a família.

## Atualizar o cache no celular

O service worker é *network-first*: abrir o app com internet já baixa a versão nova. Se o celular insistir na antiga: feche e abra o app, ou limpe os dados do site (isso apaga os dados locais: faça backup/sincronize antes).

## Como funciona (resumo técnico)

- **Chave mestra** aleatória (AES-GCM 256 + HMAC 256) gerada no aparelho. Ela é "embrulhada" por (a) uma chave derivada da **senha da família** (PBKDF2-SHA-256, 310 000 iterações, sal aleatório por família) e (b) uma **chave de recuperação** aleatória. Trocar a senha não exige recifrar os dados.
- Cada item (tarefa, compromisso, conta, link…) é cifrado **individualmente** (AES-GCM, IV aleatório, dados autenticados com coleção+id opaco). O servidor recebe apenas `{coleção, id opaco, base64, atualizado_em, apagado}`.
- O id opaco é um HMAC do id real: o servidor não consegue ligar o item a nada.
- No aparelho, as chaves ficam no **IndexedDB como CryptoKey não extraível**. A senha em texto nunca é gravada.
- **Conflitos:** vence a escrita mais recente **por item** (last-write-wins). Exclusões viram *tombstones* (por 120 dias) e não "ressuscitam". Se a senha de dois aparelhos editar o mesmo item ao mesmo tempo, a edição mais recente vence — a diferença de relógio entre aparelhos pode inverter edições quase simultâneas (o servidor limita relógios no futuro a +5 min).
- **Fonte e contraste** do app ficam **só no aparelho**. Todo o resto é compartilhado (inclui cartões, faturas, lançamentos e regras de categoria).
- **Sincronização:** ao abrir, ao voltar o foco, a cada 60 s com a tela visível e ~2,5 s depois de cada edição. Na tela Hoje há um indicador (ok / atrasado / offline).

## Autenticação, limites e lockout

- Código (8 dígitos) + PIN → o servidor devolve um **token aleatório de sessão**; só o **hash** do token fica no D1 e pode ser revogado.
- O PIN no servidor é guardado como HMAC com um segredo do Worker (`PEPPER`) + PBKDF2. O PIN **não cifra** nada: só autoriza um aparelho a baixar o material cifrado.
- **Lockout:** 5 falhas por família+IP em 10 min bloqueiam por 15 min; limites por família e por IP; criação de famílias limitada por IP. Mesmo assim, um PIN de 4 dígitos é fraco **sozinho** — por isso os dados são cifrados pela senha: quem descobrir código+PIN baixa apenas texto ilegível.
- Corpo máximo 512 KB; CORS restrito a `https://guilhermeromio-netto-prog.github.io` e `https://minha-casa-em-ordem.guilhermeromionetto.workers.dev`; cabeçalhos de segurança; nenhum PIN/token/senha vai para log.

## Modelo de ameaça (honesto)

| Quem | O que consegue ver |
|---|---|
| **Cloudflare / Worker / D1** | Código da família, quantidade de itens, nomes das coleções (ex.: "tarefas"), tamanho de cada item, horários de alteração, quais itens foram apagados, IP/User-Agent nos logs padrão da Cloudflare, quantos aparelhos. **Não** vê títulos, valores, datas, nomes, textos. |
| **GitHub / GitHub Pages** | Só o código do site (público). Não recebe dados do usuário. |
| **Alguém com código + PIN** | Baixa os blobs cifrados e vê o mesmo que a Cloudflare. Sem a senha não lê nada. |
| **Alguém com o aparelho destravado** | Vê tudo (os dados abertos ficam no aparelho). O **bloqueio do painel** (PIN opcional por aparelho) é só um dissuasor de tela, não criptografia. |
| **Pessoa que descobre a senha da família + código + PIN** | Lê tudo. Escolha uma senha longa. |

**Se perder a senha E a chave de recuperação, os dados na nuvem NÃO podem ser recuperados** (nem por nós). Cada aparelho que já está conectado continua com a cópia local e pode gerar um backup cifrado novo ou uma nova chave de recuperação.

## Limites do plano gratuito (Cloudflare)

Workers: 100 mil requisições/dia **para a conta inteira** (compartilhado com os outros Workers do dono). D1: 5 milhões de leituras/dia, 100 mil escritas/dia, 5 GB. Uma família com 3 aparelhos sincronizando a cada 60 s fica na casa de poucos milhares de requisições/dia; não se espera chegar ao limite, mas ele existe. Se ocorrer, o painel segue funcionando offline e sincroniza depois.

## Testes

- `node tools/teste-unidade.js` — criptografia, merge, motor de sincronização com servidor falso.
- `node sync-worker/teste-worker.mjs [URL]` — Worker real via curl-like (cria família descartável e exclui).
- `python3 tools/teste-sync.py` — dois perfis de navegador, cifrado, contra o Worker real (edição, exclusão, 60 s, ausência de texto claro).
- Depois de testes, nenhum dado de teste deve permanecer no D1 (`select count(*)` nas 4 tabelas = 0).

## Coleções que saíram do app

`lembretes`, `habitos` e `checks` (rotina) não existem mais. O aparelho atualizado não envia essas coleções e apaga da nuvem os itens que ainda estavam lá. Se um aparelho com a versão antiga mandar algum item delas, o novo aceita e ignora, e a sincronização segue normal. Backups antigos importam e essas partes são descartadas.
