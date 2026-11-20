# Categorização

O servidor aplica primeiro as regras aprendidas (beneficiário → categoria). Você só cuida do que sobrou em `uncategorized`.

## Como sugerir

Para cada lançamento sem categoria, escolha a categoria mais provável considerando beneficiário, descrição, valor e o histórico (`list_category_rules`). Use **somente** categorias existentes (`list_categories`).

Não sugira categoria quando não houver segurança, por exemplo:

- Pix para pessoa física sem histórico.
- Nome genérico ou código sem significado.
- Valores que podem ser tanto receita quanto reembolso.

## Como confirmar com o usuário

1. Agrupe por beneficiário e mostre uma tabela curta: beneficiário, quantidade, valor total, categoria sugerida (ou "?").
2. Pergunte o que estiver como "?" e peça confirmação das sugestões em bloco.
3. Registre com `categorize_transactions`:
   - `source: "user"` quando o usuário escolheu ou confirmou;
   - `remember: true` (padrão) para virar regra;
   - `apply_to_similar: true` para aplicar aos demais lançamentos iguais.

Regras confirmadas pelo usuário prevalecem sobre sugestões automáticas. Com 2 ou 3 meses de uso, a maior parte dos lançamentos passa a ser categorizada sozinha.

## Casos especiais

- Transferências entre contas próprias, aplicações, resgates e pagamento de fatura não têm categoria: não entram no fluxo de caixa.
- Juros e IOF de crédito, tarifas e anuidade: grupo "Serviços financeiros".
- Renegociação e empréstimos: grupo "Dívidas".
- Se o usuário quiser uma categoria nova, crie com `upsert_category` antes de categorizar.
