# Contas fixas sugeridas (contas de casa)

Lista **genérica** de contas mensais/anuais (nome, dia do vencimento, forma de pagamento e, no máximo, o nome do banco). **Nunca valores** e nunca números de conta: o repositório é público. Cada conta fica em `contas` (a mesma coleção das demais), então **edição, exclusão, avisos, `.ics` e sincronização cifrada** funcionam sem nada novo.

## Como as contas chegam
- **Automático, uma única vez:** na 1ª abertura, se a lista de contas de casa estiver **vazia** (só os exemplos do `dados.json` contam como vazia), o app carrega as contas sugeridas, **remove as contas de exemplo** (seriam duplicatas) e mostra um aviso discreto em *Família* com **Desfazer** / **Ok**. A flag `config.fixasAuto` impede de repetir (mesmo que você apague tudo depois). Se já existirem contas reais, só registra a flag. **Com a nuvem ligada não roda** (o conteúdo vem da família); use o botão.
- **Botão "Adicionar contas fixas sugeridas":** em *Contas a pagar* (aba Em aberto) e em *Gerenciar → Contas a pagar → Contas de casa*. **Idempotente:** cada conta tem id estável `fixa-<chave>` e o campo `fixa`; só cria as que faltam. Também repõe uma que você apagou.
- **Desfazer** remove só as fixas **intocadas** (sem valor nem pagamento marcados) e some com o aviso. As contas de exemplo substituídas não voltam.

## A lista (dia → forma)
Escola 5 Boleto · Aluguel 6 Pix · Luz 4 Débito automático (Bradesco) · Pensão 6 Pix · Internet (Vivo) 12 Débito automático · IPTU 16 Gerar boleto · Financiamento do imóvel 15 Débito automático (Itaú) · IPVA / licenciamento / multas **anual, julho, dia 10** (Outro; "Pagar pelo acesso veículo do Itaú") · Cartão Nubank 21 Gerar boleto · Água 22 Gerar boleto · Cartão Itaú Black 28 Débito automático (Itaú).
Edite tudo em **Gerenciar → Contas a pagar → Contas de casa**; a lista aparece ordenada pelo **próximo vencimento**.

## Regras
- **Valor opcional.** Sem valor aparece "sem valor" (discreto). Pago/aberto é **sempre manual**, por mês (`pagas['AAAA-MM']`).
- **Início (`desde`)** = mês em que foi criada: não gera atrasos de meses anteriores. Mas as do mês atual com dia já passado aparecem **vencidas** até você marcar como paga (ex.: em 24/10, Água dia 22).
- **Arquivar** (campo "Arquivada") pausa a conta: some de pendências, listas, histórico e `.ics`, sem apagar. **Remover** apaga.
- **Anual** (`anual: true`, `mes`, `dia`): um vencimento por ano; só aparece nos **120 dias antes** (ou até 62 dias depois, se vencida). Marcar paga vale para aquele ano (`pagas['2027-07']`); no ano seguinte volta em aberto.
- **Atenção agora:** contas/faturas que vencem em **até 5 dias** são destacadas (selo âmbar); vencidas em vermelho; ordenado por urgência.

## Forma de pagamento (`forma`) e "Banco/observação" (`obs`, ≤ 60 caracteres)
`boleto`, `pix`, `debito`, `gerar`, `outro`. Aparece como selo na lista e há filtro por forma em *Contas a pagar*.
- **Gerar boleto:** aviso extra **5 dias antes** ("Gerar o boleto") em Atenção agora, nas notificações (mesmo que 5 dias não esteja nas antecedências escolhidas) e no `.ics` (evento "Gerar boleto: …" na data −5).
- **Débito automático:** "Confira o saldo na conta" nos **2 dias antes** (notificação extra 1 dia antes, alarme extra no `.ics`). **Não é tratado como pago**: continua em aberto até marcar manualmente.

## Cartão Nubank / Cartão Itaú Black × fatura importada
Essas contas têm `cartaoRef` ("nubank" / "itau black"): se existir **fatura importada** (não-teste) de um cartão cujo apelido contenha esse texto, **no mês do vencimento da fatura** a fatura representa a conta (valor, pago/aberto) e a conta **não aparece em duplicidade** (nem entra duas vezes nos totais/histórico). A fatura herda a forma de pagamento e o banco da conta. Sem fatura no mês, a conta vale sozinha, sem valor. O vínculo é por **nome do cartão** (campo "Fatura de cartão vinculada" ao editar), não por número de final.

## Sincronização
Nada novo: `contas` já é sincronizada cifrada ponta a ponta (itens < 8 KB). Os ids estáveis `fixa-*` evitam duplicatas se dois aparelhos carregarem a lista. Flags novas em `config` (compartilhadas): `fixasAuto`, `fixasAviso`.

## Testes
`node tools/teste-financeiro.js` (lista, idempotência, anual, avisos, lembretes, `.ics`, vínculo com fatura, carga automática, desfazer), `python3 tools/teste-contas-fixas.py` (tela: carga única, botão, desfazer, selo/filtro, edição, sanear) e `tools/teste-unidade.js` (sincronização).
