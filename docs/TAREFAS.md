# Tarefas: Todos, Lista e Quadro

- **Todos**: primeiro chip da tela Tarefas; mostra as tarefas de todas as listas, cada uma com a etiqueta da lista.
- **Lista / Quadro**: alternador no topo. A Lista é a de sempre (marca como feita ao tocar). O Quadro mostra só as pendentes, em colunas por prazo, com a contagem no título.

## Colunas do Quadro (regra simples, em `js/dominio.js`)

| Coluna | Quando a tarefa aparece | Ao mover para ela |
|---|---|---|
| Atrasadas | prazo antes de hoje | não aceita (não é destino) |
| Hoje | prazo = hoje | prazo vira hoje |
| Esta semana | semana corrente (segunda a domingo): de amanhã até domingo; no domingo a coluna fica vazia | prazo vira o domingo desta semana (no domingo, hoje) |
| Depois | depois desse domingo | prazo vira hoje + 14 dias |
| Sem data | sem prazo | o prazo é apagado |

Mover: arrastar o cartão (computador) ou usar o seletor "Mover para" em cada cartão (teclado, leitor de tela e celular). Só o campo `vence` muda; o formato dos dados é o mesmo.

Testes: `node tools/teste-tarefas.js` (regras) e `python3 tools/teste-tarefas-tela.py --chrome <caminho>` (tela).
