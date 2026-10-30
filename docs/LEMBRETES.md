# Lembretes de contas e faturas

O que o app faz e o que **não** faz, sem prometer o impossível.

## O que funciona
- **Com o app aberto:** a seção **Atenção agora** (tela Hoje) e o emblema do menu *Contas a pagar* mostram contas vencidas, a vencer em 0–3 dias e faturas abertas. Nada depende de internet.
- **Notificação do sistema (opcional):** em *Gerenciar → Ajustes*, ligue os avisos e autorize as notificações. O app avisa **3 dias antes, 1 dia antes e no dia**, 1 vez cada, e as **vencidas** 1 vez por dia, nunca de madrugada (só depois das 8 h, horário de São Paulo). Cada aviso é registrado para não repetir (`painelsala.lembretes.enviados`).
- **Adicionar ao calendário (.ics):** gera um evento com alarme (VALARM) por antecedência. **É o jeito confiável**: o alarme fica no calendário do celular e toca mesmo com o app fechado.

## O que não é garantido
- **App fechado, Android (Chrome, app instalado):** o app registra uma *sincronização periódica em segundo plano* e o service worker confere a agenda gravada. Quem decide **se e quando** roda é o Android/Chrome (pode atrasar horas ou não rodar, principalmente com economia de bateria). Não conte com isso para uma conta importante.
- **iPhone/Safari:** não há aviso com o app fechado.
- Os avisos **não pagam nem confirmam pagamento**. "Pago" é o que você marca.

## Opção futura (não construída)
Aviso confiável com o app fechado exigiria **Web Push**: um Worker com *cron* na Cloudflare enviando push para os aparelhos inscritos (chaves VAPID, tabela de inscrições no D1, e um e-mail/cron diário). Funciona no Android e no iPhone com o app instalado, mas precisa de servidor, guarda um identificador de cada aparelho e consome requests do plano gratuito (conta compartilhada). **Só será feito com o seu OK.**

## Teste
`python3 tools/teste-financas.py` (relógio falso: 3, 1 e 0 dias; sem repetir; vencida 1×/dia; nada de madrugada; agenda para o service worker) e `node tools/teste-financeiro.js` (.ics válido).

## Forma de pagamento
Contas com **Gerar boleto** avisam também 5 dias antes; **Débito automático** lembra de conferir o saldo (1–2 dias antes) e nunca é dado como pago. Detalhes em [CONTAS-FIXAS.md](CONTAS-FIXAS.md).
