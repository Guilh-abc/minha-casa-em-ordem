# Bateria Gemini (2026-10-30T20:40:28.068Z)

**51/53 acertos**

| # | Pergunta | Modelo | OK | Ferramentas | Resposta |
|---|---|---|---|---|---|
| 1 | Oi tudo bem eu tenho alguma conta atrasada hoje | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"atrasadas"} | - Água: R$ 87,40 (vencida em ter, 27/10) |
| 2 | Quais são as minhas três tarefas | gemini-3.5-flash-lite | ✅ | listar_tarefas{"limite":3,"filtro":"pendentes"} | - Trocar filtro da geladeira (prazo: qua, 28/10, alta, lista Casa) ⏎ - Comprar ração (prazo: sex, 30/10, alta, lista Casa) ⏎ - Renovar seguro do carro (prazo: qua, 04/11, media, lista Carro) |
| 3 | Qual o meu próximo evento na agenda | gemini-3.5-flash-lite | ✅ | proximo_evento{} | - Dentista da Ana (sex, 30/10 às 15:30, local: Clínica Sorriso) |
| 4 | pronto o quê | gemini-3.5-flash-lite | ✅ | listar_tarefas{"filtro":"atrasadas"} | - Trocar filtro da geladeira (prazo: qua, 28/10, alta, lista Casa) |
| 5 | tem conta atrasada? | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"atrasadas"} | - Água (vencimento: ter, 27/10, valor: R$ 87,40) |
| 6 | quanto eu devo de conta atrasada | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"atrasadas"} | - Total de contas atrasadas: R$ 87,40 (Água, vencimento em ter, 27/10) |
| 7 | o que vence essa semana | gemini-3.5-flash-lite | ✅ | listar_contas{"ate":"2026-11-06","status":"abertas","de":"2026-10-30"} | - Luz (vence hoje, R$ 215,37) ⏎ - Internet (vence em ter, 03/11, R$ 119,90) ⏎ - Escola (vence em qui, 05/11, R$ 1.450,00) |
| 8 | quais contas vencem hj | gemini-3.5-flash-lite | ✅ | listar_contas{"de":"2026-10-30","status":"abertas","ate":"2026-10-30"} | - Luz (vence hoje, R$ 215,37) |
| 9 | quanto vai dar a escola | gemini-3.5-flash-lite | ✅ | listar_contas{"de":"2026-10-30","status":"abertas","ate":"2026-11-05"} | - Escola: R$ 1.450,00 (vence em qui, 05/11) |
| 10 | qnd vence a internet | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"todas"} | - Internet: vence em terça-feira, 03/11/2026 (R$ 119,90) |
| 11 | qual a conta mais cara em aberto | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"abertas"} | - A conta mais cara em aberto é a Escola, no valor de R$ 1.450,00 (vence em 05/11). |
| 12 | ja paguei o aluguel? | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"todas"} | - Sim, o Aluguel de R$ 2.500,00 foi pago em 04/10. |
| 13 | quanto eu tenho pra pagar esse mes | gemini-3.5-flash-lite | ✅ | listar_contas{"ate":"2026-10-31","status":"abertas","de":"2026-10-01"} | - Você tem R$ 302,77 em contas em aberto para pagar este mês. São 2 contas: Água (R$ 87,40) e Luz (R$ 215,37). |
| 14 | tem algum boleto vencendo amanha | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"abertas","de":"2026-10-31","ate":"2026-10-31"} | - Não encontrei nenhum boleto vencendo amanhã (31/10) nas contas em aberto. |
| 15 | quais as contas do mes que vem | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"abertas","ate":"2026-11-30","de":"2026-11-01"} | - Você tem R$ 2.349,90 em contas em aberto para o mês que vem (novembro): ⏎ - Internet: R$ 119,90 (vencimento ter, 03/11) ⏎ - Escola: R$ 1.450,00 (vencimento qui, 05/11) ⏎ - Condomínio: R$ 780,00 (vencimento ter, 10/11) |
| 16 | qual o valor da conta de luz | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"todas"} | - A conta de Luz é R$ 215,37 e vence hoje (sex, 30/10). |
| 17 | a agua ta atrasada ha quantos dias | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"atrasadas"} | - A conta de Água está atrasada há 3 dias (venceu em ter, 27/10) e o valor é R$ 87,40. |
| 18 | oq tenho na agenda hj | gemini-3.5-flash-lite | ✅ | buscar_agenda{"ate":"2026-10-30","de":"2026-10-30"} | - 08:00 Reunião da escola ⏎ - 15:30 Dentista da Ana (Clínica Sorriso) |
| 19 | e amanhã? | gemini-3.5-flash-lite | ✅ | buscar_agenda{"de":"2026-10-31","ate":"2026-10-31"} | - 09:00 Futebol do Pedro |
| 20 | tenho compromisso amanha | gemini-3.5-flash-lite | ✅ |  | - 09:00 Futebol do Pedro |
| 21 | que horas é o dentista | gemini-3.5-flash-lite | ✅ | buscar_agenda{"ate":"2026-11-06","de":"2026-10-30"} | - 30/10 (sex) às 15:30 - Dentista da Ana (Clínica Sorriso) |
| 22 | onde é o dentista | gemini-3.5-flash-lite | ✅ |  | - 30/10 (sex) às 15:30 - Dentista da Ana (Clínica Sorriso) |
| 23 | qnd é o aniversario da vo | gemini-3.5-flash-lite | ✅ | buscar_agenda{"de":"2026-10-30","ate":"2026-11-30"} | - 02/11 (seg) o dia todo - Aniversário da vó |
| 24 | tenho medico essa semana? | gemini-3.5-flash-lite | ✅ | buscar_agenda{"de":"2026-10-30","ate":"2026-11-06"} | Não encontrei médico na sua agenda para esta semana. Os compromissos são: ⏎ - 30/10 (sex) às 08:00 - Reunião da escola ⏎ - 30/10 (sex) às 15:30 - Dentista da Ana (Clínica Sorriso) ⏎ - 31/10 (sáb) às 09:00 - Futebol do Pedro ⏎ - 02/11 (seg) o dia todo - Aniversário da vó |
| 25 | minha agenda da semana | gemini-3.5-flash-lite | ✅ | buscar_agenda{"ate":"2026-11-06","de":"2026-10-30"} | - 30/10 (sex) às 08:00 - Reunião da escola ⏎ - 30/10 (sex) às 15:30 - Dentista da Ana (Clínica Sorriso) ⏎ - 31/10 (sáb) às 09:00 - Futebol do Pedro ⏎ - 02/11 (seg) o dia todo - Aniversário da vó |
| 26 | tem algo marcado dia 12 | gemini-3.5-flash-lite | ✅ | buscar_agenda{"ate":"2026-11-12","de":"2026-11-12"} | - 12/11 (qui) às 14:00 - Médico |
| 27 | qual meu compromisso depois do dentista | gemini-3.5-flash-lite | ✅ | buscar_agenda{"ate":"2026-11-06","de":"2026-10-30"} | Depois do dentista da Ana, o próximo compromisso da sua agenda é: ⏎ - 31/10 (sáb) às 09:00 - Futebol do Pedro |
| 28 | quais sao minhas tarefas | gemini-3.5-flash-lite | ✅ | listar_tarefas{"filtro":"pendentes"} | - Trocar filtro da geladeira (Casa) - prazo: 28/10 (alta) ⏎ - Comprar ração (Casa) - prazo: 30/10 (alta) ⏎ - Renovar seguro do carro (Carro) - prazo: 04/11 (média) ⏎ - Levar roupa na costureira (Casa) - sem prazo (média) ⏎ - Pintar o portão (Casa) - sem prazo (baixa) |
| 29 | tarefas de prioridade alta | gemini-3.5-flash-lite | ✅ | listar_tarefas{"filtro":"alta"} | - Trocar filtro da geladeira (Casa) - prazo: qua, 28/10 ⏎ - Comprar ração (Casa) - prazo: sex, 30/10 |
| 30 | tem tarefa atrasada | gemini-3.5-flash-lite | ✅ | listar_tarefas{"filtro":"atrasadas"} | - Trocar filtro da geladeira (Casa) - prazo: qua, 28/10 (alta) |
| 31 | o que eu tenho q fazer hj | - | ❌ ERRO O Gemini está indisponível agora. |  | O Gemini está indisponível agora. Por enquanto consigo responder: o que vence essa semana, contas atrasadas, minhas tarefas, agenda de hoje/amanhã. |
| 32 | quantas tarefas eu tenho | gemini-3.5-flash-lite | ✅ | listar_tarefas{"filtro":"pendentes"} | Você tem 5 tarefas pendentes no total. |
| 33 | quais tarefas ja terminei | gemini-3.5-flash-lite | ✅ | listar_tarefas{"filtro":"concluidas"} | - Pagar IPTU (Casa) |
| 34 | tarefas do carro | gemini-3.5-flash-lite | ✅ | listar_tarefas{"lista":"Carro","filtro":"pendentes"} | - Renovar seguro do carro (prazo: qua, 04/11, prioridade: média) |
| 35 | qual a tarefa mais urgente | gemini-3.5-flash-lite | ✅ | listar_tarefas{"filtro":"alta"} | - Trocar filtro da geladeira (prazo: qua, 28/10, prioridade: alta) ⏎ - Comprar ração (prazo: sex, 30/10, prioridade: alta) |
| 36 | me lembra de comprar pão amanhã | gemini-3.5-flash-lite | ✅ | criar_sugestao{"tipo":"tarefa","data":"2026-10-31","titulo":"Comprar pão"} | Preparei o lembrete para comprar pão amanhã e estou aguardando a sua confirmação no cartão! [card: {"tipo":"tarefa","titulo":"Comprar pão","data":"2026-10-31","prio":"media"}] |
| 37 | cria uma tarefa trocar lâmpada da sala prioridade alta | gemini-3.5-flash-lite | ✅ | criar_sugestao{"data":"2026-10-30","prioridade":"alta","titulo":"Trocar lâmpada da sala","tipo":"tarefa"} | Preparei a tarefa Trocar lâmpada da sala com prioridade alta e estou aguardando a sua confirmação no cartão! [card: {"tipo":"tarefa","titulo":"Trocar lâmpada da sala","data":"2026-10-30","prio":"alta"}] |
| 38 | marca dentista dia 20/11 as 10h | gemini-3.5-flash-lite | ✅ | criar_sugestao{"tipo":"compromisso","hora":"10:00","data":"2026-11-20","titulo":"Dentista"} | Preparei o compromisso Dentista para o dia 20/11/2026 às 10:00 e estou aguardando a sua confirmação no cartão! [card: {"tipo":"compromisso","titulo":"Dentista","data":"2026-11-20","hora":"10:00"}] |
| 39 | anota a conta do gás de 120 reais pra dia 15/11 | gemini-3.5-flash-lite | ❌ (anti-invenção) |  | O Gemini citou algo fora dos dados. Por enquanto consigo responder: o que vence essa semana, contas atrasadas, minhas tarefas, agenda de hoje/amanhã. |
| 40 | adiciona leite ovos e café na lista de compras | gemini-3.5-flash-lite | ✅ | criar_sugestao{"titulo":"Lista de compras","tipo":"compras","itens":["leite","ovos","café"]} | Preparei a lista de compras com leite, ovos e café e estou aguardando a sua confirmação no cartão! [card: {"tipo":"tarefa","titulo":"Lista de compras: leite, ovos, café","data":"","prio":"media"}] |
| 41 | quais minhas tarefas pra hoje | gemini-3.5-flash-lite | ✅ | listar_tarefas{"filtro":"hoje"} | - Comprar ração (Casa, alta, prazo: sex, 30/10) |
| 42 | tem conta atrazada | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"atrasadas"} | - Água no valor de R$ 87,40, vencida em ter, 27/10 |
| 43 | quais minhs tarefsa | gemini-3.5-flash-lite | ✅ | listar_tarefas{"filtro":"pendentes"} | - Trocar filtro da geladeira (Casa, alta, prazo: qua, 28/10) ⏎ - Comprar ração (Casa, alta, prazo: sex, 30/10) ⏎ - Renovar seguro do carro (Carro, média, prazo: qua, 04/11) ⏎ - Levar roupa na costureira (Casa, média, sem prazo) ⏎ - Pintar o portão (Casa, baixa, sem prazo) |
| 44 | proximo compromiso | gemini-3.5-flash-lite | ✅ | proximo_evento{} | - Dentista da Ana hoje, 30/10, às 15:30 (Local: Clínica Sorriso) |
| 45 | oque venc essa semna | gemini-3.5-flash-lite | ✅ | listar_contas{"ate":"2026-11-06","status":"abertas","de":"2026-10-30"} | - Luz: R$ 215,37 (vence hoje, 30/10) ⏎ - Internet: R$ 119,90 (ter, 03/11) ⏎ - Escola: R$ 1.450,00 (qui, 05/11) |
| 46 | qto ta a cont de luz | gemini-3.5-flash-lite | ✅ | listar_contas{"status":"todas"} | - Luz: R$ 215,37 (vence hoje, 30/10) |
| 47 | agnda de amanha | gemini-3.5-flash-lite | ✅ | buscar_agenda{"ate":"2026-10-31","de":"2026-10-31"} | - Futebol do Pedro: amanhã, 31/10 às 09:00 |
| 48 | bom dia! como ta minha semana? | gemini-3.5-flash-lite | ✅ | buscar_agenda{"ate":"2026-11-06","de":"2026-10-30"} | Bom dia! Os compromissos desta semana são: ⏎ - Reunião da escola: hoje, 30/10 às 08:00 ⏎ - Dentista da Ana: hoje, 30/10 às 15:30 (Clínica Sorriso) ⏎ - Futebol do Pedro: amanhã, 31/10 às 09:00 ⏎ - Aniversário da vó: seg, 02/11 (dia todo) |
| 49 | tenho alguma coisa urgente? | gemini-3.5-flash-lite | ✅ | listar_tarefas{"filtro":"alta"} | As tarefas urgentes (prioridade alta) são: ⏎ - Trocar filtro da geladeira (prazo: qua, 28/10) ⏎ - Comprar ração (prazo: sex, 30/10) |
| 50 | qual a capital da frança | gemini-3.5-flash-lite | ✅ |  | A capital da França é Paris. |
| 51 | valeu! | gemini-3.5-flash-lite | ✅ |  | Por nada! Se precisar de mais alguma coisa, é só chamar. |
| 52 | resume minha sexta pra mim | gemini-3.5-flash-lite | ✅ | buscar_agenda{"de":"2026-10-30","ate":"2026-10-30"} | Para hoje (30/10): ⏎ - 08:00 - Reunião da escola ⏎ - 15:30 - Dentista da Ana (Clínica Sorriso) |
| 53 | e as contas? | gemini-3.5-flash-lite | ✅ | listar_contas{"de":"2026-10-30","status":"abertas","ate":"2026-10-30"} | - Luz (vence hoje): R$ 215,37 |
