# Cadastro por voz — desenho (feature/gemini, NÃO publicado)

> Status: só desenho + esboço estático (`docs/voz-cadastro-esboco.html`). Nada disso está ligado no app ainda.

## 1. Arquitetura

```
🎤 fala ──► Web Speech API (SpeechRecognition pt-BR, já existe no botão de microfone do Ajudante)
        ──► transcrição (texto final, mostrado na tela para o usuário ver o que foi entendido)
        ──► POST /conversa (Worker minha-casa-assistente → Gemini com function calling, modo "cadastro")
        ──► functionCall estruturada (uma das ações abaixo)
        ──► VALIDAÇÃO no aparelho (js/ajudante-gemini.js: datas ISO não passadas, hora HH:MM, valor > 0,
            título 1–120, itens ≤ 20, pedido explícito de criar na fala) → JSON validado
        ──► CARTÃO de confirmação + leitura em voz alta (speechSynthesis, pt-BR)
        ──► "sim" falado ou toque em Confirmar ──► gravar (S.alterar / S.sanearItem) ──► "Gravado"
            "não"/Descartar ──► nada é gravado
```

Regras que não mudam: o modelo nunca grava nada; só o app grava, e só depois da confirmação. Dados de exemplo nunca saem do aparelho. Áudio não sai do aparelho (a transcrição é do navegador); só o texto vai ao Gemini.

## 2. Ações (functionDeclarations)

| Ação | Parâmetros | Vira no app |
|---|---|---|
| `criar_tarefa` | `titulo`, `data?` (AAAA-MM-DD), `prioridade?` (alta/media/baixa) | `tarefas[]` |
| `adicionar_lista_compras` | `itens[]` (strings, ≤ 20) | lista "Compras" (ver §5) |
| `criar_compromisso` | `titulo`, `data`, `hora?`, `local?` | `compromissos[]` |
| `criar_conta` | `titulo`, `vencimento`, `valor?` | `contas[]` (não mensal) |
| `criar_lembrete` | `titulo`, `data`, `hora?` | tarefa com prazo (+ notificação local, se permitida) |

Hoje o `/conversa` já tem `criar_sugestao` (tipo tarefa/compromisso/conta/lembrete/compras) — as 5 ações acima são a versão explícita dela. Campos faltando (ex.: data do compromisso) → o modelo pergunta ("Para que dia?") em vez de inventar; a resposta falada continua o mesmo cadastro (memória da conversa).

## 3. Estados da interface

| Estado | O que aparece | Voz | Saídas |
|---|---|---|---|
| **ouvindo** | microfone pulsando, texto parcial ao vivo, botão Parar | — | fala final → entendendo; silêncio 8 s → erro |
| **entendendo** | transcrição final + "Entendendo…" (spinner) | — | functionCall → confirmando; pergunta do modelo → ouvindo; falha → erro |
| **confirmando** | cartão: tipo, título, data, hora, valor, itens; botões Confirmar / Corrigir / Descartar | lê o resumo: "Criar tarefa Comprar pão para amanhã, sábado 31? Diga sim ou não." | "sim"/Confirmar → gravado; "não"/Descartar → descartado; Corrigir → ouvindo |
| **gravado** | ✓ "Gravado em Tarefas" + link Ver/Desfazer (10 s) | "Pronto, anotei." | — |
| **erro** | mensagem específica + Tentar de novo / Digitar | lê a mensagem | sem permissão de microfone; navegador sem SpeechRecognition (oferecer digitar); não entendi; Gemini indisponível/limite (cai no formulário manual pré-preenchido com a transcrição); sem internet |

Acessibilidade: tudo também por toque/teclado; `aria-live="polite"` no status; sem depender de voz para confirmar.

## 4. O que falta implementar

1. Worker: modo `cadastro` no `/conversa` com as 5 functionDeclarations (ou reaproveitar `criar_sugestao`) e `functionCallingConfig.mode = ANY` nesse modo.
2. App: máquina de estados (ouvindo → entendendo → confirmando → gravado/erro) no Ajudante, ligada ao botão de microfone já existente.
3. Confirmação por voz: após falar o resumo, abrir SpeechRecognition curto (5 s) aceitando sim/pode/confirmo × não/cancela; timeout → fica no cartão.
4. `speechSynthesis` pt-BR (escolher voz `pt-BR`, fallback silencioso se não houver).
5. Lista de compras (§5) — dados, tela e sanitização no store.
6. Lembrete com hora: notificação local (Notification API/SW) — opcional, só com permissão.
7. Desfazer por 10 s após gravar.
8. Testes: unidade da validação de cada ação, browser (estados e botões), bateria de frases faladas reais (com ruído, "amanhã", "dia 20", "às 10h").
9. Aviso de privacidade: o texto transcrito vai ao Gemini (plano gratuito pode usar para melhorar modelos).

## 5. Proposta de lista de compras (o app não tem)

- Dado: `s.compras = [{ id, item, qtd?, feito:false, criado }]` (sanitizado em `store.js`, mesmo padrão de `tarefas`); sincroniza junto com o resto.
- Tela: aba "Compras" dentro de Tarefas (chip ao lado das listas) com campo "adicionar item", itens agrupados em Pendentes/Comprados, "Limpar comprados".
- Voz: "adiciona leite, ovos e café na lista de compras" → `adicionar_lista_compras{itens:["leite","ovos","café"]}` → cartão com os 3 itens (dá para tirar algum) → grava; duplicados pendentes não se repetem.
- Até existir, a ação cai como **uma tarefa** "Compras: leite, ovos, café" (é o que `criar_sugestao` tipo `compras` faz hoje).
