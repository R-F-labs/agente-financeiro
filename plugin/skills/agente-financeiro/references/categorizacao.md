# Categorização

O servidor aplica primeiro as regras aprendidas. Uma regra pode estar ligada ao **CPF/CNPJ** de quem recebeu ou pagou (quando a descrição do Pix, TED ou boleto traz o número) ou ao **nome** do beneficiário. A regra pelo CPF/CNPJ vale mais: reconhece a mesma empresa mesmo quando o banco imprime o nome de outro jeito. Você só cuida do que sobrou em `uncategorized`.

## Lista de categorias do usuário

Se o usuário mandar a própria lista de categorias (por exemplo, entradas: salário, colaboração, distribuição de lucros; saídas: alimentação, saúde, lazer), registre tudo de uma vez com `import_categories`, com `kind` (`income` ou `expense`), `group` e `name`. Se ele mandar também exemplos de como identificar cada uma ("o CNPJ X é a minha empresa, é distribuição de lucros"; "Padaria do Zé é padaria"), envie em `examples`: eles viram regras confirmadas. Use `apply_to_uncategorized: true` para aplicar as regras novas ao que ainda está sem categoria e informe quantos lançamentos foram categorizados.

## Como sugerir

Para cada lançamento sem categoria, escolha a categoria mais provável considerando beneficiário, descrição, valor e o histórico (`list_category_rules`). Use **somente** categorias existentes (`list_categories`).

### Pesquisar quem é a empresa

Quando o lançamento traz um **CNPJ** ainda desconhecido (`counterparty.kind: "cnpj"` e `known: false`), pesquise antes de sugerir:

1. Chame `lookup_counterparty` com o `transaction_id` (ou o `tax_id`). A ferramenta consulta o cadastro público da Receita Federal e devolve razão social, nome fantasia, atividade principal (CNAE) e uma sugestão de categoria. O resultado fica guardado, então a mesma empresa não é pesquisada de novo.
2. Use a atividade para decidir. Exemplo: a razão social é "IFOOD.COM AGENCIA DE RESTAURANTES ONLINE", portanto a compra é de alimentação (delivery). Na resposta ao usuário, cite o que encontrou ("pesquisei o CNPJ: é o iFood").
3. Plataformas que vendem de tudo (marketplaces, maquininhas, bancos digitais) não revelam o que foi comprado: nesses casos, pergunte.
4. Ao registrar com `categorize_transactions` e `remember: true`, a regra fica ligada ao CNPJ. Da próxima vez, os lançamentos dessa empresa entram já categorizados.

Para **CPF** (pessoa física), a ferramenta não consulta nada, por privacidade: pergunte ao usuário quem é e registre a resposta como regra. `list_counterparties` mostra as empresas já conhecidas.

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

Regras confirmadas pelo usuário prevalecem sobre sugestões automáticas. Pelo mesmo motivo, uma chamada com `source: "assistant"` nunca troca a categoria que o usuário escolheu: esses lançamentos voltam em `skippedManual`. Categorizações com 25 ou mais lançamentos pedem confirmação (veja `seguranca.md`). Com 2 ou 3 meses de uso, a maior parte dos lançamentos passa a ser categorizada sozinha.

## Casos especiais

- Transferências entre contas próprias, aplicações, resgates e pagamento de fatura não têm categoria: não entram no fluxo de caixa.
- Juros e IOF de crédito, tarifas e anuidade: grupo "Serviços financeiros".
- Renegociação e empréstimos: grupo "Dívidas".
- Se o usuário quiser uma categoria nova, crie com `upsert_category` antes de categorizar.
