# Configuração inicial

Conduza a configuração como uma conversa curta, uma etapa por vez. Não peça tudo de uma vez.

## 1. Pasta de dados

1. Explique em uma frase: os dados ficam numa pasta do computador do usuário; nada vai para servidores.
2. Pergunte onde guardar. Sugira o `suggestedDataDir` retornado por `get_status` e recomende uma pasta dentro do Google Drive, OneDrive ou iCloud Drive: assim há cópia na nuvem e as planilhas podem ser abertas no celular.
3. Chame `setup_workspace` com o caminho completo escolhido.
4. Informe onde ficam a base, os backups, a pasta de planilhas e a pasta `entrada` (onde o usuário pode deixar extratos e faturas, inclusive os protegidos por senha).

Se o agente já estiver configurado em outra pasta, `setup_workspace` pede confirmação antes de trocar. Os dados da pasta antiga não são apagados nem movidos.

Se o usuário já usou o agente antes e reinstalou o plugin, aponte `setup_workspace` para a mesma pasta: os dados existentes são reaproveitados.

## 2. Perfil

Pergunte e registre com `update_profile`:

- Nome completo como aparece nos extratos (usado para reconhecer transferências entre as próprias contas).
- Dia do mês para o fechamento (1 a 28).
- Perfil de investidor: conservador, moderado ou arrojado. Se o usuário não souber, faça 2 ou 3 perguntas simples sobre reação a perdas e prazo e sugira um perfil, deixando a decisão com ele.
- Horizonte de investimento em anos.
- Quantos meses de despesas a reserva de emergência deve cobrir (sugestão comum: 6).
- Restrições (ex.: "não quero ações").
- Limite de alerta de gastos: avisar quando uma categoria passar X% da média (sugestão: 30%).
- Opcional: token gratuito da brapi.dev para cotações de ações e FIIs.

## 3. Contas

Para cada banco, cartão e corretora, chame `upsert_account`:

- `checking` para conta corrente, `savings` para poupança, `credit_card` para cartão, `investment` para corretora.
- Apelido curto e claro ("Santander conta", "Nubank cartão").
- Apenas os 4 últimos dígitos.
- Cartões com mais de um final (físico e virtual): informe todos em `card_last4s`.
- Faturas de cartão: `tolerance_cents: 5` (as administradoras arredondam IOF e juros linha a linha).

## 4. Categorias

As categorias padrão já foram criadas. Mostre os grupos com `list_categories` e pergunte se o usuário quer ajustar algo. Crie ou renomeie com `upsert_category`.

## 5. Metas

Para cada meta: nome, valor alvo, prazo, quanto já tem guardado e prioridade (`upsert_goal`). Se o usuário não tiver metas, sugira começar pela reserva de emergência.

## 6. Primeiro documento

Peça o extrato mais recente de cada conta e siga `leitura-de-documentos.md`. Se algum documento tiver senha, o usuário pode escrever a senha junto com o pedido (veja `documentos-protegidos.md`). Explique que extratos com períodos sobrepostos podem ser enviados sem problema: o agente ignora lançamentos repetidos.

Ao terminar, resuma o que foi configurado em uma lista curta.
